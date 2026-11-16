import * as fs from 'fs';
import * as path from 'path';
import { Page } from 'playwright';

export type ModuleCode = 'AUTH' | 'A' | 'B' | 'C' | 'D' | 'E';

export interface StepLogEntry {
  stepNo: number;
  moduleCode: ModuleCode;
  date: string;
  time: string;
  timestampIso: string;
  actionType:
    | 'NAVIGATE'
    | 'FILL_INPUT'
    | 'SELECT_OPTION'
    | 'CLICK_BUTTON'
    | 'UPLOAD_FILE'
    | 'VERIFY';
  selectorId: string;
  progressText: string;
  resultText: string;
  durationMs: number;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';
  screenshotPath?: string;
}

export class StepLogger {
  private logs: StepLogEntry[] = [];
  private moduleSummary: Record<
    string,
    {
      title: string;
      route: string;
      status: string;
      startTime: string;
      endTime: string;
      durationSec: string;
      startEpoch: number;
    }
  > = {};
  private startTime: Date;
  private selectedSequence: ModuleCode[];
  private dataSource: string;

  constructor(selectedSequence: ModuleCode[], dataSource: string) {
    this.startTime = new Date();
    this.selectedSequence = selectedSequence;
    this.dataSource = dataSource;
  }

  private getFormattedDateTime() {
    const now = new Date();
    const date = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
    const time =
      now
        .toLocaleTimeString('id-ID', {
          timeZone: 'Asia/Jakarta',
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })
        .replace(/\./g, ':') +
      '.' +
      String(now.getMilliseconds()).padStart(3, '0') +
      ' WIB';
    return { date, time, iso: now.toISOString(), ms: now.getTime() };
  }

  startModule(code: ModuleCode, title: string, route = '-') {
    const { date, time, ms } = this.getFormattedDateTime();
    this.moduleSummary[code] = {
      title,
      route,
      status: 'RUNNING',
      startTime: `${date} ${time}`,
      endTime: '-',
      durationSec: '0.00 s',
      startEpoch: ms
    };

    console.log('\n┌──────────────────────────────────────────────────────────────────────────────────────┐');
    console.log(`│  ▶️  MODUL [${code}] : ${title.padEnd(68)}│`);
    console.log(`│  🕒 Waktu Mulai: ${`${date} ${time}`.padEnd(32)} 🌐 Route: ${route.padEnd(24)}│`);
    console.log('├──────┬──────────────┬────────────────────────────────────────┬──────────┬────────────┤');
    console.log('│ Step │ Jam (WIB)    │ Selector ID & Progres Aksi             │ Durasi   │ Status     │');
    console.log('├──────┼──────────────┼────────────────────────────────────────┼──────────┼────────────┤');
  }

  completeModule(code: ModuleCode, status: 'SUCCESS' | 'FAILED', errorMsg?: string) {
    const { date, time, ms } = this.getFormattedDateTime();
    const mod = this.moduleSummary[code];
    let durStr = '0.00 s';
    if (mod) {
      mod.status = status;
      mod.endTime = `${date} ${time}`;
      durStr = `${((ms - mod.startEpoch) / 1000).toFixed(2)} s`;
      mod.durationSec = durStr;
    }
    const badge = status === 'SUCCESS' ? '✅ SUCCESS' : '❌ FAILED ';
    console.log('├──────┴──────────────┴────────────────────────────────────────┴──────────┴────────────┤');
    console.log(
      `│  🏁 SELESAI MODUL [${code}]  •  Total Durasi: ${durStr.padEnd(10)} •  Status Akhir: ${badge.padEnd(16)}│`
    );
    if (errorMsg) {
      console.log(`│  ⚠️  Detail Error : ${errorMsg.slice(0, 65).padEnd(65)}│`);
    }
    console.log('└──────────────────────────────────────────────────────────────────────────────────────┘');
  }

  logProgress(
    moduleCode: ModuleCode,
    actionType: StepLogEntry['actionType'],
    selectorId: string,
    progressText: string
  ): number {
    const { date, time, iso } = this.getFormattedDateTime();
    const stepNo = this.logs.length + 1;
    this.logs.push({
      stepNo,
      moduleCode,
      date,
      time,
      timestampIso: iso,
      actionType,
      selectorId,
      progressText,
      resultText: '-',
      durationMs: Date.now(),
      status: 'RUNNING'
    });

    const stepStr = `#${String(stepNo).padStart(2, '0')}`.padEnd(4);
    const shortTime = time.slice(0, 12).padEnd(12);
    const shortSelector = selectorId.slice(0, 35).padEnd(35);
    console.log(`│ ${stepStr} │ ${shortTime} │ ⏳ ${shortSelector} │   ...    │ [RUNNING]  │`);
    console.log(`│      │              │    ├─ Aksi  : ${progressText.slice(0, 49).padEnd(49)}│`);
    return stepNo - 1;
  }

  markSuccess(index: number, resultText: string) {
    const entry = this.logs[index];
    if (!entry) return;
    const { date, time } = this.getFormattedDateTime();
    entry.durationMs = Date.now() - entry.durationMs;
    entry.status = 'SUCCESS';
    entry.resultText = resultText;

    const shortTime = time.slice(0, 12).padEnd(12);
    const durStr = `${entry.durationMs} ms`.padStart(8);
    console.log(
      `│      │ ${shortTime} │    ╰─ Hasil : ${resultText.slice(0, 24).padEnd(24)} │ ${durStr} │ ✔ SUCCESS  │`
    );
  }

  async failStep(page: Page, moduleCode: ModuleCode, selectorId: string, errorMessage: string) {
    const { date, time, iso } = this.getFormattedDateTime();
    const screenshotName = `error-${moduleCode}-${Date.now()}.png`;
    const screenshotPath = path.join(process.cwd(), 'reports', screenshotName);
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});

    this.logs.push({
      stepNo: this.logs.length + 1,
      moduleCode,
      date,
      time,
      timestampIso: iso,
      actionType: 'VERIFY',
      selectorId,
      progressText: 'Terjadi kegagalan pada langkah eksekusi',
      resultText: errorMessage,
      durationMs: 0,
      status: 'FAILED',
      screenshotPath
    });

    const shortTime = time.slice(0, 12).padEnd(12);
    console.error(
      `│  !!  │ ${shortTime} │    ╰─ ERROR : ${errorMessage.slice(0, 24).padEnd(24)} │     0 ms │ ✖ FAILED   │`
    );
  }

  printTerminalSummary() {
    const { date, time } = this.getFormattedDateTime();
    const totalSec = ((Date.now() - this.startTime.getTime()) / 1000).toFixed(2);
    const totalSteps = this.logs.length;
    const successSteps = this.logs.filter((l) => l.status === 'SUCCESS').length;
    const failedSteps = this.logs.filter((l) => l.status === 'FAILED').length;

    console.log('\n╔══════════════════════════════════════════════════════════════════════════════════════╗');
    console.log('║  📊  RINGKASAN AKHIR EKSEKUSI AUTOMASI E2E PORTAL SDI                                ║');
    console.log('╠══════════════════════════════════════════════════════════════════════════════════════╣');
    console.log(`║  📅  Tanggal & Jam Selesai : ${`${date}  ${time}`.padEnd(56)}║`);
    console.log(`║  🔀  Urutan Alur Dieksekusi: ${this.selectedSequence.join(' ➔ ').padEnd(56)}║`);
    console.log(
      `║  ⏱️   Total Durasi          : ${`${totalSec} detik (${successSteps}/${totalSteps} step berhasil, ${failedSteps} gagal)`.padEnd(56)}║`
    );
    console.log('╠══════╦═══════════════════════════════════════════════╦══════════════╦════════════════╣');
    console.log('║ Kode ║ Nama Modul                                    ║ Durasi       ║ Status Akhir   ║');
    console.log('╠══════╬═══════════════════════════════════════════════╬══════════════╬════════════════╣');
    Object.entries(this.moduleSummary).forEach(([code, m]) => {
      const badge = m.status === 'SUCCESS' ? '✅ SUCCESS' : '❌ FAILED ';
      console.log(
        `║  ${code}   ║ ${m.title.slice(0, 45).padEnd(45)} ║ ${m.durationSec.padEnd(12)} ║ ${badge.padEnd(14)} ║`
      );
    });
    console.log('╚══════╩═══════════════════════════════════════════════╩══════════════╩════════════════╝\n');
  }

  hasFailures(): boolean {
    return this.logs.some((l) => l.status === 'FAILED');
  }

  saveReports() {
    const reportsDir = path.join(process.cwd(), 'reports');
    fs.mkdirSync(reportsDir, { recursive: true });

    const { date, time } = this.getFormattedDateTime();
    const safeTime = time.slice(0, 8).replace(/:/g, '-');
    const baseFileName = `REPORT_E2E_${date}_${safeTime}`;
    const markdownPath = path.join(reportsDir, `${baseFileName}.md`);
    const jsonPath = path.join(reportsDir, `${baseFileName}.json`);

    fs.writeFileSync(
      jsonPath,
      JSON.stringify(
        {
          executionDate: date,
          executionTime: time,
          selectedSequence: this.selectedSequence,
          dataSource: this.dataSource,
          moduleSummary: this.moduleSummary,
          steps: this.logs
        },
        null,
        2
      ),
      'utf-8'
    );

    const mdLines: string[] = [
      `# Laporan Eksekusi Automasi E2E Portal SDI`,
      ``,
      `- **Tanggal Eksekusi**: ${date}`,
      `- **Waktu Selesai**: ${time}`,
      `- **Urutan Modul Dijalankan**: \`${this.selectedSequence.join(' -> ')}\``,
      `- **Sumber Data Form**: ${this.dataSource}`,
      ``,
      `## 1. Ringkasan Status Modul`,
      `| Kode | Nama Modul | Waktu Mulai | Waktu Selesai | Durasi | Status |`,
      `| :-: | :--- | :--- | :--- | :-: | :-: |`,
      ...Object.entries(this.moduleSummary).map(
        ([code, m]) =>
          `| **${code}** | ${m.title} | ${m.startTime} | ${m.endTime} | ${m.durationSec} | **${m.status}** |`
      ),
      ``,
      `## 2. Log Step-by-Step Pengisian Form (Berdasarkan Selector ID)`,
      `| No | Tanggal & Jam | Modul | Selector ID | Progres Aksi & Hasil Transisi | Durasi | Status |`,
      `| :-: | :--- | :-: | :--- | :--- | :-: | :-: |`,
      ...this.logs.map(
        (l) =>
          `| ${l.stepNo} | \`${l.date} ${l.time}\` | **${l.moduleCode}** | \`${l.selectorId}\` | ${l.progressText}<br/>**Hasil:** ${l.resultText} | ${l.durationMs} ms | **${l.status}** |`
      )
    ];

    fs.writeFileSync(markdownPath, mdLines.join('\n'), 'utf-8');
    return { markdownPath, jsonPath };
  }
}

