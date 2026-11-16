import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';

dotenv.config();

interface StepLogEntry {
  stepNo: number;
  moduleCode: string;
  date: string;
  time: string;
  timestampIso: string;
  actionType: string;
  selectorId: string;
  progressText: string;
  resultText: string;
  durationMs: number;
  status: string;
  screenshotPath?: string;
}

interface E2EReportData {
  executionDate: string;
  executionTime: string;
  selectedSequence: string[];
  dataSource: string;
  moduleSummary: Record<
    string,
    {
      title: string;
      route: string;
      status: string;
      startTime: string;
      endTime: string;
      durationSec: string;
    }
  >;
  steps: StepLogEntry[];
}

export interface AiDetectionResult {
  reportFile: string;
  analyzedAt: string;
  totalFailedSteps: number;
  popupRollbackDetected: boolean;
  detectedErrors: Array<{
    moduleCode: string;
    errorType: string;
    pageOrRoute: string;
    failingSelector: string;
    errorMessage: string;
    rootCauseAnalysis: string;
    avoidanceRule: {
      ruleId: string;
      action: string;
      recommendedConfig: Record<string, any>;
    };
  }>;
  executiveSummary: string;
  popupMengertiAnalysis?: {
    cause: string;
    impact: string;
    mitigationStrategy: string;
  };
  recommendations: string[];
}

export async function detectPageErrorsWithAi(
  specificReportPath?: string
): Promise<AiDetectionResult> {
  const reportsDir = path.join(process.cwd(), 'reports');

  let targetJsonPath = specificReportPath;
  if (!targetJsonPath) {
    if (!fs.existsSync(reportsDir)) {
      throw new Error(`Direktori reports tidak ditemukan di: ${reportsDir}`);
    }
    const jsonFiles = fs
      .readdirSync(reportsDir)
      .filter((f) => f.startsWith('REPORT_E2E_') && f.endsWith('.json'))
      .sort()
      .reverse();

    if (jsonFiles.length === 0) {
      throw new Error('Tidak ditemukan file report JSON di folder reports/');
    }
    targetJsonPath = path.join(reportsDir, jsonFiles[0]);
  }

  console.log(`\n🔍 [AI Error Detector] Membaca file report: ${path.basename(targetJsonPath)}`);
  const rawContent = fs.readFileSync(targetJsonPath, 'utf-8');
  const reportData = JSON.parse(rawContent) as E2EReportData;

  // Filter modul dan step yang mengalami kegagalan
  const failedSteps = reportData.steps.filter((s) => s.status === 'FAILED');
  const failedModules = Object.entries(reportData.moduleSummary)
    .filter(([_, m]) => m.status === 'FAILED')
    .map(([code, m]) => ({ code, ...m }));

  // Deteksi step-step terkait popup "Mengerti" atau anomali rollback navigasi
  const popupSteps = reportData.steps.filter(
    (s) =>
      s.selectorId.includes('Mengerti') ||
      s.progressText.toLowerCase().includes('mengerti') ||
      s.progressText.toLowerCase().includes('popup') ||
      s.progressText.includes('ANOMALI') ||
      s.resultText.toLowerCase().includes('rollback') ||
      s.resultText.includes('intercepts pointer events')
  );

  const hasPopupRollback = popupSteps.some(
    (s) =>
      s.progressText.includes('ANOMALI') ||
      s.resultText.toLowerCase().includes('kembali ke') ||
      s.resultText.toLowerCase().includes('rollback')
  );

  console.log(
    `📊 Ditemukan ${failedModules.length} modul FAILED, ${failedSteps.length} step FAILED, dan ${popupSteps.length} interaksi popup.`
  );

  if (failedSteps.length === 0 && failedModules.length === 0 && !hasPopupRollback) {
    console.log('✅ Tidak ditemukan kesalahan halaman dalam report ini! Semua modul SUKSES.');
    return {
      reportFile: path.basename(targetJsonPath),
      analyzedAt: new Date().toISOString(),
      totalFailedSteps: 0,
      popupRollbackDetected: false,
      detectedErrors: [],
      executiveSummary: 'Laporan bersih, tidak ditemukan kesalahan halaman atau kegagalan step.',
      recommendations: ['Pertahankan skenario pengujian saat ini.']
    };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MASUKKAN_GEMINI_API_KEY_ANDA_DI_SINI') {
    throw new Error(
      'GEMINI_API_KEY belum disetel pada file .env. Mohon setel GEMINI_API_KEY untuk menjalankan AI Error Detector.'
    );
  }

  const ai = new GoogleGenAI({ apiKey });
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  console.log(`🤖 Menghubungi Gemini AI API (${modelName}) untuk analisis kesalahan halaman & mitigasi...`);

  const prompt = `
Anda adalah Senior QA Automation & Reliability Engineer untuk Web Application Portal Satu Data Indonesia (SDI).
Tugas Anda adalah mendeteksi, mendiagnosis, dan membuat aturan mitigasi & pencegahan (avoidance rules) terhadap kesalahan halaman berdasarkan laporan eksekusi pengujian Playwright E2E berikut:

=== DATA LAPORAN EKSEKUSI ===
File: ${path.basename(targetJsonPath)}
Tanggal: ${reportData.executionDate} ${reportData.executionTime}
Data Source: ${reportData.dataSource}

Modul Gagal:
${JSON.stringify(failedModules, null, 2)}

Daftar Step Gagal:
${JSON.stringify(failedSteps, null, 2)}

Log Interaksi Popup / Modal:
${JSON.stringify(popupSteps, null, 2)}

Urutan Eksekusi Keseluruhan:
${reportData.selectedSequence.join(' -> ')}

=== FOKUS ANALISIS & PERTANYAAN KRITIS ===
1. Kesalahan Halaman Umum:
   - Mengapa step mengalami kegagalan (misalnya pointer-events intercepted oleh backdrop, timeout navigasi, atau elemen missing)?
2. KHUSUS KASUS POPUP "MENGERTI" & NAVIGASI KEMBALI KE HALAMAN SEBELUMNYA:
   - Di web application modern/SDI, saat popup alertdialog muncul dengan tombol "Mengerti", mengkliknya sering kali memicu callback router yang menavigasikan user kembali ke halaman sebelumnya (misal: router.back(), kembali ke dashboard, atau redirect login).
   - Analisis mengapa perilaku ini terjadi (apakah popup adalah error boundary, auth guard, konfirmasi pembatalan, atau peringatan hak akses).
   - Bagaimana mitigasi konkret agar automasi pengetesan TIDAK terlempar mundur atau bisa pulih secara otomatis:
     a) Cara penutupan alternatif (misal Escape key atau ikon close ✕ tanpa trigger handler router.back).
     b) Auto-recovery route guard (jika terdeteksi URL mundur, otomatis re-navigate ke target URL).
     c) Penanganan pointer-events / backdrop overlay yang menghalangi tombol submit setelah dialog tertutup.

=== FORMAT KELUARAN (HANYA JSON VALID) ===
{
  "totalFailedSteps": ${failedSteps.length},
  "popupRollbackDetected": ${hasPopupRollback || popupSteps.length > 0},
  "executiveSummary": "ringkasan eksekutif mendalam dalam bahasa Indonesia",
  "popupMengertiAnalysis": {
    "cause": "penjelasan mengapa klik 'Mengerti' memicu kembali ke halaman sebelumnya pada Portal SDI",
    "impact": "dampak terhadap alur automasi pengetesan",
    "mitigationStrategy": "strategi mitigasi komprehensif teknis"
  },
  "detectedErrors": [
    {
      "moduleCode": "kode modul (misal A, C, D, E)",
      "errorType": "Kategori (misal: POPUP_REDIRECT_ON_DISMISS / MODAL_BACKDROP_INTERCEPTION / NAVIGATION_TIMEOUT / ELEMENT_MISSING)",
      "pageOrRoute": "route atau url halaman",
      "failingSelector": "selector yang gagal",
      "errorMessage": "pesan error",
      "rootCauseAnalysis": "akar masalah teknis",
      "avoidanceRule": {
        "ruleId": "ID aturan unik, misal AVOID_POPUP_MENGERTI_ROLLBACK",
        "action": "tindakan pencegahan teknis",
        "recommendedConfig": {
          "timeoutMs": 15000,
          "waitUntil": "domcontentloaded",
          "guardAction": "tindakan guard"
        }
      }
    }
  ],
  "recommendations": [
    "rekomendasi teknis 1",
    "rekomendasi teknis 2",
    "rekomendasi teknis 3"
  ]
}
`.trim();

  const response = await ai.models.generateContent({
    model: modelName,
    contents: prompt,
    config: {
      responseMimeType: 'application/json'
    }
  });

  const responseText = response.text || '{}';
  const parsedAiResult = JSON.parse(responseText);

  const finalResult: AiDetectionResult = {
    reportFile: path.basename(targetJsonPath),
    analyzedAt: new Date().toISOString(),
    totalFailedSteps: failedSteps.length,
    popupRollbackDetected: parsedAiResult.popupRollbackDetected ?? hasPopupRollback,
    detectedErrors: parsedAiResult.detectedErrors || [],
    executiveSummary: parsedAiResult.executiveSummary || 'Analisis selesai.',
    popupMengertiAnalysis: parsedAiResult.popupMengertiAnalysis,
    recommendations: parsedAiResult.recommendations || []
  };

  // Simpan hasil ke file rules dan file markdown
  const avoidanceRulesJsonPath = path.join(reportsDir, 'page-avoidance-rules.json');
  fs.writeFileSync(
    avoidanceRulesJsonPath,
    JSON.stringify(finalResult, null, 2),
    'utf-8'
  );

  const timestamp = new Date()
    .toLocaleTimeString('id-ID', { hour12: false })
    .replace(/\./g, '-');
  const dateStr = new Date().toISOString().slice(0, 10);
  const analysisMdPath = path.join(
    reportsDir,
    `AI_PAGE_ERROR_ANALYSIS_${dateStr}_${timestamp}.md`
  );

  const mdContent = generateMarkdownReport(finalResult, reportData);
  fs.writeFileSync(analysisMdPath, mdContent, 'utf-8');

  console.log(`\n✅ [AI Error Detector] Analisis & Mitigasi selesai:`);
  console.log(`   📁 File Aturan Pencegahan JSON : ${avoidanceRulesJsonPath}`);
  console.log(`   📄 File Laporan Analisis AI MD : ${analysisMdPath}\n`);

  printTerminalAiSummary(finalResult);

  return finalResult;
}

function generateMarkdownReport(
  res: AiDetectionResult,
  reportData: E2EReportData
): string {
  const lines: string[] = [
    `# 🤖 Laporan Deteksi & Analisis Kesalahan Halaman (Gemini AI)`,
    ``,
    `- **File Report Asal**: \`${res.reportFile}\``,
    `- **Waktu Analisis**: ${res.analyzedAt}`,
    `- **Jumlah Step Gagal**: **${res.totalFailedSteps}**`,
    `- **Deteksi Anomali Popup Rollback**: **${res.popupRollbackDetected ? 'YA (Terdeteksi / Diwaspadai)' : 'TIDAK'}**`,
    ``,
    `## 1. Ringkasan Eksekutif`,
    res.executiveSummary,
    ``
  ];

  if (res.popupMengertiAnalysis) {
    lines.push(`## 2. 🔍 Analisis Khusus: Popup "Mengerti" & Perilaku Kembali ke Halaman Sebelumnya`);
    lines.push(`- **Akar Penyebab Perilaku (Cause)**:`);
    lines.push(`  > ${res.popupMengertiAnalysis.cause}`);
    lines.push(`- **Dampak pada Automasi (Impact)**:`);
    lines.push(`  > ${res.popupMengertiAnalysis.impact}`);
    lines.push(`- **Strategi Mitigasi yang Diterapkan (Mitigation Strategy)**:`);
    lines.push(`  > ${res.popupMengertiAnalysis.mitigationStrategy}`);
    lines.push(``);
  }

  lines.push(`## 3. Rincian Kesalahan Halaman & Aturan Penghindaran (Avoidance Rules)`, ``);

  res.detectedErrors.forEach((err, idx) => {
    lines.push(`### Error #${idx + 1}: Modul ${err.moduleCode} - ${err.errorType}`);
    lines.push(`- **Halaman / Route**: \`${err.pageOrRoute}\``);
    lines.push(`- **Selector Gagal**: \`${err.failingSelector}\``);
    lines.push(`- **Pesan Error**: \`${err.errorMessage}\``);
    lines.push(`- **Akar Masalah (Root Cause)**:`);
    lines.push(`  > ${err.rootCauseAnalysis}`);
    lines.push(`- **Aturan Pencegahan (Avoidance Rule)**:`);
    lines.push(`  - **Rule ID**: \`${err.avoidanceRule?.ruleId || 'N/A'}\``);
    lines.push(`  - **Tindakan**: ${err.avoidanceRule?.action || 'N/A'}`);
    lines.push(
      `  - **Konfigurasi yang Direkomendasikan**: \`\`\`json\n${JSON.stringify(
        err.avoidanceRule?.recommendedConfig || {},
        null,
        2
      )}\n\`\`\``
    );
    lines.push(``);
  });

  lines.push(`## 4. Rekomendasi Solusi Teknis`);
  res.recommendations.forEach((rec, i) => {
    lines.push(`${i + 1}. ${rec}`);
  });
  lines.push(``);

  return lines.join('\n');
}

function printTerminalAiSummary(res: AiDetectionResult) {
  console.log('╔══════════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║  🧠  HASIL DETEKSI AI API TERHADAP KESALAHAN HALAMAN & MITIGASI POPUP                 ║');
  console.log('╠══════════════════════════════════════════════════════════════════════════════════════╣');
  console.log(`║  📋  Report Sumber : ${res.reportFile.padEnd(66)}║`);
  console.log(`║  ⚠️   Total Isu Gagal: ${String(res.detectedErrors.length).padEnd(66)}║`);
  console.log(`║  🔄  Popup Rollback: ${String(res.popupRollbackDetected ? 'Terdeteksi / Dianalisis' : 'Aman').padEnd(66)}║`);
  console.log('╠══════╦══════════════════════════════╦════════════════════════════════════════════════╣');
  console.log('║ Mod  ║ Tipe Kesalahan Halaman       ║ Tindakan Pencegahan (Avoidance Strategy)       ║');
  console.log('╠══════╬══════════════════════════════╬════════════════════════════════════════════════╣');

  res.detectedErrors.forEach((e) => {
    const mod = e.moduleCode.padEnd(4);
    const type = e.errorType.slice(0, 28).padEnd(28);
    const act = (e.avoidanceRule?.action || e.avoidanceRule?.ruleId || 'Mitigate').slice(0, 46).padEnd(46);
    console.log(`║ ${mod} ║ ${type} ║ ${act} ║`);
  });

  console.log('╚══════╩══════════════════════════════╩════════════════════════════════════════════════╝\n');
}

// Eksekusi langsung jika dijalankan via CLI
if (process.argv[1] && process.argv[1].endsWith('ai-error-detector.ts')) {
  detectPageErrorsWithAi().catch((err) => {
    console.error('❌ Gagal menjalankan deteksi AI:', err.message);
    process.exit(1);
  });
}
