import { select, confirm } from '@inquirer/prompts';
import { chromium } from 'playwright';
import * as dotenv from 'dotenv';
import { generateSdiE2EPayload } from './generators/gemini-generator.js';
import { StepLogger, ModuleCode } from './utils/step-logger.js';
import { detectPageErrorsWithAi } from './utils/ai-error-detector.js';
import { resolveInstansiContext } from './utils/instansi-helper.js';
import { performLogin } from './pages/auth.page.js';
import {
  runModuleA,
  runModuleB,
  runModuleC,
  runModuleD,
  runModuleE
} from './flows/full-sdi-lifecycle.js';
import {
  runPageByPageVerification,
  runRevisiRegistrasiVerification,
  runLayananSplpVerification,
  runPengajuanAksesLifecycleVerification
} from './flows/verify-page-access.js';
import { runRegisterKemenporaMTNFlow } from './flows/register-kemenpora-mtn-flow.js';

dotenv.config();

export const MODULE_LABELS: Record<ModuleCode, { title: string; route: string }> = {
  AUTH: { title: 'Autentikasi & Verifikasi Akun Pengguna', route: '/login' },
  A: { title: 'Kebutuhan Data (Pengajuan Kebutuhan)', route: '/perencanaan/kebutuhan-data' },
  B: { title: 'Daftar Data SSOT & Antrean Registrasi', route: '/perencanaan/daftar-data' },
  C: { title: 'Registrasi Dataset (Step 1-3 & Publish SDI)', route: '/dataset-form/baru/[id]' },
  D: { title: 'Registrasi Layanan (LID)', route: '/registrasi/layanan' },
  E: { title: 'Permohonan Akses Data (LID)', route: '/pengajuan-akses/tambah' }
};

function printBanner() {
  console.clear();
  const now = new Date();
  const dateStr = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
  const timeStr = now
    .toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour12: false })
    .replace(/\./g, ':');
  const baseUrl = (process.env.BASE_URL || 'https://fe-staging.data.go.id').replace(/\/$/, '');
  const userPengusul = process.env.USER_PENGUSUL_USERNAME || 'exchange@test.kemendagri.go.id';
  const instansiCtx = resolveInstansiContext(userPengusul);

  console.log('╭──────────────────────────────────────────────────────────────────────────────────────╮');
  console.log('│  🚀  SDI PORTAL E2E AUTOMATION RUNNER (PLAYWRIGHT + GEMINI AI)                       │');
  console.log('├──────────────────────────────────────────────────────────────────────────────────────┤');
  console.log(`│  📅  Tanggal & Jam   : ${`${dateStr}  ${timeStr} WIB`.padEnd(62)}│`);
  console.log(`│  🌐  Target Base URL : ${baseUrl.padEnd(62)}│`);
  console.log(`│  🏢  Instansi Login  : ${`${instansiCtx.loginInstansiName}`.padEnd(62)}│`);
  console.log(`│  🎯  Target Usulan   : ${`${instansiCtx.targetInstansi}`.padEnd(62)}│`);
  console.log('│  🤖  AI Engine       : Gemini 2.5 Flash (Structured JSON Schema)                     │');
  console.log('╰──────────────────────────────────────────────────────────────────────────────────────╯\n');

  console.log('  📋 ALUR RESMI APLIKASI SDI (A ➔ B ➔ C ➔ D ➔ E):');
  console.log('  ┌──────┬───────────────────────────────────────────────┬─────────────────────────────┐');
  console.log('  │ Kode │ Nama Modul / Alur Form                        │ Route Utama                 │');
  console.log('  ├──────┼───────────────────────────────────────────────┼─────────────────────────────┤');
  (['AUTH', 'A', 'B', 'C', 'D', 'E'] as ModuleCode[]).forEach((code) => {
    const m = MODULE_LABELS[code];
    console.log(`  │ ${code.padEnd(4)} │ ${m.title.padEnd(45)} │ ${m.route.padEnd(27)} │`);
  });
  console.log('  └──────┴───────────────────────────────────────────────┴─────────────────────────────┘\n');
}

async function main() {
  if (process.argv.includes('--ai-detector')) {
    await detectPageErrorsWithAi();
    return;
  }

  printBanner();

  // Pemilihan Mode Eksekusi
  let executionMode = 'excel-id-data';
  try {
    executionMode = await select({
      message: 'Pilih Mode Eksekusi Pengujian:',
      choices: [
        {
          name: '1. Insert Dataset, Entitas & Kamus Data dari Excel berdasarkan ID Data (DT-PORA-001 s.d. DT-PORA-030) [Recommended]',
          value: 'excel-id-data',
          description: 'Insert RegDataset (Step 1), RegEntitasData (Step 2), dan RegKamusData (Step 3) berdasarkan ID Data dari file .xlsx'
        },
        {
          name: '2. Verifikasi Halaman & Kasus Spesifik (Terbatas, Tertutup, Revisi, Layanan, Pengajuan Akses)',
          value: 'cases',
          description: 'Pilih dan uji skenario spesifik: Data Terbatas, Data Tertutup, atau Alur Revisi'
        },
        {
          name: '3. Full SDI Lifecycle Form Seeding (Modul A s.d. Modul E berurutan)',
          value: 'full',
          description: 'Jalankan automasi pengisian form lengkap A s.d. E dengan akun login aktif'
        }
      ],
      default: 'excel-id-data'
    });
  } catch (err: any) {
    if (err.name === 'ExitPromptError') {
      console.log('\nOperasi dibatalkan.');
      process.exit(0);
    }
  }

  if (executionMode === 'excel-id-data') {
    await runRegisterKemenporaMTNFlow({ interactive: true });
    return;
  }

  if (executionMode === 'cases') {
    const selectedCase = await select({
      message: 'Pilih Skenario / Case yang ingin dijalankan:',
      choices: [
        {
          name: '1. Case Data Terbatas (Klasifikasi Terbatas + Step 1-3 + Review Published)',
          value: 'terbatas',
          description: 'Alur lengkap dataset berklasifikasi Terbatas untuk interoperabilitas antarinstansi'
        },
        {
          name: '2. Case Data Tertutup (Klasifikasi Tertutup + Dampak Tinggi + Review Published)',
          value: 'tertutup',
          description: 'Alur lengkap dataset berklasifikasi Tertutup negara dengan kerahasiaan tinggi'
        },
        {
          name: '3. Case Revisi Registrasi Data (Review Sekretariat Tombol ✕ Ditolak ➔ Walidata Edit Data ➔ Review Ulang Ceklis ✓ Published)',
          value: 'revisi',
          description: 'Revisi pada saat registrasi data direview sekretariat dengan tombol ✕ ditolak lalu walidata edit dan sekretariat setujui ceklis ✓'
        },
        {
          name: '4. Case Tambah Layanan SKDN & Verifikasi di /splp (Registrasi Layanan ➔ Pilih SKDN ➔ Simpan ➔ Pindah /splp Verifikasi)',
          value: 'layanan',
          description: 'Alur penambahan layanan dari halaman registrasi layanan dengan opsi SKDN, simpan form, lalu beralih ke /splp untuk verifikasi data'
        },
        {
          name: '5. Case Kebutuhan Data s.d. Verifikasi Pengajuan Akses Data (Full E2E Modul A s.d. E & Approval Sekretariat)',
          value: 'pengajuan-akses',
          description: 'Alur lengkap dari usulan kebutuhan, publish dataset, registrasi layanan SKDN, permohonan akses s.d. verifikasi oleh Sekretariat'
        },
        {
          name: '6. Jalankan Semua Case Sekaligus (All Cases: Terbatas, Tertutup, Revisi, Layanan SKDN & SPLP, Pengajuan Akses)',
          value: 'all',
          description: 'Eksekusi berurutan seluruh skenario untuk verifikasi komprehensif'
        }
      ],
      default: 'pengajuan-akses'
    });

    if (selectedCase === 'terbatas') {
      await runPageByPageVerification({ caseType: 'terbatas' });
    } else if (selectedCase === 'tertutup') {
      await runPageByPageVerification({ caseType: 'tertutup' });
    } else if (selectedCase === 'revisi') {
      await runRevisiRegistrasiVerification();
    } else if (selectedCase === 'layanan') {
      await runLayananSplpVerification();
    } else if (selectedCase === 'pengajuan-akses') {
      await runPengajuanAksesLifecycleVerification();
    } else if (selectedCase === 'all') {
      console.log('\n🚀 [1/5] Menjalankan Case 1: Data Terbatas...');
      await runPageByPageVerification({ caseType: 'terbatas' });
      console.log('\n🚀 [2/5] Menjalankan Case 2: Data Tertutup...');
      await runPageByPageVerification({ caseType: 'tertutup' });
      console.log('\n🚀 [3/5] Menjalankan Case 3: Skenario Revisi Registrasi Data...');
      await runRevisiRegistrasiVerification();
      console.log('\n🚀 [4/5] Menjalankan Case 4: Registrasi Layanan & Verifikasi di /splp...');
      await runLayananSplpVerification();
      console.log('\n🚀 [5/5] Menjalankan Case 5: Kebutuhan Data s.d. Verifikasi Pengajuan Akses Data...');
      await runPengajuanAksesLifecycleVerification();
    }
    return;
  }

  // Alur SDI berurutan sesuai alur resmi aplikasi
  const lifecycleSequence: ModuleCode[] = ['A', 'B', 'C', 'D', 'E'];
  const fullExecutionList: ModuleCode[] = ['AUTH', ...lifecycleSequence];

  // Pemilihan sumber data pengisian form
  let dataSource = 'ai';
  try {
    dataSource = await select({
      message: 'Pilih Sumber Data Pengisian Form:',
      choices: [
        { name: '1. Gemini AI Generator (Kontekstual otomatis via GEMINI_API_KEY)', value: 'ai' },
        { name: '2. Static Fake Data    (Fallback JSON tanpa AI)', value: 'static' }
      ],
      default: 'ai'
    });
  } catch {
    dataSource = 'ai';
  }

  process.env.USE_AI_GENERATOR = dataSource === 'ai' ? 'true' : 'false';
  const sourceLabel = dataSource === 'ai' ? 'Gemini AI Generator' : 'Static Fake Data';
  const seqText = lifecycleSequence.map((s) => `[ ${s} ]`).join(' ➔ ');

  console.log('\n╭──────────────────────────────────────────────────────────────────────────────────────╮');
  console.log('│  ✔  KONFIGURASI SIAP DIEKSEKUSI                                                      │');
  console.log(`│  ▸  Alur Aplikasi: ${seqText.padEnd(65)}│`);
  console.log(`│  ▸  Sumber Data  : ${sourceLabel.padEnd(65)}│`);
  console.log('╰──────────────────────────────────────────────────────────────────────────────────────╯\n');

  const userEmail = process.env.USER_PENGUSUL_USERNAME || 'exchange@test.kemendagri.go.id';
  const userPassword = process.env.USER_PENGUSUL_PASSWORD || '123456789';

  const logger = new StepLogger(fullExecutionList, sourceLabel);
  const payload = await generateSdiE2EPayload(undefined, userEmail);

  const isHeadless = process.env.HEADLESS === 'true';
  const browser = await chromium.launch({ headless: isHeadless, slowMo: 100 });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    // ══════════════════════════════════════════════════════════════════════
    // TAHAP 1: CEK & LAKUKAN LOGIN (TERPISAH LENGKAP DARI MODUL FLOW)
    // ══════════════════════════════════════════════════════════════════════
    logger.startModule('AUTH', MODULE_LABELS.AUTH.title, MODULE_LABELS.AUTH.route);
    try {
      await performLogin(
        page,
        logger,
        {
          username: userEmail,
          password: userPassword,
          roleName: 'Pengguna Utama SDI'
        },
        'AUTH'
      );
      logger.completeModule('AUTH', 'SUCCESS');
    } catch (authErr: any) {
      await logger.failStep(
        page,
        'AUTH',
        '#auth-gate',
        `Gagal Login: ${authErr.message}`
      );
      logger.completeModule('AUTH', 'FAILED', authErr.message);
      throw new Error(`[AUTH_GATE] ${authErr.message}`);
    }

    // ══════════════════════════════════════════════════════════════════════
    // TAHAP 2: EKSEKUSI ALUR RESMI APLIKASI SDI (A ➔ B ➔ C ➔ D ➔ E)
    // ══════════════════════════════════════════════════════════════════════
    for (const code of lifecycleSequence) {
      logger.startModule(code, MODULE_LABELS[code].title, MODULE_LABELS[code].route);
      try {
        if (code === 'A') await runModuleA(page, payload, logger);
        if (code === 'B') await runModuleB(page, payload, logger);
        if (code === 'C') await runModuleC(page, payload, logger);
        if (code === 'D') await runModuleD(page, payload, logger);
        if (code === 'E') await runModuleE(page, payload, logger);
        logger.completeModule(code, 'SUCCESS');
      } catch (err: any) {
        await logger.failStep(
          page,
          code,
          '#error-handler',
          `Gagal pada Modul ${code}: ${err.message}`
        );
        logger.completeModule(code, 'FAILED', err.message);
      }
    }
  } finally {
    await browser.close();
    logger.printTerminalSummary();
    const reportPaths = logger.saveReports();
    console.log(`  📄 File Report Markdown : ${reportPaths.markdownPath}`);
    console.log(`  📊 File Report JSON     : ${reportPaths.jsonPath}\n`);

    if (logger.hasFailures()) {
      try {
        const runAi = await confirm({
          message: '⚠️  Terdeteksi kegagalan langkah/halaman. Jalankan AI Error Detector sekarang untuk membuat file aturan pencegahannya?',
          default: true
        });
        if (runAi) {
          await detectPageErrorsWithAi(reportPaths.jsonPath);
        }
      } catch {
        // Abaikan jika non-interaktif
      }
    }
  }
}

main();
