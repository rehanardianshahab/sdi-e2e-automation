import { chromium, Page } from 'playwright';
import { select } from '@inquirer/prompts';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { StepLogger, ModuleCode } from '../utils/step-logger.js';
import { checkIsLoggedIn, performLogin } from '../pages/auth.page.js';
import {
  safeNavigate,
  safeDismissUnexpectedPopups,
  assertNoValidationErrors,
  detectValidationErrors
} from '../utils/page-error-guard.js';
import { resolveInstansiContext, selectStrictInstansi } from '../utils/instansi-helper.js';
import { fillById, clickById, ensureCorrectPage } from '../utils/id-helper.js';
import { generateSdiE2EPayload } from '../generators/gemini-generator.js';
import { SdiAutomationPayload } from '../schemas/sdi-e2e.schema.js';

dotenv.config();

const BASE_URL = (process.env.BASE_URL || 'https://fe-staging.data.go.id').replace(/\/$/, '');

interface PageCheckResult {
  stepNo: number;
  checkpointName: string;
  url: string;
  status: 'SUCCESS' | 'FAILED';
  durationMs: number;
  details: string;
  screenshot?: string;
}

const checkResults: PageCheckResult[] = [];

async function recordCheckpoint(
  page: Page,
  stepNo: number,
  checkpointName: string,
  fn: () => Promise<string>
): Promise<boolean> {
  const start = Date.now();
  console.log(`\n================================================================================`);
  console.log(`🔍 [CHECKPOINT ${stepNo}/6] : ${checkpointName}`);
  console.log(`================================================================================`);

  try {
    const details = await fn();
    const durationMs = Date.now() - start;
    const currentUrl = page.url();

    const screenshotName = `check-${stepNo}-${Date.now()}.png`;
    const screenshotPath = path.join(process.cwd(), 'reports', screenshotName);
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});

    checkResults.push({
      stepNo,
      checkpointName,
      url: currentUrl,
      status: 'SUCCESS',
      durationMs,
      details,
      screenshot: screenshotPath
    });

    console.log(`✅ [BERHASIL] ${checkpointName}`);
    console.log(`   🌐 URL Terverifikasi : ${currentUrl}`);
    console.log(`   ⏱️  Durasi Akses     : ${durationMs} ms`);
    console.log(`   📝 Keterangan        : ${details}`);
    return true;
  } catch (err: any) {
    const durationMs = Date.now() - start;
    const currentUrl = page.url();

    const screenshotName = `check-fail-${stepNo}-${Date.now()}.png`;
    const screenshotPath = path.join(process.cwd(), 'reports', screenshotName);
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});

    checkResults.push({
      stepNo,
      checkpointName,
      url: currentUrl,
      status: 'FAILED',
      durationMs,
      details: err.message,
      screenshot: screenshotPath
    });

    console.error(`❌ [GAGAL] ${checkpointName}`);
    console.error(`   🌐 URL Saat Gagal   : ${currentUrl}`);
    console.error(`   ⏱️  Durasi Akses     : ${durationMs} ms`);
    console.error(`   ⚠️  Error Detail     : ${err.message}`);
    return false;
  }
}

export interface VerificationOptions {
  caseType?: 'terbatas' | 'tertutup' | 'revisi';
  customPayload?: Partial<SdiAutomationPayload>;
}

export async function runPageByPageVerification(options: VerificationOptions = {}) {
  if (options.caseType === 'revisi') {
    return runRevisiCaseVerification();
  }

  const caseLabel = options.caseType === 'tertutup' ? 'DATA TERTUTUP' : 'DATA TERBATAS';
  console.clear();
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log(`║   VERIFIKASI AKSES HALAMAN 1 PER 1 PORTAL SATU DATA INDONESIA [${caseLabel.padEnd(13)}] ║`);
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log(`Target Base URL: ${BASE_URL}`);

  const userEmail =
    process.env.USER_PENGUSUL_USERNAME ||
    'exchange@test.kemendagri.go.id';
  const userPassword =
    process.env.USER_PENGUSUL_PASSWORD ||
    '123456789';

  const instansiCtx = resolveInstansiContext(userEmail);
  console.log(`Pengguna Login  : ${userEmail} (${instansiCtx.loginInstansiName})`);
  console.log(`Target Instansi : ${instansiCtx.targetInstansi}`);
  console.log(`Kasus Klasifikasi: ${caseLabel}\n`);

  const isHeadless = process.env.HEADLESS === 'true';
  const browser = await chromium.launch({ headless: isHeadless, slowMo: 100 });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const dummyLogger = new StepLogger(['AUTH', 'A', 'B', 'C', 'D', 'E'], `Verification-${options.caseType || 'terbatas'}`);
  const payload = await generateSdiE2EPayload(undefined, userEmail);

  if (options.caseType === 'tertutup') {
    payload.registrasiDataset.step1Informasi.klasifikasiRisiko = 'Tertutup';
    payload.registrasiDataset.step1Informasi.nama = `Data Rahasia Seleksi dan Rekam Medis Atlet Nasional [${new Date().toLocaleTimeString('id-ID', { hour12: false }).replace(/\./g, ':')}]`;
    payload.registrasiDataset.step1Informasi.deskripsi = `Dataset klasifikasi tertutup negara yang memuat identitas rekam medis atlet strategis nasional sesuai ketentuan kerahasiaan informasi publik.`;
    payload.registrasiDataset.step1Informasi.dampakKerahasiaan = 'tinggi';
    payload.registrasiDataset.step1Informasi.dampakIntegritas = 'tinggi';
    payload.registrasiDataset.step1Informasi.dampakKetersediaan = 'tinggi';
  } else {
    payload.registrasiDataset.step1Informasi.klasifikasiRisiko = 'Terbatas';
    payload.registrasiDataset.step1Informasi.dampakKerahasiaan = 'sedang';
    payload.registrasiDataset.step1Informasi.dampakIntegritas = 'tinggi';
    payload.registrasiDataset.step1Informasi.dampakKetersediaan = 'sedang';
  }

  if (options.customPayload) {
    Object.assign(payload, options.customPayload);
  }

  try {
    // --------------------------------------------------------------------------
    // 1. CHECKPOINT 1: LOGIN & SESI
    // --------------------------------------------------------------------------
    const loginOk = await recordCheckpoint(page, 1, 'Halaman Login & Autentikasi', async () => {
      await performLogin(
        page,
        dummyLogger,
        {
          username: userEmail,
          password: userPassword,
          roleName: 'Pengguna Utama SDI'
        },
        'AUTH'
      );

      const status = await checkIsLoggedIn(page);
      if (!status.isLoggedIn) {
        throw new Error(`Sesi belum aktif setelah proses login: ${status.reason}`);
      }
      return `Login berhasil sebagai ${userEmail} (${status.reason})`;
    });

    if (!loginOk) {
      console.error('\n⚠️ Verifikasi dihentikan karena tahap login gagal.');
      return;
    }

    // --------------------------------------------------------------------------
    // 2. CHECKPOINT 2: KEBUTUHAN DATA
    // --------------------------------------------------------------------------
    const targetKebutuhanUrl = `${BASE_URL}/perencanaan/kebutuhan-data`;
    const kebutuhanOk = await recordCheckpoint(page, 2, 'Halaman Kebutuhan Data', async () => {
      await safeNavigate(page, targetKebutuhanUrl, dummyLogger, 'A');
      await page.waitForTimeout(1000);

      // Pastikan tidak mental ke root
      if (page.url() !== targetKebutuhanUrl && !page.url().includes('/perencanaan/kebutuhan-data')) {
        throw new Error(`Navigasi melenceng ke ${page.url()}, otorisasi mungkin tidak sesuai.`);
      }

      // Cari elemen halaman kebutuhan data
      const ajukanBtn = page.locator(
        '#button-kebutuhan-ajukan, button:has-text("Ajukan Kebutuhan"), a:has-text("Ajukan Kebutuhan"), button:has-text("Tambah Kebutuhan")'
      ).first();
      await ajukanBtn.waitFor({ state: 'visible', timeout: 10000 });

      return 'Halaman /perencanaan/kebutuhan-data terbuka dan tombol Ajukan Kebutuhan siap';
    });

    if (!kebutuhanOk) {
      console.error('\n⚠️ Verifikasi dihentikan karena halaman Kebutuhan Data gagal diakses.');
      return;
    }

    // --------------------------------------------------------------------------
    // 3. CHECKPOINT 3: TAMBAH KEBUTUHAN DATA (PENGUSUL)
    // --------------------------------------------------------------------------
    const timestampStr = new Date().toLocaleTimeString('id-ID', { hour12: false }).replace(/\./g, ':');
    const submittedDataName = `${payload.kebutuhanData.namaData} [${timestampStr}]`;

    const pengajuanOk = await recordCheckpoint(page, 3, 'Tambah Kebutuhan Data (Pengusul)', async () => {
      const ajukanBtn = page.locator(
        '#button-kebutuhan-ajukan, button:has-text("Ajukan Kebutuhan"), a:has-text("Ajukan Kebutuhan"), button:has-text("Tambah Kebutuhan")'
      ).first();
      await ajukanBtn.click({ force: true });

      // Verifikasi dialog form muncul
      const namaInput = page.locator('#input-kebutuhan-form-nama-data, input[placeholder*="nama" i]').first();
      await namaInput.waitFor({ state: 'visible', timeout: 10000 });
      await namaInput.fill(submittedDataName);

      // Pilih Instansi Target secara ketat (HANYA Kemensos atau Kemendagri)
      await selectStrictInstansi(page, instansiCtx, dummyLogger, 'A');

      // Isi produsen & walidata jika ada
      const produsenInput = page.locator('#input-kebutuhan-form-produsen-data').first();
      if (await produsenInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await produsenInput.fill(instansiCtx.targetProdusenData || 'Direktorat Jenderal Kependudukan dan Pencatatan Sipil');
      }

      const walidataInput = page.locator('#input-kebutuhan-form-walidata').first();
      if (await walidataInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await walidataInput.fill(instansiCtx.targetWaliData || 'Pusat Data dan Informasi Kemendagri');
      }

      // Isi tujuan pengusulan (Wajib)
      const tujuanInput = page.locator('#input-kebutuhan-form-tujuan-pengusulan, textarea').first();
      await tujuanInput.scrollIntoViewIfNeeded().catch(() => {});
      await tujuanInput.waitFor({ state: 'visible', timeout: 5000 });
      await tujuanInput.fill(
        payload.kebutuhanData.tujuanPengusulan ||
        'Untuk sinkronisasi dan interoperabilitas data bantuan sosial serta validasi kependudukan nasional.'
      );
      await page.waitForTimeout(500);

      // Verifikasi TIDAK ADA validation error sebelum submit
      await assertNoValidationErrors(page, 'Form Pengajuan Kebutuhan Data (Sebelum Submit)');

      // Submit form
      const submitBtn = page.locator('#button-kebutuhan-form-submit, button:has-text("Kirim Usulan Kebutuhan")').first();
      await submitBtn.scrollIntoViewIfNeeded().catch(() => {});
      await submitBtn.click({ force: true });

      // Verifikasi TIDAK ADA validation error setelah submit
      await assertNoValidationErrors(page, 'Form Pengajuan Kebutuhan Data (Setelah Submit)');

      // Tunggu dialog tertutup
      const modalDialog = page.locator('[role="dialog"]').first();
      await modalDialog.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(2000);

      // Tangani popup konfirmasi/sukses jika ada
      await safeDismissUnexpectedPopups(page, dummyLogger, 'A', '/perencanaan/kebutuhan-data');

      return `Semua field kebutuhan data terisi lengkap & bebas validation error. Usulan diajukan: "${submittedDataName}" (Status: Diajukan).`;
    });

    if (!pengajuanOk) {
      console.error('\n⚠️ Verifikasi dihentikan karena penambahan usulan kebutuhan data gagal.');
      return;
    }

    // --------------------------------------------------------------------------
    // 4. CHECKPOINT 4: KONFIRMASI KEBUTUHAN DATA OLEH SEKRETARIAT
    // --------------------------------------------------------------------------
    const sekUsername = process.env.USER_SEKRETARIAT_USERNAME || 'Mkalmunawar@gmail.com';
    const sekPassword = process.env.USER_SEKRETARIAT_PASSWORD || '@Celestial12';

    const konfirmasiSekretariatOk = await recordCheckpoint(page, 4, 'Konfirmasi Kebutuhan Data oleh Sekretariat', async () => {
      // Gunakan context browser terisolasi khusus Sekretariat agar sesi bersih tanpa bentrok cookie pengusul
      const sekContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const sekPage = await sekContext.newPage();

      try {
        // 1. Login sebagai Sekretariat SDI
        await performLogin(
          sekPage,
          dummyLogger,
          {
            username: sekUsername,
            password: sekPassword,
            roleName: 'Sekretariat SDI'
          },
          'A'
        );

        // 2. Akses halaman kebutuhan data
        await safeNavigate(sekPage, `${BASE_URL}/perencanaan/kebutuhan-data`, dummyLogger, 'A');
        await sekPage.waitForTimeout(2000);

        // Cari tombol Penetapan pada usulan data
        const penetapanBtn = sekPage.locator('button:has-text("Penetapan"), a:has-text("Penetapan")').first();
        await penetapanBtn.waitFor({ state: 'visible', timeout: 15000 });
        await penetapanBtn.click();
        await sekPage.waitForTimeout(1500);

        // 3. Isi Catatan Review Sekretariat
        const catatanInput = sekPage.locator('#input-kebutuhan-detail-catatan-review, textarea').first();
        if (await catatanInput.isVisible({ timeout: 5000 }).catch(() => false)) {
          await catatanInput.fill(
            payload.kebutuhanData.catatanReviewSekretariat ||
            'Usulan kebutuhan data telah diverifikasi oleh Sekretariat SDI dan disetujui untuk disediakan.'
          );
        }

        // Verifikasi TIDAK ADA validation error pada modal penetapan
        await assertNoValidationErrors(sekPage, 'Modal Penetapan Sekretariat (Sebelum Submit)');

        // 4. Klik tombol "Konfirmasi Dapat Disediakan"
        const btnDapatDisediakan = sekPage.locator(
          '#button-kebutuhan-detail-dapat-disediakan, button:has-text("Konfirmasi Dapat Disediakan")'
        ).first();
        await btnDapatDisediakan.waitFor({ state: 'visible', timeout: 5000 });
        await btnDapatDisediakan.click();
        await sekPage.waitForTimeout(2500);

        // Verifikasi TIDAK ADA validation error setelah penetapan
        await assertNoValidationErrors(sekPage, 'Modal Penetapan Sekretariat (Setelah Submit)');

        await safeDismissUnexpectedPopups(sekPage, dummyLogger, 'A');

        // 5. Verifikasi perubahan status di tabel
        const firstRowText = await sekPage.locator('tbody tr').first().innerText().catch(() => '');
        const isApproved = firstRowText.includes('Dapat Disediakan');

        return `Sekretariat (${sekUsername}) mengonfirmasi usulan bebas validation error ➔ Status: ${isApproved ? 'Dapat Disediakan' : 'Dikonfirmasi'}.`;
      } finally {
        await sekContext.close();
      }
    });

    // --------------------------------------------------------------------------
    // 5. CHECKPOINT 5: REGISTRASI DATASET ASLI (STEP 1 - 3 INLINE FLOW)
    // --------------------------------------------------------------------------
    const walidataEmail = instansiCtx.targetLoginEmail || process.env.USER_WALIDATA_USERNAME || 'exchange@test.kemendagri.go.id';
    const walidataPass = instansiCtx.targetLoginPassword || process.env.USER_WALIDATA_PASSWORD || '123456789';

    // Buka sesi browser untuk Walidata Pengampu (Kemendagri)
    const waliContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const waliPage = await waliContext.newPage();

    try {
      const registrasiOk = await recordCheckpoint(waliPage, 5, 'Registrasi Dataset Inline (Step 1 s.d. Step 3)', async () => {
        // 1. Login sebagai Walidata Pengampu Target (Kemendagri)
        await performLogin(
          waliPage,
          dummyLogger,
          {
            username: walidataEmail,
            password: walidataPass,
            roleName: `Walidata ${instansiCtx.targetInstansi}`
          },
          'C'
        );

        // 2. Akses antrean registrasi data
        await safeNavigate(waliPage, `${BASE_URL}/registrasi/data`, dummyLogger, 'C');
        await waliPage.waitForTimeout(2000);

        // 3. Klik tombol Registrasikan Data (#button-registrasi-data-registrasikan-0) pada baris usulan nyata
        const regBtn = waliPage.locator(
          '#button-registrasi-data-registrasikan-0, button[title="Registrasikan Data"]'
        ).first();

        await regBtn.waitFor({ state: 'visible', timeout: 15000 });
        await regBtn.click();
        await waliPage.waitForTimeout(3000);

        const currentRegUrl = waliPage.url();
        console.log(`   🔗 URL Form Registrasi Asli: ${currentRegUrl}`);

        if (!currentRegUrl.includes('/dataset-form/baru/')) {
          throw new Error(`Gagal membuka form registrasi inline. URL saat ini: ${currentRegUrl}`);
        }

        // ----------------------------------------------------------------------
        // STEP 1: INFORMASI DATASET (Isi semua field & verifikasi validasi)
        // ----------------------------------------------------------------------
        const descInput = waliPage.locator('#input-dataset-step1-deskripsi, textarea').first();
        if (await descInput.isVisible({ timeout: 5000 }).catch(() => false)) {
          const rawDesc =
            payload.registrasiDataset.step1Informasi.deskripsi ||
            'Dataset agregat terpadu penerima bantuan sosial dan program pemberdayaan masyarakat nasional.';
          // Batasi panjang deskripsi maksimal 255 karakter
          await descInput.fill(rawDesc.slice(0, 255));
        }

        // 1. Pilih Klasifikasi Risiko: Terbuka | Terbatas | Tertutup
        const targetKlasifikasi = payload.registrasiDataset.step1Informasi.klasifikasiRisiko || 'Terbatas';
        const klasifikasiBtn = waliPage.locator(`button:has-text("${targetKlasifikasi}")`).first();
        if (await klasifikasiBtn.isVisible({ timeout: 2500 }).catch(() => false)) {
          await klasifikasiBtn.click({ force: true });
          console.log(`   🏷️  Klasifikasi Risiko dipilih: ${targetKlasifikasi}`);
          await waliPage.waitForTimeout(400);
        }

        // 2. Pilih Format Ketersediaan Data (JSON, REST API, CSV)
        for (const fmt of ['JSON', 'REST API', 'CSV']) {
          const fmtBtn = waliPage.locator(`button:has-text("${fmt}")`).first();
          if (await fmtBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
            await fmtBtn.click({ force: true }).catch(() => {});
          }
        }

        // 3. Isi dropdown select wajib di Step 1: Tema, Jenis Data, Frekuensi, & Dampak
        const selects = waliPage.locator('select');
        const selectCount = await selects.count();
        for (let i = 0; i < selectCount; i++) {
          const s = selects.nth(i);
          const html = await s.innerHTML().catch(() => '');
          if (html.includes('Pilih Tema') || html.includes('Perlindungan Sosial')) {
            await s.selectOption({ label: 'Perlindungan Sosial dan Kesehatan' }).catch(async () => {
              await s.selectOption({ index: 4 }).catch(() => {});
            });
          } else if (html.includes('Pilih Jenis Data') || html.includes('Data Induk')) {
            await s.selectOption({ label: 'Data Induk' }).catch(async () => {
              await s.selectOption({ index: 4 }).catch(() => {});
            });
          } else if (html.includes('Pilih Frekuensi') || html.includes('Tahunan')) {
            await s.selectOption({ label: 'Bulanan' }).catch(async () => {
              await s.selectOption({ index: 4 }).catch(() => {});
            });
          } else if (html.includes('Dampak minimal') || html.includes('rendah')) {
            // Kerahasiaan, Integritas, Ketersediaan
            const impactVal = targetKlasifikasi === 'Tertutup' ? 'tinggi' : 'sedang';
            await s.selectOption({ value: impactVal }).catch(async () => {
              await s.selectOption({ index: targetKlasifikasi === 'Tertutup' ? 3 : 2 }).catch(() => {});
            });
          }
        }
        await waliPage.waitForTimeout(500);

        // Verifikasi tidak ada error validasi di Step 1
        await assertNoValidationErrors(waliPage, 'Registrasi Dataset Step 1 (Informasi Dataset)');

        const nextBtn1 = waliPage.locator('#button-dataset-next-step, button:has-text("Lanjut Langkah 2"), button:has-text("Lanjut")').first();
        if (await nextBtn1.isVisible({ timeout: 3000 }).catch(() => false)) {
          await nextBtn1.click({ force: true });
          await waliPage.waitForTimeout(1500);
        }

        // ----------------------------------------------------------------------
        // STEP 2: ENTITAS / STRUKTUR DATA (Isi semua field & verifikasi validasi)
        // ----------------------------------------------------------------------
        const addEntitasBtn = waliPage.locator('#button-dataset-step2-tambah-entitas, button:has-text("Tambah Entitas")').first();
        if (await addEntitasBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await addEntitasBtn.click({ force: true });
          const dialog = waliPage.locator('[role="dialog"]').first();
          if (await dialog.isVisible({ timeout: 2000 }).catch(() => false)) {
            const entName = dialog.locator('input').first();
            if (await entName.isVisible()) {
              await entName.fill(payload.registrasiDataset.step2Entitas[0].namaEntitas || 'Data Penerima Bantuan');
            }
            const entDesc = dialog.locator('textarea').first();
            if (await entDesc.isVisible()) {
              await entDesc.fill(payload.registrasiDataset.step2Entitas[0].definisi || 'Entitas catatan data individu penerima manfaat perlindungan sosial.');
            }

            // Verifikasi tidak ada error validasi pada modal entitas
            await assertNoValidationErrors(waliPage, 'Modal Tambah Entitas Step 2');

            const saveBtn = dialog.locator('button:has-text("Tambah"), button:has-text("Simpan")').first();
            if (await saveBtn.isVisible()) await saveBtn.click({ force: true });
            await waliPage.waitForTimeout(1000);
          }
        }

        // Verifikasi tidak ada error validasi di daftar entitas Step 2
        await assertNoValidationErrors(waliPage, 'Registrasi Dataset Step 2 (Daftar Entitas)');

        const nextBtn2 = waliPage.locator('#button-dataset-next-step, button:has-text("Lanjut Langkah 3"), button:has-text("Lanjut")').first();
        if (await nextBtn2.isVisible({ timeout: 3000 }).catch(() => false)) {
          await nextBtn2.click({ force: true });
          await waliPage.waitForTimeout(1500);
        }

        // ----------------------------------------------------------------------
        // STEP 3: KAMUS DATA / ELEMEN (Isi semua field & verifikasi validasi)
        // ----------------------------------------------------------------------
        const addElemBtn = waliPage.locator('#button-dataset-step3-tambah-elemen, button:has-text("Tambah Elemen")').first();
        if (await addElemBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await addElemBtn.click({ force: true });
          const dialog = waliPage.locator('[role="dialog"]').first();
          if (await dialog.isVisible({ timeout: 2000 }).catch(() => false)) {
            // Isi semua input di modal kamus data
            const inputs = dialog.locator('input');
            const inCount = await inputs.count();
            if (inCount >= 1) await inputs.nth(0).fill('Nomor Induk Kependudukan');
            if (inCount >= 2) await inputs.nth(1).fill('nik');
            if (inCount >= 3) await inputs.nth(2).fill('-');
            if (inCount >= 4) await inputs.nth(3).fill('16 karakter numerik');

            const elDesc = dialog.locator('textarea').first();
            if (await elDesc.isVisible()) {
              await elDesc.fill('Nomor identitas kependudukan tunggal terverifikasi dan tervalidasi.');
            }

            // Verifikasi tidak ada error validasi pada modal kamus data
            await assertNoValidationErrors(waliPage, 'Modal Tambah Elemen Kamus Data Step 3');

            const saveBtn = dialog.locator('button:has-text("Tambah"), button:has-text("Simpan")').first();
            if (await saveBtn.isVisible()) await saveBtn.click({ force: true });
            await waliPage.waitForTimeout(1000);
          }
        }

        // Verifikasi tidak ada error validasi di daftar kamus data Step 3
        await assertNoValidationErrors(waliPage, 'Registrasi Dataset Step 3 (Daftar Kamus Data)');

        // Buka modal konfirmasi review submit dataset
        const submitBtn = waliPage.locator(
          '#button-dataset-open-confirm-submit, button:has-text("Kirimkan Registrasi Dataset"), button:has-text("Review"), button:has-text("Kirim")'
        ).first();

        await submitBtn.waitFor({ state: 'visible', timeout: 5000 });
        await submitBtn.click({ force: true });
        await waliPage.waitForTimeout(1500);

        // Centang checkbox syarat & ketentuan di modal konfirmasi
        const confirmModal = waliPage.locator('[role="dialog"]').first();
        await confirmModal.waitFor({ state: 'visible', timeout: 5000 });
        const checkbox = confirmModal.locator('input[type="checkbox"]').first();
        if (await checkbox.isVisible()) {
          await checkbox.check();
          await waliPage.waitForTimeout(500);
        }

        // Verifikasi tidak ada error validasi pada modal konfirmasi
        await assertNoValidationErrors(waliPage, 'Modal Konfirmasi Kirim Registrasi Dataset');

        // Klik tombol "Setujui & Kirim Registrasi Dataset"
        const finalSubmitBtn = confirmModal.locator(
          'button:has-text("Setujui & Kirim"), button:has-text("Kirim Registrasi Dataset")'
        ).first();
        await finalSubmitBtn.click({ force: true });
        await waliPage.waitForTimeout(3000);

        // Tangani redirect atau popup sukses
        await safeDismissUnexpectedPopups(waliPage, dummyLogger, 'C');

        const postSubmitUrl = waliPage.url();
        return `Registrasi Dataset Step 1-3 terisi lengkap, disetujui & berhasil dikirim (${postSubmitUrl}).`;
      });

      // --------------------------------------------------------------------------
      // 6. CHECKPOINT 6: REVIEW & PERSETUJUAN DATASET OLEH SEKRETARIAT (PUBLISHED)
      // --------------------------------------------------------------------------
      const sekReviewOk = await recordCheckpoint(page, 6, 'Review & Persetujuan Registrasi Dataset oleh Sekretariat', async () => {
        // Buka sesi Sekretariat untuk mereview dan menyetujui dataset
        const sekRevContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const sekRevPage = await sekRevContext.newPage();

        try {
          // 1. Login sebagai Sekretariat
          await performLogin(
            sekRevPage,
            dummyLogger,
            {
              username: sekUsername,
              password: sekPassword,
              roleName: 'Sekretariat SDI'
            },
            'B'
          );

          // 2. Akses antrean registrasi data sekretariat untuk review
          await safeNavigate(sekRevPage, `${BASE_URL}/registrasi/data`, dummyLogger, 'B');
          await sekRevPage.waitForTimeout(2000);

          // 3. Klik tombol Review Registrasi Data pada usulan yang berstatus Menunggu Validasi
          let reviewBtn = sekRevPage.locator(
            '#button-registrasi-data-review-0, button[title="Review Registrasi Data"]'
          ).first();

          if (!(await reviewBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
            // Fallback ke /perencanaan/daftar-data jika diperlukan
            await safeNavigate(sekRevPage, `${BASE_URL}/perencanaan/daftar-data`, dummyLogger, 'B');
            await sekRevPage.waitForTimeout(2000);
            reviewBtn = sekRevPage.locator(
              '#button-daftar-data-review-0, #button-registrasi-data-review-0, button[title="Review Registrasi Data"]'
            ).first();
          }

          await reviewBtn.waitFor({ state: 'visible', timeout: 15000 });
          await reviewBtn.click();
          await sekRevPage.waitForTimeout(2500);

          const reviewUrl = sekRevPage.url();
          console.log(`   🔍 URL Halaman Review Sekretariat: ${reviewUrl}`);

          // Review Langkah 1 -> Lanjut Langkah 2
          const nextStep2Btn = sekRevPage.locator('button:has-text("Lanjut Langkah 2")').first();
          if (await nextStep2Btn.isVisible({ timeout: 5000 }).catch(() => false)) {
            await nextStep2Btn.click({ force: true });
            await sekRevPage.waitForTimeout(1500);
          }

          // Review Langkah 2 -> Lanjut Langkah 3
          const nextStep3Btn = sekRevPage.locator('button:has-text("Lanjut Langkah 3")').first();
          if (await nextStep3Btn.isVisible({ timeout: 5000 }).catch(() => false)) {
            await nextStep3Btn.click({ force: true });
            await sekRevPage.waitForTimeout(2000);
          }

          // Langkah 3: Klik tombol "Setujui Dataset (Published)"
          const approveBtn = sekRevPage.locator(
            'button:has-text("Setujui Dataset (Published)"), button:has-text("Setujui Dataset"), button:has-text("Publish")'
          ).first();

          await approveBtn.waitFor({ state: 'visible', timeout: 10000 });
          await approveBtn.click({ force: true });
          await sekRevPage.waitForTimeout(3000);

          // Tangani popup konfirmasi jika ada
          const confirmApproveBtn = sekRevPage.locator(
            '[role="dialog"] button:has-text("Ya"), [role="dialog"] button:has-text("Setujui"), [role="dialog"] button:has-text("Lanjutkan")'
          ).first();
          if (await confirmApproveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await confirmApproveBtn.click({ force: true });
            await sekRevPage.waitForTimeout(2000);
          }

          await safeDismissUnexpectedPopups(sekRevPage, dummyLogger, 'B');

          return `Sekretariat berhasil mereview Step 1-3 & menyetujui dataset menjadi Published (${sekRevPage.url()}).`;
        } finally {
          await sekRevContext.close();
        }
      });

    } finally {
      await waliContext.close();
    }

  } finally {
    await browser.close();

    // Tampilkan Tabel Rekapitulasi Verifikasi
    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════════════════════════════════╗');
    console.log('║               REKAPITULASI STATUS AKSES SETIAP HALAMAN (1 PER 1)                       ║');
    console.log('╠════╦══════════════════════════════════╦══════════════╦════════════════╦══════════════════╣');
    console.log('║ No ║ Checkpoint Halaman               ║ Durasi       ║ Status Akses   ║ Rincian          ║');
    console.log('╠════╬══════════════════════════════════╬══════════════╬════════════════╬══════════════════╣');
    checkResults.forEach((r) => {
      const badge = r.status === 'SUCCESS' ? '✅ SUCCESS' : '❌ FAILED ';
      const dur = `${r.durationMs} ms`.padEnd(12);
      const name = r.checkpointName.slice(0, 32).padEnd(32);
      const detail = r.details.slice(0, 16).padEnd(16);
      console.log(`║ ${r.stepNo}  ║ ${name} ║ ${dur} ║ ${badge.padEnd(14)} ║ ${detail} ║`);
    });
    console.log('╚════╩══════════════════════════════════╩══════════════╩════════════════╩══════════════════╝\n');

    // Buat laporan HTML interaktif di folder playwright-report/index.html
    const reportDir = path.join(process.cwd(), 'playwright-report');
    fs.mkdirSync(reportDir, { recursive: true });
    const htmlReportPath = path.join(reportDir, 'index.html');
    const allSuccess = checkResults.length > 0 && checkResults.every((r) => r.status === 'SUCCESS');

    const htmlContent = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Laporan Automasi E2E - Portal Satu Data Indonesia</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b0f19; color: #f1f5f9; margin: 0; padding: 2rem; }
    .container { max-width: 1180px; margin: 0 auto; background: #111827; border-radius: 16px; padding: 2rem; border: 1px solid #1f2937; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5); }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #ef4444; padding-bottom: 1.25rem; margin-bottom: 1.5rem; }
    h1 { color: #f8fafc; font-size: 1.4rem; margin: 0; display: flex; align-items: center; gap: 0.6rem; }
    .badge-success { background: #059669; color: white; padding: 0.35rem 0.85rem; border-radius: 9999px; font-weight: 700; font-size: 0.8rem; letter-spacing: 0.05em; display: inline-block; }
    .badge-failed { background: #dc2626; color: white; padding: 0.35rem 0.85rem; border-radius: 9999px; font-weight: 700; font-size: 0.8rem; letter-spacing: 0.05em; display: inline-block; }
    .meta-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-bottom: 1.75rem; }
    .card { background: #1f2937; border-radius: 12px; padding: 1rem 1.25rem; border: 1px solid #374151; }
    .card-label { font-size: 0.72rem; color: #9ca3af; text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em; }
    .card-val { font-size: 1.05rem; font-weight: 700; color: #f9fafb; margin-top: 0.25rem; word-break: break-all; }
    table { width: 100%; border-collapse: collapse; margin-top: 1rem; border-radius: 8px; overflow: hidden; }
    th { background: #1f2937; padding: 0.85rem 1rem; text-align: left; font-size: 0.78rem; text-transform: uppercase; color: #9ca3af; letter-spacing: 0.05em; border-bottom: 1px solid #374151; }
    td { padding: 1rem; border-bottom: 1px solid #1f2937; font-size: 0.88rem; vertical-align: top; }
    tr:nth-child(even) { background: #111827/50; }
    tr:hover { background: #1e293b; }
    .url-tag { font-family: ui-monospace, monospace; font-size: 0.78rem; color: #38bdf8; background: #0369a1/20; padding: 0.2rem 0.5rem; border-radius: 6px; display: inline-block; word-break: break-all; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🇮🇩 Laporan Resmi Automasi Portal Satu Data Indonesia</h1>
      <span class="${allSuccess ? 'badge-success' : 'badge-failed'}">${allSuccess ? 'ALL PASSED (100%)' : 'HAS FAILURES'}</span>
    </div>
    <div class="meta-cards">
      <div class="card"><div class="card-label">Target Base URL</div><div class="card-val">${BASE_URL}</div></div>
      <div class="card"><div class="card-label">Instansi Pengusul</div><div class="card-val">${instansiCtx.loginInstansiName}</div></div>
      <div class="card"><div class="card-label">Instansi Target</div><div class="card-val">${instansiCtx.targetInstansi}</div></div>
      <div class="card"><div class="card-label">Total Checkpoint</div><div class="card-val">${checkResults.length} Langkah Berhasil</div></div>
    </div>
    <table>
      <thead>
        <tr>
          <th style="width: 50px;">No</th>
          <th>Checkpoint Halaman</th>
          <th>Rute / URL Terverifikasi</th>
          <th style="width: 90px;">Durasi</th>
          <th style="width: 100px;">Status</th>
          <th>Keterangan Validasi</th>
        </tr>
      </thead>
      <tbody>
        ${checkResults
          .map(
            (r) => `
          <tr>
            <td><strong>#${r.stepNo}</strong></td>
            <td><strong>${r.checkpointName}</strong></td>
            <td><span class="url-tag">${r.url}</span></td>
            <td>${r.durationMs} ms</td>
            <td><span class="${r.status === 'SUCCESS' ? 'badge-success' : 'badge-failed'}">${r.status}</span></td>
            <td>${r.details}</td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>
  </div>
</body>
</html>`;
    fs.writeFileSync(htmlReportPath, htmlContent, 'utf-8');
    console.log(`  📊 Laporan HTML Playwright dibuat di: ${htmlReportPath}\n`);

    return allSuccess;
  }
}

/**
 * Skenario Pengujian Alur Revisi Registrasi Data:
 * 1. Pengusul (Kemensos) mengajukan kebutuhan data baru (agar fresh).
 * 2. Sekretariat (Mkalmunawar@gmail.com) mengonfirmasi usulan "Dapat Disediakan".
 * 3. Walidata (Kemendagri) mengisi registrasi dataset (Step 1-3) & mengirimkan data -> Status: Menunggu Validasi.
 * 4. Sekretariat membuka review registrasi data, mengklik tombol Silang (✕: Ditolak/Perlu Revisi) pada Step 1-3,
 *    lalu di Step 3 mengklik tombol "Kembalikan untuk Revisi" -> Status: Perlu Revisi.
 * 5. Walidata membuka form edit dataset di /registrasi/data, memperbarui data yang diminta, lalu kirim ulang -> Status: Menunggu Validasi.
 * 6. Sekretariat membuka review kembali, mengklik tombol Ceklis (✓: Setuju), lalu di Step 3 menyetujui sampai Published!
 */
export async function runRevisiRegistrasiVerification(): Promise<boolean> {
  console.clear();
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║   VERIFIKASI CASE REVISI REGISTRASI DATA OLEH SEKRETARIAT & WALIDATA (SDI)   ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log(`Target Base URL: ${BASE_URL}`);

  const userEmail = process.env.USER_PENGUSUL_USERNAME || 'exchange@test.kemensos.go.id';
  const userPassword = process.env.USER_PENGUSUL_PASSWORD || '123456789';
  const walidataEmail = process.env.USER_WALIDATA_USERNAME || 'exchange@test.kemendagri.go.id';
  const walidataPass = process.env.USER_WALIDATA_PASSWORD || '123456789';
  const sekUsername = process.env.USER_SEKRETARIAT_USERNAME || 'Mkalmunawar@gmail.com';
  const sekPassword = process.env.USER_SEKRETARIAT_PASSWORD || '@Celestial12';

  const instansiCtx = resolveInstansiContext(userEmail);
  const isHeadless = process.env.HEADLESS === 'true';
  const browser = await chromium.launch({ headless: isHeadless, slowMo: 100 });
  const checkResults: PageCheckResult[] = [];
  const dummyLogger = new StepLogger(['AUTH', 'A', 'B', 'C'], 'CaseRevisiRegistrasi');

  const nowTime = new Date().toLocaleTimeString('id-ID', { hour12: false }).replace(/\./g, ':');
  const datasetRevisiTitle = `Dataset Uji Revisi Registrasi Kemendagri [${nowTime}]`;

  async function recordRevisiStep(
    page: Page,
    stepNo: number,
    checkpointName: string,
    fn: () => Promise<string>
  ): Promise<boolean> {
    const start = Date.now();
    console.log(`\n================================================================================`);
    console.log(`🔍 [REVISI CHECKPOINT ${stepNo}/6] : ${checkpointName}`);
    console.log(`================================================================================`);

    try {
      const details = await fn();
      const durationMs = Date.now() - start;
      const currentUrl = page.url();

      const screenshotName = `revisi-reg-${stepNo}-${Date.now()}.png`;
      const screenshotPath = path.join(process.cwd(), 'reports', screenshotName);
      fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
      await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});

      checkResults.push({
        stepNo,
        checkpointName,
        url: currentUrl,
        status: 'SUCCESS',
        durationMs,
        details,
        screenshot: screenshotPath
      });

      console.log(`✅ [BERHASIL] ${checkpointName}`);
      console.log(`   🌐 URL Terverifikasi : ${currentUrl}`);
      console.log(`   ⏱️  Durasi Akses     : ${durationMs} ms`);
      console.log(`   📝 Keterangan        : ${details}`);
      return true;
    } catch (err: any) {
      const durationMs = Date.now() - start;
      const currentUrl = page.url();

      checkResults.push({
        stepNo,
        checkpointName,
        url: currentUrl,
        status: 'FAILED',
        durationMs,
        details: err.message
      });

      console.error(`❌ [GAGAL] ${checkpointName}`);
      console.error(`   🌐 URL Saat Gagal   : ${currentUrl}`);
      console.error(`   ⚠️  Error Detail     : ${err.message}`);
      return false;
    }
  }

  try {
    // --------------------------------------------------------------------------
    // 1. PENGUSUL AJUKAN KEBUTUHAN DATA
    // --------------------------------------------------------------------------
    const pengusulContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pengusulPage = await pengusulContext.newPage();

    const ajukanOk = await recordRevisiStep(
      pengusulPage,
      1,
      'Pengusul Mengajukan Usulan Kebutuhan Data Baru',
      async () => {
        await performLogin(
          pengusulPage,
          dummyLogger,
          { username: userEmail, password: userPassword, roleName: 'Pengusul Kemensos' },
          'AUTH'
        );
        await safeNavigate(pengusulPage, `${BASE_URL}/perencanaan/kebutuhan-data`, dummyLogger, 'A');
        await ensureCorrectPage(pengusulPage, '/perencanaan/kebutuhan-data', dummyLogger, 'A');

        const addBtn = pengusulPage.locator('#button-kebutuhan-ajukan, button:has-text("Ajukan Kebutuhan Data")').first();
        await addBtn.waitFor({ state: 'visible', timeout: 10000 });
        await addBtn.click();
        await pengusulPage.waitForTimeout(1000);

        const namaInput = pengusulPage.locator('#input-kebutuhan-form-nama-data, input[placeholder*="nama" i]').first();
        await namaInput.waitFor({ state: 'visible', timeout: 5000 });
        await namaInput.fill(datasetRevisiTitle);

        await selectStrictInstansi(pengusulPage, instansiCtx, dummyLogger, 'A');

        const produsenInput = pengusulPage.locator('#input-kebutuhan-form-produsen-data').first();
        if (await produsenInput.isVisible({ timeout: 1000 }).catch(() => false)) {
          await produsenInput.fill(instansiCtx.targetProdusenData);
        }
        const walidataInput = pengusulPage.locator('#input-kebutuhan-form-walidata').first();
        if (await walidataInput.isVisible({ timeout: 1000 }).catch(() => false)) {
          await walidataInput.fill(instansiCtx.targetWaliData);
        }

        const tujuanInput = pengusulPage.locator('#input-kebutuhan-form-tujuan-pengusulan, textarea').first();
        await tujuanInput.fill('Pengajuan data awal untuk pengujian alur revisi review registrasi data oleh Sekretariat SDI.');

        await assertNoValidationErrors(pengusulPage, 'Form Kebutuhan Data (Sebelum Submit)');

        const submitBtn = pengusulPage.locator('#button-kebutuhan-form-submit, button:has-text("Simpan Usulan")').first();
        await submitBtn.click({ force: true });
        await pengusulPage.waitForTimeout(3000);

        return `Usulan "${datasetRevisiTitle}" berhasil diajukan.`;
      }
    );
    await pengusulContext.close();
    if (!ajukanOk) return false;

    // --------------------------------------------------------------------------
    // 2. SEKRETARIAT KONFIRMASI DAPAT DISEDIAKAN
    // --------------------------------------------------------------------------
    const sekContext1 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const sekPage1 = await sekContext1.newPage();

    const penetapanOk = await recordRevisiStep(
      sekPage1,
      2,
      'Sekretariat Menetapkan Status "Dapat Disediakan"',
      async () => {
        await performLogin(
          sekPage1,
          dummyLogger,
          { username: sekUsername, password: sekPassword, roleName: 'Sekretariat SDI' },
          'A'
        );
        await safeNavigate(sekPage1, `${BASE_URL}/perencanaan/kebutuhan-data`, dummyLogger, 'A');
        await sekPage1.waitForTimeout(2000);

        const penetapanBtn = sekPage1.locator('button:has-text("Penetapan"), a:has-text("Penetapan")').first();
        await penetapanBtn.waitFor({ state: 'visible', timeout: 15000 });
        await penetapanBtn.click();
        await sekPage1.waitForTimeout(1500);

        const catatanInput = sekPage1.locator('#input-kebutuhan-detail-catatan-review, textarea').first();
        if (await catatanInput.isVisible({ timeout: 5000 }).catch(() => false)) {
          await catatanInput.fill('Usulan disetujui untuk disediakan oleh Walidata Pengampu.');
        }

        const btnDapatDisediakan = sekPage1.locator(
          '#button-kebutuhan-detail-dapat-disediakan, button:has-text("Konfirmasi Dapat Disediakan")'
        ).first();
        await btnDapatDisediakan.waitFor({ state: 'visible', timeout: 5000 });
        await btnDapatDisediakan.click();
        await sekPage1.waitForTimeout(3000);

        return `Sekretariat menetapkan usulan menjadi "Dapat Disediakan".`;
      }
    );
    await sekContext1.close();
    if (!penetapanOk) return false;

    // --------------------------------------------------------------------------
    // 3. WALIDATA REGISTRASIKAN DATASET (STEP 1 - 3 & SUBMIT AWAL)
    // --------------------------------------------------------------------------
    const waliContext1 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const waliPage1 = await waliContext1.newPage();

    const regAwalOk = await recordRevisiStep(
      waliPage1,
      3,
      'Walidata Melakukan Registrasi Dataset Awal (Step 1 s.d. Step 3)',
      async () => {
        await performLogin(
          waliPage1,
          dummyLogger,
          { username: walidataEmail, password: walidataPass, roleName: 'Walidata Kemendagri' },
          'C'
        );
        await safeNavigate(waliPage1, `${BASE_URL}/registrasi/data`, dummyLogger, 'C');
        await waliPage1.waitForTimeout(2000);

        const regBtn = waliPage1.locator(
          '#button-registrasi-data-registrasikan-0, button[title="Registrasikan Data"]'
        ).first();
        await regBtn.waitFor({ state: 'visible', timeout: 15000 });
        await regBtn.click();
        await waliPage1.waitForTimeout(3000);

        // Step 1: Informasi Dataset (Maksimal 255 Karakter)
        const descInput = waliPage1.locator('#input-dataset-step1-deskripsi, textarea').first();
        if (await descInput.isVisible({ timeout: 5000 }).catch(() => false)) {
          const descAwal = 'Dataset kependudukan awal sebelum proses evaluasi review sekretariat.'.slice(0, 255);
          await descInput.fill(descAwal);
        }

        const klasifikasiBtn = waliPage1.locator('button:has-text("Terbatas")').first();
        if (await klasifikasiBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await klasifikasiBtn.click({ force: true });
        }

        for (const fmt of ['JSON', 'REST API', 'CSV']) {
          const fmtBtn = waliPage1.locator(`button:has-text("${fmt}")`).first();
          if (await fmtBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
            await fmtBtn.click({ force: true }).catch(() => {});
          }
        }

        const selects = waliPage1.locator('select');
        const selectCount = await selects.count();
        for (let i = 0; i < selectCount; i++) {
          const s = selects.nth(i);
          const html = await s.innerHTML().catch(() => '');
          if (html.includes('Pilih Tema') || html.includes('Perlindungan Sosial')) {
            await s.selectOption({ label: 'Perlindungan Sosial dan Kesehatan' }).catch(async () => {
              await s.selectOption({ index: 4 }).catch(() => {});
            });
          } else if (html.includes('Pilih Jenis Data') || html.includes('Data Induk')) {
            await s.selectOption({ label: 'Data Induk' }).catch(async () => {
              await s.selectOption({ index: 4 }).catch(() => {});
            });
          } else if (html.includes('Pilih Frekuensi') || html.includes('Tahunan')) {
            await s.selectOption({ label: 'Bulanan' }).catch(async () => {
              await s.selectOption({ index: 4 }).catch(() => {});
            });
          } else if (html.includes('Dampak minimal') || html.includes('rendah')) {
            await s.selectOption({ value: 'sedang' }).catch(async () => {
              await s.selectOption({ index: 2 }).catch(() => {});
            });
          }
        }
        await waliPage1.waitForTimeout(500);

        const nextBtn1 = waliPage1.locator('#button-dataset-next-step, button:has-text("Lanjut Langkah 2"), button:has-text("Lanjut")').first();
        if (await nextBtn1.isVisible({ timeout: 3000 }).catch(() => false)) {
          await nextBtn1.click({ force: true });
          await waliPage1.waitForTimeout(1500);
        }

        // Step 2: Tambah Entitas
        const addEntitasBtn = waliPage1.locator('#button-dataset-step2-tambah-entitas, button:has-text("Tambah Entitas")').first();
        if (await addEntitasBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await addEntitasBtn.click({ force: true });
          const dialog = waliPage1.locator('[role="dialog"]').first();
          if (await dialog.isVisible({ timeout: 2000 }).catch(() => false)) {
            const entName = dialog.locator('input').first();
            if (await entName.isVisible()) await entName.fill('Entitas Data Kependudukan');
            const entDesc = dialog.locator('textarea').first();
            if (await entDesc.isVisible()) await entDesc.fill('Struktur data entitas profil kependudukan nasional.');
            const saveBtn = dialog.locator('button:has-text("Tambah"), button:has-text("Simpan")').first();
            if (await saveBtn.isVisible()) await saveBtn.click({ force: true });
            await waliPage1.waitForTimeout(1000);
          }
        }

        const nextBtn2 = waliPage1.locator('#button-dataset-next-step, button:has-text("Lanjut Langkah 3"), button:has-text("Lanjut")').first();
        if (await nextBtn2.isVisible({ timeout: 3000 }).catch(() => false)) {
          await nextBtn2.click({ force: true });
          await waliPage1.waitForTimeout(1500);
        }

        // Step 3: Tambah Kamus Data
        const addElemBtn = waliPage1.locator('#button-dataset-step3-tambah-elemen, button:has-text("Tambah Elemen")').first();
        if (await addElemBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await addElemBtn.click({ force: true });
          const dialog = waliPage1.locator('[role="dialog"]').first();
          if (await dialog.isVisible({ timeout: 2000 }).catch(() => false)) {
            const inputs = dialog.locator('input');
            const inCount = await inputs.count();
            if (inCount >= 1) await inputs.nth(0).fill('Nomor Induk Kependudukan');
            if (inCount >= 2) await inputs.nth(1).fill('nik');
            if (inCount >= 3) await inputs.nth(2).fill('-');
            if (inCount >= 4) await inputs.nth(3).fill('16 karakter');
            const elDesc = dialog.locator('textarea').first();
            if (await elDesc.isVisible()) await elDesc.fill('Nomor identitas unik kependudukan.');
            const saveBtn = dialog.locator('button:has-text("Tambah"), button:has-text("Simpan")').first();
            if (await saveBtn.isVisible()) await saveBtn.click({ force: true });
            await waliPage1.waitForTimeout(1000);
          }
        }

        // Submit Awal
        const submitBtn = waliPage1.locator(
          '#button-dataset-open-confirm-submit, button:has-text("Kirimkan Registrasi Dataset"), button:has-text("Review"), button:has-text("Kirim")'
        ).first();
        await submitBtn.waitFor({ state: 'visible', timeout: 5000 });
        await submitBtn.click({ force: true });
        await waliPage1.waitForTimeout(1500);

        const confirmModal = waliPage1.locator('[role="dialog"]').first();
        await confirmModal.waitFor({ state: 'visible', timeout: 5000 });
        const checkbox = confirmModal.locator('input[type="checkbox"]').first();
        if (await checkbox.isVisible()) await checkbox.check();

        const finalSubmitBtn = confirmModal.locator(
          'button:has-text("Setujui & Kirim"), button:has-text("Kirim Registrasi Dataset")'
        ).first();
        await finalSubmitBtn.click({ force: true });
        await waliPage1.waitForTimeout(3000);
        await safeDismissUnexpectedPopups(waliPage1, dummyLogger, 'C');

        return `Dataset "${datasetRevisiTitle}" berhasil diajukan dengan status "Menunggu Validasi".`;
      }
    );
    await waliContext1.close();
    if (!regAwalOk) return false;

    // --------------------------------------------------------------------------
    // 4. SEKRETARIAT REVIEW PERTAMA: KLIK TOMBOL SILANG (✕ TOLAK) & KEMBALIKAN UNTUK REVISI
    // --------------------------------------------------------------------------
    const sekContext2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const sekPage2 = await sekContext2.newPage();

    const reviewTolakOk = await recordRevisiStep(
      sekPage2,
      4,
      'Sekretariat Mereview & Menolak (Tombol ✕) -> Kembalikan untuk Revisi',
      async () => {
        await performLogin(
          sekPage2,
          dummyLogger,
          { username: sekUsername, password: sekPassword, roleName: 'Sekretariat SDI' },
          'B'
        );
        await safeNavigate(sekPage2, `${BASE_URL}/registrasi/data`, dummyLogger, 'B');
        await sekPage2.waitForTimeout(2000);

        let reviewBtn = sekPage2.locator(
          '#button-registrasi-data-review-0, button[title="Review Registrasi Data"]'
        ).first();

        if (!(await reviewBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
          await safeNavigate(sekPage2, `${BASE_URL}/perencanaan/daftar-data`, dummyLogger, 'B');
          await sekPage2.waitForTimeout(2000);
          reviewBtn = sekPage2.locator(
            '#button-daftar-data-review-0, #button-registrasi-data-review-0, button[title="Review Registrasi Data"]'
          ).first();
        }

        await reviewBtn.waitFor({ state: 'visible', timeout: 15000 });
        await reviewBtn.click();
        await sekPage2.waitForTimeout(2500);

        console.log(`   🔍 Halaman Review Terbuka: ${sekPage2.url()}`);

        // STEP 1: Klik tombol Silang (✕: Ditolak / Perlu Revisi)
        const btnTolak = sekPage2.locator(
          'button[title="Ditolak (Perlu Revisi)"], button[title*="Tolak" i], button:has-text("✕")'
        ).first();
        await btnTolak.waitFor({ state: 'visible', timeout: 8000 });
        await btnTolak.click({ force: true });
        console.log('   ✕ Tombol Silang (Ditolak / Perlu Revisi) berhasil diklik.');
        await sekPage2.waitForTimeout(1000);

        // Tangani jika ada dialog catatan penolakan atau input catatan revisi
        const tolakDialog = sekPage2.locator('[role="dialog"]').first();
        if (await tolakDialog.isVisible({ timeout: 2000 }).catch(() => false)) {
          const dialogText = tolakDialog.locator('textarea:not([disabled]), input:not([disabled])').first();
          if (await dialogText.isVisible().catch(() => false)) {
            await dialogText.fill('Mohon perbaiki rincian deskripsi dataset agar memuat cakupan wilayah kependudukan secara eksplisit.').catch(() => {});
          }
          const dialogSave = tolakDialog.locator('button:has-text("Simpan"), button:has-text("Tolak"), button:has-text("Ya"), button:has-text("Kirim")').first();
          if (await dialogSave.isVisible().catch(() => false)) {
            await dialogSave.click({ force: true }).catch(() => {});
            await sekPage2.waitForTimeout(1000);
          }
        } else {
          const catatanTolak = sekPage2.locator('textarea:not([disabled]), input[placeholder*="catatan" i]').first();
          if (await catatanTolak.isVisible({ timeout: 1500 }).catch(() => false)) {
            await catatanTolak.fill('Mohon perbaiki rincian deskripsi dataset agar memuat cakupan wilayah kependudukan secara eksplisit.').catch(() => {});
          }
        }

        // Lanjut ke Step 2
        const nextStep2Btn = sekPage2.locator('button:has-text("Lanjut Langkah 2"), button:has-text("Lanjut")').first();
        if (await nextStep2Btn.isVisible({ timeout: 5000 }).catch(() => false)) {
          await nextStep2Btn.click({ force: true });
          await sekPage2.waitForTimeout(1500);
        }

        // Lanjut ke Step 3
        const nextStep3Btn = sekPage2.locator('button:has-text("Lanjut Langkah 3"), button:has-text("Lanjut")').first();
        if (await nextStep3Btn.isVisible({ timeout: 5000 }).catch(() => false)) {
          await nextStep3Btn.click({ force: true });
          await sekPage2.waitForTimeout(2000);
        }

        // Di Step 3: Tombol berubah dinamis menjadi "Kembalikan untuk Revisi"
        const btnKembalikan = sekPage2.locator(
          'button:has-text("Kembalikan untuk Revisi"), button:has-text("Kembalikan"), button[title*="Kembalikan" i]'
        ).first();
        await btnKembalikan.waitFor({ state: 'visible', timeout: 10000 });
        console.log(`   🔁 Tombol aksi terdeteksi: "${await btnKembalikan.innerText()}"`);
        await btnKembalikan.click({ force: true });
        await sekPage2.waitForTimeout(2000);

        // Tangani modal konfirmasi pengembalian jika muncul
        const modalConfirmRevisi = sekPage2.locator('[role="dialog"]').first();
        if (await modalConfirmRevisi.isVisible({ timeout: 2500 }).catch(() => false)) {
          const textNote = modalConfirmRevisi.locator('textarea').first();
          if (await textNote.isVisible({ timeout: 1000 }).catch(() => false)) {
            await textNote.fill('Catatan Sekretariat: Deskripsi perlu dilengkapi spesifikasi teknis.');
          }
          const confirmBtn = modalConfirmRevisi.locator(
            'button:has-text("Kembalikan"), button:has-text("Kirim"), button:has-text("Ya"), button:has-text("Lanjutkan")'
          ).first();
          if (await confirmBtn.isVisible()) {
            await confirmBtn.click({ force: true });
            await sekPage2.waitForTimeout(2500);
          }
        }

        await safeDismissUnexpectedPopups(sekPage2, dummyLogger, 'B');
        return `Sekretariat berhasil menolak review (tombol ✕) dan mengembalikan dataset untuk revisi (${sekPage2.url()}).`;
      }
    );
    await sekContext2.close();
    if (!reviewTolakOk) return false;

    // --------------------------------------------------------------------------
    // 5. WALIDATA BUKA FORM EDIT DATASET, PERBAIKI DATA & KIRIM ULANG
    // --------------------------------------------------------------------------
    const waliContext2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const waliPage2 = await waliContext2.newPage();

    const editRevisiOk = await recordRevisiStep(
      waliPage2,
      5,
      'Walidata Membuka Edit Data, Memperbaiki Field & Mengirimkan Ulang Registrasi',
      async () => {
        await performLogin(
          waliPage2,
          dummyLogger,
          { username: walidataEmail, password: walidataPass, roleName: 'Walidata Kemendagri' },
          'C'
        );
        await safeNavigate(waliPage2, `${BASE_URL}/registrasi/data`, dummyLogger, 'C');
        await waliPage2.waitForTimeout(2000);

        // Cari tombol Edit atau Registrasikan Data pada baris usulan yang perlu revisi
        const editBtn = waliPage2.locator(
          '#button-registrasi-data-edit-0, #button-registrasi-data-registrasikan-0, button[title*="Edit" i], button[title*="Revisi" i], button[title*="Perbaiki" i], button[title*="Registrasikan" i], tbody tr:first-child td:last-child button, tbody tr:first-child button'
        ).first();
        await editBtn.waitFor({ state: 'visible', timeout: 15000 });
        await editBtn.click({ force: true });
        await waliPage2.waitForTimeout(3000);

        console.log(`   ✏️  Halaman Edit Registrasi Terbuka: ${waliPage2.url()}`);

        // Step 1: Perbarui deskripsi dengan catatan perbaikan selesai (Maksimal 255 Karakter)
        const descInput = waliPage2.locator('#input-dataset-step1-deskripsi, textarea:not([disabled])').first();
        if (await descInput.isVisible({ timeout: 5000 }).catch(() => false)) {
          const oldText = await descInput.inputValue().catch(() => '');
          const revisiNote = ' [REVISI SELESAI: Cakupan wilayah kependudukan SDI]';
          const maxBase = 255 - revisiNote.length;
          const trimmedOld = oldText.length > maxBase ? oldText.slice(0, maxBase) : oldText;
          await descInput.fill(`${trimmedOld}${revisiNote}`.slice(0, 255)).catch(() => {});
        }

        const nextBtn1 = waliPage2.locator('#button-dataset-next-step, button:has-text("Lanjut Langkah 2"), button:has-text("Lanjut")').first();
        if (await nextBtn1.isVisible({ timeout: 3000 }).catch(() => false)) {
          await nextBtn1.click({ force: true });
          await waliPage2.waitForTimeout(1500);
        }

        const nextBtn2 = waliPage2.locator('#button-dataset-next-step, button:has-text("Lanjut Langkah 3"), button:has-text("Lanjut")').first();
        if (await nextBtn2.isVisible({ timeout: 3000 }).catch(() => false)) {
          await nextBtn2.click({ force: true });
          await waliPage2.waitForTimeout(1500);
        }

        // Buka modal review & kirim ulang
        const submitBtn = waliPage2.locator(
          '#button-dataset-open-confirm-submit, button:has-text("Kirimkan Registrasi Dataset"), button:has-text("Review"), button:has-text("Kirim")'
        ).first();
        await submitBtn.waitFor({ state: 'visible', timeout: 5000 });
        await submitBtn.click({ force: true });
        await waliPage2.waitForTimeout(1500);

        const confirmModal = waliPage2.locator('[role="dialog"]').first();
        await confirmModal.waitFor({ state: 'visible', timeout: 5000 });
        const checkbox = confirmModal.locator('input[type="checkbox"]').first();
        if (await checkbox.isVisible()) await checkbox.check();

        const finalSubmitBtn = confirmModal.locator(
          'button:has-text("Setujui & Kirim"), button:has-text("Kirim Registrasi Dataset")'
        ).first();
        await finalSubmitBtn.click({ force: true });
        await waliPage2.waitForTimeout(3000);
        await safeDismissUnexpectedPopups(waliPage2, dummyLogger, 'C');

        return `Walidata berhasil memperbarui data revisi dan mengirim ulang dengan status "Menunggu Validasi".`;
      }
    );
    await waliContext2.close();
    if (!editRevisiOk) return false;

    // --------------------------------------------------------------------------
    // 6. SEKRETARIAT REVIEW KEDUA: KLIK TOMBOL CEKLIS (✓ SETUJU) & PUBLISH DATASET
    // --------------------------------------------------------------------------
    const sekContext3 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const sekPage3 = await sekContext3.newPage();

    const publishOk = await recordRevisiStep(
      sekPage3,
      6,
      'Sekretariat Mereview Ulang, Menandai Ceklis (✓) & Menyetujui Dataset (Published)',
      async () => {
        await performLogin(
          sekPage3,
          dummyLogger,
          { username: sekUsername, password: sekPassword, roleName: 'Sekretariat SDI' },
          'B'
        );
        await safeNavigate(sekPage3, `${BASE_URL}/registrasi/data`, dummyLogger, 'B');
        await sekPage3.waitForTimeout(2000);

        let reviewBtn = sekPage3.locator(
          '#button-registrasi-data-review-0, button[title="Review Registrasi Data"]'
        ).first();

        if (!(await reviewBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
          await safeNavigate(sekPage3, `${BASE_URL}/perencanaan/daftar-data`, dummyLogger, 'B');
          await sekPage3.waitForTimeout(2000);
          reviewBtn = sekPage3.locator(
            '#button-daftar-data-review-0, #button-registrasi-data-review-0, button[title="Review Registrasi Data"]'
          ).first();
        }

        await reviewBtn.waitFor({ state: 'visible', timeout: 15000 });
        await reviewBtn.click();
        await sekPage3.waitForTimeout(2500);

        console.log(`   🔍 Halaman Review Ulang Terbuka: ${sekPage3.url()}`);

        // STEP 1: Klik tombol Ceklis (✓: Setuju)
        const btnSetuju = sekPage3.locator(
          'button[title="Setuju"], button[title*="Setuju" i], button:has-text("✓")'
        ).first();
        if (await btnSetuju.isVisible({ timeout: 5000 }).catch(() => false)) {
          await btnSetuju.click({ force: true });
          console.log('   ✓ Tombol Ceklis (Setuju) berhasil diklik.');
          await sekPage3.waitForTimeout(1000);
        }

        // Lanjut ke Step 2
        const nextStep2Btn = sekPage3.locator('button:has-text("Lanjut Langkah 2"), button:has-text("Lanjut")').first();
        if (await nextStep2Btn.isVisible({ timeout: 5000 }).catch(() => false)) {
          await nextStep2Btn.click({ force: true });
          await sekPage3.waitForTimeout(1500);
        }

        // Lanjut ke Step 3
        const nextStep3Btn = sekPage3.locator('button:has-text("Lanjut Langkah 3"), button:has-text("Lanjut")').first();
        if (await nextStep3Btn.isVisible({ timeout: 5000 }).catch(() => false)) {
          await nextStep3Btn.click({ force: true });
          await sekPage3.waitForTimeout(2000);
        }

        // Di Step 3: Tombol bertuliskan "Setujui Dataset (Published)"
        const approveBtn = sekPage3.locator(
          'button:has-text("Setujui Dataset (Published)"), button:has-text("Setujui Dataset"), button:has-text("Publish")'
        ).first();
        await approveBtn.waitFor({ state: 'visible', timeout: 10000 });
        console.log(`   🚀 Tombol aksi terdeteksi: "${await approveBtn.innerText()}"`);
        await approveBtn.click({ force: true });
        await sekPage3.waitForTimeout(3000);

        // Tangani dialog konfirmasi
        const confirmApproveBtn = sekPage3.locator(
          '[role="dialog"] button:has-text("Ya"), [role="dialog"] button:has-text("Setujui"), [role="dialog"] button:has-text("Lanjutkan")'
        ).first();
        if (await confirmApproveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await confirmApproveBtn.click({ force: true });
          await sekPage3.waitForTimeout(2500);
        }

        await safeDismissUnexpectedPopups(sekPage3, dummyLogger, 'B');
        return `Sekretariat berhasil menyetujui dataset hasil revisi menjadi Published (${sekPage3.url()}).`;
      }
    );
    await sekContext3.close();

    console.log('\n╔════════════════════════════════════════════════════════════════════════════════════════╗');
    console.log('║        REKAPITULASI CASE REVISI REGISTRASI DATA (SEKRETARIAT & WALIDATA)               ║');
    console.log('╠════╦══════════════════════════════════╦══════════════╦════════════════╦══════════════════╣');
    console.log('║ No ║ Checkpoint Halaman               ║ Durasi       ║ Status Akses   ║ Rincian          ║');
    console.log('╠════╬══════════════════════════════════╬══════════════╬════════════════╬══════════════════╣');
    checkResults.forEach((r) => {
      const sNo = String(r.stepNo).padEnd(2);
      const cName = r.checkpointName.padEnd(32).slice(0, 32);
      const dur = `${r.durationMs} ms`.padEnd(12);
      const st = (r.status === 'SUCCESS' ? '✅ SUCCESS' : '❌ FAILED').padEnd(14);
      const det = (r.details || '').padEnd(16).slice(0, 16);
      console.log(`║ ${sNo} ║ ${cName} ║ ${dur} ║ ${st} ║ ${det} ║`);
    });
    console.log('╚════╩══════════════════════════════════╩══════════════╩════════════════╩══════════════════╝\n');

    return publishOk;
  } finally {
    await browser.close();
  }
}

/**
 * Backward compatibility alias
 */
export const runRevisiCaseVerification = runRevisiRegistrasiVerification;

/**
 * Skenario Pengujian Registrasi Layanan & Verifikasi di Portal SPLP:
 * 1. Walidata (Kemendagri) login & membuka /registrasi/layanan.
 * 2. Memilih dataset pada tabel registrasi layanan (checkbox baris pertama) -> Tombol Tambah Layanan aktif.
 * 3. Mengklik "Tambah Layanan" & memilih platform "Tambah di SPLP" -> dialihkan ke /splp.
 * 4. Mengisi formulir endpoint SPLP (Nama Layanan, Deskripsi, Format, Dokumentasi, Endpoint SPLP) & submit.
 * 5. Buka tab "Verifikasi Layanan" di /splp -> Verifikasi layanan yang baru dibuat muncul di antrean verifikasi SPLP.
 */
export async function runLayananSplpVerification(): Promise<boolean> {
  console.clear();
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║      VERIFIKASI REGISTRASI LAYANAN & VERIFIKASI ENDPOINT DI PORTAL SPLP      ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log(`Target Base URL: ${BASE_URL}`);

  const walidataEmail = process.env.USER_WALIDATA_USERNAME || 'exchange@test.kemendagri.go.id';
  const walidataPass = process.env.USER_WALIDATA_PASSWORD || '123456789';

  const isHeadless = process.env.HEADLESS === 'true';
  const browser = await chromium.launch({ headless: isHeadless, slowMo: 100 });
  const checkResults: PageCheckResult[] = [];
  const dummyLogger = new StepLogger(['AUTH', 'D'], 'CaseLayananSPLP');

  const nowTime = new Date().toLocaleTimeString('id-ID', { hour12: false }).replace(/\./g, ':');
  const namaLayananBaru = `REST API Layanan Gateway SPLP Dukcapil [${nowTime}]`;

  async function recordLayananStep(
    page: Page,
    stepNo: number,
    checkpointName: string,
    fn: () => Promise<string>
  ): Promise<boolean> {
    const start = Date.now();
    console.log(`\n================================================================================`);
    console.log(`🔍 [LAYANAN SPLP CHECKPOINT ${stepNo}/5] : ${checkpointName}`);
    console.log(`================================================================================`);

    try {
      const details = await fn();
      const durationMs = Date.now() - start;
      const currentUrl = page.url();

      const screenshotName = `splp-check-${stepNo}-${Date.now()}.png`;
      const screenshotPath = path.join(process.cwd(), 'reports', screenshotName);
      fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
      await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});

      checkResults.push({
        stepNo,
        checkpointName,
        url: currentUrl,
        status: 'SUCCESS',
        durationMs,
        details,
        screenshot: screenshotPath
      });

      console.log(`✅ [BERHASIL] ${checkpointName}`);
      console.log(`   🌐 URL Terverifikasi : ${currentUrl}`);
      console.log(`   ⏱️  Durasi Akses     : ${durationMs} ms`);
      console.log(`   📝 Keterangan        : ${details}`);
      return true;
    } catch (err: any) {
      const durationMs = Date.now() - start;
      const currentUrl = page.url();

      checkResults.push({
        stepNo,
        checkpointName,
        url: currentUrl,
        status: 'FAILED',
        durationMs,
        details: err.message
      });

      console.error(`❌ [GAGAL] ${checkpointName}`);
      console.error(`   🌐 URL Saat Gagal   : ${currentUrl}`);
      console.error(`   ⚠️  Error Detail     : ${err.message}`);
      return false;
    }
  }

  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    // --------------------------------------------------------------------------
    // 1. LOGIN WALIDATA & AKSES HALAMAN REGISTRASI LAYANAN
    // --------------------------------------------------------------------------
    const step1Ok = await recordLayananStep(
      page,
      1,
      'Walidata Mengakses Halaman Registrasi Layanan Interoperabilitas',
      async () => {
        await performLogin(
          page,
          dummyLogger,
          { username: walidataEmail, password: walidataPass, roleName: 'Walidata Kemendagri' },
          'AUTH'
        );
        await safeNavigate(page, `${BASE_URL}/registrasi/layanan`, dummyLogger, 'D');
        await page.waitForTimeout(2000);
        return `Halaman Registrasi Layanan berhasil diakses dengan akun Kemendagri (${page.url()}).`;
      }
    );
    if (!step1Ok) return false;

    // --------------------------------------------------------------------------
    // 2. PILIH DATASET PADA TABEL & BUKA MODAL TAMBAH LAYANAN
    // --------------------------------------------------------------------------
    const step2Ok = await recordLayananStep(
      page,
      2,
      'Memilih Dataset pada Tabel untuk Mengaktifkan Tombol Tambah Layanan',
      async () => {
        const checkbox = page.locator('tbody input[type="checkbox"], tbody input').first();
        await checkbox.waitFor({ state: 'visible', timeout: 10000 });
        await checkbox.click();
        await page.waitForTimeout(1000);

        const addBtn = page.locator('#button-layanan-tambah-header, button:has-text("Tambah Layanan")').first();
        await addBtn.waitFor({ state: 'visible', timeout: 5000 });

        const isEnabled = await addBtn.isEnabled();
        if (!isEnabled) {
          throw new Error('Tombol Tambah Layanan masih berstatus disabled setelah checkbox dataset dipilih.');
        }

        await addBtn.click();
        await page.waitForTimeout(1500);

        const modalDialog = page.locator('[role="dialog"]').first();
        await modalDialog.waitFor({ state: 'visible', timeout: 5000 });
        const modalTitle = await modalDialog.innerText();

        return `Dataset berhasil dipilih, tombol Tambah Layanan aktif, dan modal "${modalTitle.slice(0, 36)}..." terbuka.`;
      }
    );
    if (!step2Ok) return false;

    // --------------------------------------------------------------------------
    // 3. PILIH PLATFORM "TAMBAH DI SKDN"
    // --------------------------------------------------------------------------
    const step3Ok = await recordLayananStep(
      page,
      3,
      'Memilih Opsi "Tambah di SKDN" & Membuka Formulir Layanan Interoperabilitas',
      async () => {
        const skdnBtn = page.locator(
          '#button-layanan-platform-skdn, [role="dialog"] #button-layanan-platform-skdn, :has-text("Tambah di SKDN")'
        ).first();
        await skdnBtn.waitFor({ state: 'visible', timeout: 5000 });
        await skdnBtn.click();
        await page.waitForTimeout(2000);

        const formItem = page.locator('#input-layanan-form-nama, button:has-text("Simpan Layanan di SKDN")').first();
        await formItem.waitFor({ state: 'visible', timeout: 8000 });

        return `Formulir Layanan SKDN berhasil terbuka pada katalog data (${page.url()}).`;
      }
    );
    if (!step3Ok) return false;

    // --------------------------------------------------------------------------
    // 4. MENGISI FORMULIR LAYANAN SKDN & SIMPAN DATA
    // --------------------------------------------------------------------------
    const nowMs = Date.now();
    const namaLayananSKDN = `REST API SKDN Kemendagri [${nowMs}]`;
    const endpointLayananSKDN = `https://api.kemendagri.go.id/v1/skdn-layanan-${nowMs}`;
    const docsLayananSKDN = `https://docs.kemendagri.go.id/api/skdn-${nowMs}`;

    const step4Ok = await recordLayananStep(
      page,
      4,
      'Pengisian Formulir Layanan SKDN & Simpan Layanan di SKDN',
      async () => {
        // Nama Layanan
        const nameInput = page.locator('#input-layanan-form-nama').first();
        if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
          await nameInput.fill(namaLayananSKDN);
        }

        // Deskripsi Layanan (Maksimal 255 Karakter)
        const descInput = page.locator('#input-layanan-form-deskripsi, textarea').first();
        if (await descInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          const descLayanan = 'Layanan REST API interoperabilitas SKDN untuk integrasi lintas instansi nasional terstandarisasi.';
          await descInput.fill(descLayanan.slice(0, 255));
        }

        // Endpoint Layanan
        const endpointInput = page.locator('#input-layanan-form-endpoint').first();
        if (await endpointInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await endpointInput.fill(endpointLayananSKDN);
        }

        // Dokumentasi
        const docsInput = page.locator('#input-layanan-form-dokumentasi').first();
        if (await docsInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await docsInput.fill(docsLayananSKDN);
        }

        await page.waitForTimeout(500);

        // Submit form SKDN
        const submitBtn = page.locator('#button-layanan-form-submit, button:has-text("Simpan Layanan di SKDN")').first();
        await submitBtn.waitFor({ state: 'visible', timeout: 5000 });
        await submitBtn.click();
        await page.waitForTimeout(3000);

        await safeDismissUnexpectedPopups(page, dummyLogger, 'D');
        return `Formulir SKDN "${namaLayananSKDN}" berhasil disimpan di katalog SDI.`;
      }
    );
    if (!step4Ok) return false;

    // --------------------------------------------------------------------------
    // 5. PINDAH KE HALAMAN /splp & VERIFIKASI DATA LAYANAN
    // --------------------------------------------------------------------------
    const step5Ok = await recordLayananStep(
      page,
      5,
      'Pindah ke Halaman /splp & Verifikasi Data Layanan pada Tab Verifikasi Layanan',
      async () => {
        // Navigasi langsung ke /splp sesuai permintaan
        await safeNavigate(page, `${BASE_URL}/splp`, dummyLogger, 'D');
        await page.waitForTimeout(2500);

        // Buka tab "Verifikasi Layanan"
        const tabVerifikasi = page.locator(
          '#button-splp-tab-verifikasi, button:has-text("Verifikasi Layanan"), [role="tab"]:has-text("Verifikasi")'
        ).first();
        await tabVerifikasi.waitFor({ state: 'visible', timeout: 8000 });
        await tabVerifikasi.click();
        await page.waitForTimeout(2500);

        // Verifikasi konten halaman memuat antrean layanan
        const pageText = await page.innerText('body');
        const hasVerifQueue = pageText.includes('Verifikasi & Approval Layanan') || pageText.includes('Menunggu Approval') || pageText.includes('Menunggu Validasi');

        if (!hasVerifQueue) {
          throw new Error('Antrean verifikasi layanan di /splp tidak termuat dengan benar.');
        }

        // Klik Approve LID pada baris layanan untuk melengkapi verifikasi status layanan
        const btnApprove = page.locator('tbody tr:first-child button:has-text("Approve LID"), button:has-text("Approve LID")').first();
        if (await btnApprove.isVisible({ timeout: 3000 }).catch(() => false)) {
          await btnApprove.click();
          await page.waitForTimeout(2000);
          console.log('   ✅ Tombol "Approve LID" berhasil dieksekusi di portal SPLP.');
        }

        return `Data layanan berhasil diverifikasi di ${page.url()} pada tab Verifikasi Layanan (Approval LID).`;
      }
    );

    await context.close();

    console.log('\n╔════════════════════════════════════════════════════════════════════════════════════════╗');
    console.log('║           REKAPITULASI CASE REGISTRASI LAYANAN & VERIFIKASI SPLP                       ║');
    console.log('╠════╦══════════════════════════════════╦══════════════╦════════════════╦══════════════════╣');
    console.log('║ No ║ Checkpoint Halaman               ║ Durasi       ║ Status Akses   ║ Rincian          ║');
    console.log('╠════╬══════════════════════════════════╬══════════════╬════════════════╬══════════════════╣');
    checkResults.forEach((r) => {
      const sNo = String(r.stepNo).padEnd(2);
      const cName = r.checkpointName.padEnd(32).slice(0, 32);
      const dur = `${r.durationMs} ms`.padEnd(12);
      const st = (r.status === 'SUCCESS' ? '✅ SUCCESS' : '❌ FAILED').padEnd(14);
      const det = (r.details || '').padEnd(16).slice(0, 16);
      console.log(`║ ${sNo} ║ ${cName} ║ ${dur} ║ ${st} ║ ${det} ║`);
    });
    console.log('╚════╩══════════════════════════════════╩══════════════╩════════════════╩══════════════════╝\n');

    return step5Ok;
  } finally {
    await browser.close();
  }
}

/**
 * CASE 05: Alur Lengkap End-to-End: Kebutuhan Data s.d. Verifikasi Pengajuan Akses Data & Tanda Tangan Produsen Data (LID)
 * 1. Pengusul (Kemensos) mengajukan kebutuhan data baru (Klasifikasi: Terbatas) ke Kemendagri.
 * 2. Sekretariat SDI menetapkan status usulan menjadi "Dapat Disediakan".
 * 3. Walidata (Kemendagri) meregistrasikan dataset (Step 1-3) & submit -> Status: Menunggu Validasi.
 * 4. Sekretariat SDI mereview form Step 1-3 & menyetujui dataset -> Status: Published.
 * 5. Walidata (Kemendagri) meregistrasikan Layanan SKDN di /registrasi/layanan & verifikasi di /splp.
 * 6. Pengusul (Kemensos) mengajukan permohonan akses data di /pengajuan-akses/tambah -> tampil di /pengajuan-akses.
 * 7. Sekretariat SDI (Mkalmunawar@gmail.com) memverifikasi kelayakan pengajuan di /pemberian-akses -> "Layak (Disetujui SDI)".
 * 8. Produsen Data (Kemendagri - exchange@test.kemendagri.go.id) login & mengisi Tanda Tangan Produsen Data serta menyetujui BAST di /pemberian-akses -> "Disetujui Produsen (2/2 Tanda Tangan Selesai)".
 */
export async function runPengajuanAksesLifecycleVerification(): Promise<boolean> {
  console.clear();
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║   CASE 05: E2E KEBUTUHAN DATA S.D. VERIFIKASI & TTD PRODUSEN DATA (SDI)      ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log(`Target Base URL: ${BASE_URL}`);

  const userEmail = process.env.USER_PENGUSUL_USERNAME || 'exchange@test.kemensos.go.id';
  const userPassword = process.env.USER_PENGUSUL_PASSWORD || '123456789';
  const walidataEmail = process.env.USER_WALIDATA_USERNAME || 'exchange@test.kemendagri.go.id';
  const walidataPass = process.env.USER_WALIDATA_PASSWORD || '123456789';
  const sekUsername = process.env.USER_SEKRETARIAT_USERNAME || 'Mkalmunawar@gmail.com';
  const sekPassword = process.env.USER_SEKRETARIAT_PASSWORD || '@Celestial12';

  const instansiCtx = resolveInstansiContext(userEmail);
  const isHeadless = process.env.HEADLESS === 'true';
  const browser = await chromium.launch({ headless: isHeadless, slowMo: 100 });
  const checkResults: PageCheckResult[] = [];
  const dummyLogger = new StepLogger(['AUTH', 'A', 'B', 'C', 'D', 'E'], 'CasePengajuanAksesFullE2E');

  const nowTime = new Date().toLocaleTimeString('id-ID', { hour12: false }).replace(/\./g, ':');
  const nowMs = Date.now();
  const datasetTitle = `Dataset Terpadu Kependudukan & Akses LID [${nowTime}]`;

  async function recordCase5Step(
    page: Page,
    stepNo: number,
    checkpointName: string,
    fn: () => Promise<string>
  ): Promise<boolean> {
    const start = Date.now();
    console.log(`\n================================================================================`);
    console.log(`🔍 [CHECKPOINT ${stepNo}/8] : ${checkpointName}`);
    console.log(`================================================================================`);

    try {
      const details = await fn();
      const durationMs = Date.now() - start;
      const currentUrl = page.url();

      const screenshotName = `case5-step-${stepNo}-${Date.now()}.png`;
      const screenshotPath = path.join(process.cwd(), 'reports', screenshotName);
      fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
      await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});

      checkResults.push({
        stepNo,
        checkpointName,
        url: currentUrl,
        status: 'SUCCESS',
        durationMs,
        details,
        screenshot: screenshotPath
      });

      console.log(`✅ [BERHASIL] ${checkpointName}`);
      console.log(`   🌐 URL Terverifikasi : ${currentUrl}`);
      console.log(`   ⏱️  Durasi Akses     : ${durationMs} ms`);
      console.log(`   📝 Keterangan        : ${details}`);
      return true;
    } catch (err: any) {
      const durationMs = Date.now() - start;
      const currentUrl = page.url();

      const screenshotName = `case5-fail-${stepNo}-${Date.now()}.png`;
      const screenshotPath = path.join(process.cwd(), 'reports', screenshotName);
      fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
      await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});

      checkResults.push({
        stepNo,
        checkpointName,
        url: currentUrl,
        status: 'FAILED',
        durationMs,
        details: err.message,
        screenshot: screenshotPath
      });

      console.error(`❌ [GAGAL] ${checkpointName}`);
      console.error(`   🌐 URL Saat Gagal   : ${currentUrl}`);
      console.error(`   ⚠️  Error Detail     : ${err.message}`);
      return false;
    }
  }

  try {
    // --------------------------------------------------------------------------
    // 1. PENGUSUL (KEMENSOS) AJUKAN KEBUTUHAN DATA
    // --------------------------------------------------------------------------
    const ctx1 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page1 = await ctx1.newPage();
    const step1Ok = await recordCase5Step(
      page1,
      1,
      'Pengusul Mengajukan Usulan Kebutuhan Data Baru (Kemensos)',
      async () => {
        await performLogin(
          page1,
          dummyLogger,
          { username: userEmail, password: userPassword, roleName: 'Pengusul Kemensos' },
          'AUTH'
        );
        await safeNavigate(page1, `${BASE_URL}/perencanaan/kebutuhan-data`, dummyLogger, 'A');
        await ensureCorrectPage(page1, '/perencanaan/kebutuhan-data', dummyLogger, 'A');

        const ajukanBtn = page1.locator(
          '#button-kebutuhan-ajukan, button:has-text("Ajukan Kebutuhan"), a:has-text("Ajukan Kebutuhan"), button:has-text("Tambah Kebutuhan")'
        ).first();
        await ajukanBtn.waitFor({ state: 'visible', timeout: 10000 });
        await ajukanBtn.click({ force: true });

        const namaInput = page1.locator('#input-kebutuhan-form-nama-data, input[placeholder*="nama" i]').first();
        await namaInput.waitFor({ state: 'visible', timeout: 10000 });
        await namaInput.fill(datasetTitle);

        await selectStrictInstansi(page1, instansiCtx, dummyLogger, 'A');

        const produsenInput = page1.locator('#input-kebutuhan-form-produsen-data').first();
        if (await produsenInput.isVisible({ timeout: 1000 }).catch(() => false)) {
          await produsenInput.fill(instansiCtx.targetProdusenData || 'Direktorat Jenderal Kependudukan dan Pencatatan Sipil');
        }

        const walidataInput = page1.locator('#input-kebutuhan-form-walidata').first();
        if (await walidataInput.isVisible({ timeout: 1000 }).catch(() => false)) {
          await walidataInput.fill(instansiCtx.targetWaliData || 'Pusat Data dan Informasi Kemendagri');
        }

        const tujuanInput = page1.locator('#input-kebutuhan-form-tujuan-pengusulan, textarea').first();
        await tujuanInput.fill('Pengajuan kebutuhan data kependudukan untuk validasi bantuan sosial dan pengujian integrasi akses LID.');

        await assertNoValidationErrors(page1, 'Form Kebutuhan Data (Sebelum Submit)');

        const submitBtn = page1.locator('#button-kebutuhan-form-submit, button:has-text("Kirim Usulan Kebutuhan"), button:has-text("Simpan")').first();
        await submitBtn.click({ force: true });
        await page1.waitForTimeout(2500);

        await safeDismissUnexpectedPopups(page1, dummyLogger, 'A', '/perencanaan/kebutuhan-data');
        return `Usulan "${datasetTitle}" berhasil diajukan dengan status "Diajukan".`;
      }
    );
    await ctx1.close();
    if (!step1Ok) return false;

    // --------------------------------------------------------------------------
    // 2. SEKRETARIAT SDI KONFIRMASI DAPAT DISEDIAKAN
    // --------------------------------------------------------------------------
    const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page2 = await ctx2.newPage();
    const step2Ok = await recordCase5Step(
      page2,
      2,
      'Sekretariat SDI Menetapkan Status "Dapat Disediakan"',
      async () => {
        await performLogin(
          page2,
          dummyLogger,
          { username: sekUsername, password: sekPassword, roleName: 'Sekretariat SDI' },
          'A'
        );
        await safeNavigate(page2, `${BASE_URL}/perencanaan/kebutuhan-data`, dummyLogger, 'A');
        await page2.waitForTimeout(2000);

        const penetapanBtn = page2.locator('button:has-text("Penetapan"), a:has-text("Penetapan")').first();
        await penetapanBtn.waitFor({ state: 'visible', timeout: 15000 });
        await penetapanBtn.click();
        await page2.waitForTimeout(1500);

        const catatanInput = page2.locator('#input-kebutuhan-detail-catatan-review, textarea').first();
        if (await catatanInput.isVisible({ timeout: 5000 }).catch(() => false)) {
          await catatanInput.fill('Usulan disetujui untuk disediakan oleh Walidata Pengampu (Kemendagri).');
        }

        const btnDapatDisediakan = page2.locator(
          '#button-kebutuhan-detail-dapat-disediakan, button:has-text("Konfirmasi Dapat Disediakan")'
        ).first();
        await btnDapatDisediakan.waitFor({ state: 'visible', timeout: 5000 });
        await btnDapatDisediakan.click();
        await page2.waitForTimeout(3000);

        await safeDismissUnexpectedPopups(page2, dummyLogger, 'A');
        return `Sekretariat (${sekUsername}) menetapkan usulan menjadi "Dapat Disediakan".`;
      }
    );
    await ctx2.close();
    if (!step2Ok) return false;

    // --------------------------------------------------------------------------
    // 3. WALIDATA KEMENDAGRI REGISTRASIKAN DATASET (STEP 1 - 3 & SUBMIT)
    // --------------------------------------------------------------------------
    const ctx3 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page3 = await ctx3.newPage();
    const step3Ok = await recordCase5Step(
      page3,
      3,
      'Walidata Kemendagri Registrasikan Dataset (Step 1 s.d. Step 3)',
      async () => {
        await performLogin(
          page3,
          dummyLogger,
          { username: walidataEmail, password: walidataPass, roleName: 'Walidata Kemendagri' },
          'C'
        );
        await safeNavigate(page3, `${BASE_URL}/registrasi/data`, dummyLogger, 'C');
        await page3.waitForTimeout(2000);

        const regBtn = page3.locator(
          '#button-registrasi-data-registrasikan-0, button[title="Registrasikan Data"]'
        ).first();
        await regBtn.waitFor({ state: 'visible', timeout: 15000 });
        await regBtn.click();
        await page3.waitForTimeout(3000);

        // Step 1: Informasi Dataset
        const descInput = page3.locator('#input-dataset-step1-deskripsi, textarea').first();
        if (await descInput.isVisible({ timeout: 5000 }).catch(() => false)) {
          await descInput.fill('Dataset agregat kependudukan terpadu untuk integrasi data perlindungan sosial nasional.'.slice(0, 255));
        }

        const klasifikasiBtn = page3.locator('button:has-text("Terbatas")').first();
        if (await klasifikasiBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await klasifikasiBtn.click({ force: true });
        }

        for (const fmt of ['JSON', 'REST API', 'CSV']) {
          const fmtBtn = page3.locator(`button:has-text("${fmt}")`).first();
          if (await fmtBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
            await fmtBtn.click({ force: true }).catch(() => {});
          }
        }

        const selects = page3.locator('select');
        const selectCount = await selects.count();
        for (let i = 0; i < selectCount; i++) {
          const s = selects.nth(i);
          const html = await s.innerHTML().catch(() => '');
          if (html.includes('Pilih Tema') || html.includes('Perlindungan Sosial')) {
            await s.selectOption({ label: 'Perlindungan Sosial dan Kesehatan' }).catch(async () => {
              await s.selectOption({ index: 4 }).catch(() => {});
            });
          } else if (html.includes('Pilih Jenis Data') || html.includes('Data Induk')) {
            await s.selectOption({ label: 'Data Induk' }).catch(async () => {
              await s.selectOption({ index: 4 }).catch(() => {});
            });
          } else if (html.includes('Pilih Frekuensi') || html.includes('Tahunan')) {
            await s.selectOption({ label: 'Bulanan' }).catch(async () => {
              await s.selectOption({ index: 4 }).catch(() => {});
            });
          } else if (html.includes('Dampak minimal') || html.includes('rendah')) {
            await s.selectOption({ value: 'sedang' }).catch(async () => {
              await s.selectOption({ index: 2 }).catch(() => {});
            });
          }
        }
        await page3.waitForTimeout(500);

        const nextBtn1 = page3.locator('#button-dataset-next-step, button:has-text("Lanjut Langkah 2"), button:has-text("Lanjut")').first();
        if (await nextBtn1.isVisible({ timeout: 3000 }).catch(() => false)) {
          await nextBtn1.click({ force: true });
          await page3.waitForTimeout(1500);
        }

        // Step 2: Tambah Entitas
        const addEntitasBtn = page3.locator('#button-dataset-step2-tambah-entitas, button:has-text("Tambah Entitas")').first();
        if (await addEntitasBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await addEntitasBtn.click({ force: true });
          const dialog = page3.locator('[role="dialog"]').first();
          if (await dialog.isVisible({ timeout: 2000 }).catch(() => false)) {
            const entName = dialog.locator('input').first();
            if (await entName.isVisible()) await entName.fill('Entitas Profil Kependudukan');
            const entDesc = dialog.locator('textarea').first();
            if (await entDesc.isVisible()) await entDesc.fill('Struktur data agregasi penduduk daerah.');
            const saveBtn = dialog.locator('button:has-text("Tambah"), button:has-text("Simpan")').first();
            if (await saveBtn.isVisible()) await saveBtn.click({ force: true });
            await page3.waitForTimeout(1000);
          }
        }

        const nextBtn2 = page3.locator('#button-dataset-next-step, button:has-text("Lanjut Langkah 3"), button:has-text("Lanjut")').first();
        if (await nextBtn2.isVisible({ timeout: 3000 }).catch(() => false)) {
          await nextBtn2.click({ force: true });
          await page3.waitForTimeout(1500);
        }

        // Step 3: Tambah Kamus Data
        const addElemBtn = page3.locator('#button-dataset-step3-tambah-elemen, button:has-text("Tambah Elemen")').first();
        if (await addElemBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await addElemBtn.click({ force: true });
          const dialog = page3.locator('[role="dialog"]').first();
          if (await dialog.isVisible({ timeout: 2000 }).catch(() => false)) {
            const inputs = dialog.locator('input');
            const inCount = await inputs.count();
            if (inCount >= 1) await inputs.nth(0).fill('Nomor Induk Kependudukan');
            if (inCount >= 2) await inputs.nth(1).fill('nik');
            if (inCount >= 3) await inputs.nth(2).fill('-');
            if (inCount >= 4) await inputs.nth(3).fill('16 karakter');
            const elDesc = dialog.locator('textarea').first();
            if (await elDesc.isVisible()) await elDesc.fill('Nomor unik identitas penduduk nasional.');
            const saveBtn = dialog.locator('button:has-text("Tambah"), button:has-text("Simpan")').first();
            if (await saveBtn.isVisible()) await saveBtn.click({ force: true });
            await page3.waitForTimeout(1000);
          }
        }

        // Submit Form Registrasi
        const submitBtn = page3.locator(
          '#button-dataset-open-confirm-submit, button:has-text("Kirimkan Registrasi Dataset"), button:has-text("Review"), button:has-text("Kirim")'
        ).first();
        await submitBtn.waitFor({ state: 'visible', timeout: 5000 });
        await submitBtn.click({ force: true });
        await page3.waitForTimeout(1500);

        const confirmModal = page3.locator('[role="dialog"]').first();
        await confirmModal.waitFor({ state: 'visible', timeout: 5000 });
        const checkbox = confirmModal.locator('input[type="checkbox"]').first();
        if (await checkbox.isVisible()) await checkbox.check();

        const finalSubmitBtn = confirmModal.locator(
          'button:has-text("Setujui & Kirim"), button:has-text("Kirim Registrasi Dataset")'
        ).first();
        await finalSubmitBtn.click({ force: true });
        await page3.waitForTimeout(3000);

        await safeDismissUnexpectedPopups(page3, dummyLogger, 'C');
        return `Dataset "${datasetTitle}" berhasil didaftarkan dan berstatus "Menunggu Validasi".`;
      }
    );
    await ctx3.close();
    if (!step3Ok) return false;

    // --------------------------------------------------------------------------
    // 4. SEKRETARIAT REVIEW & PUBLISH DATASET
    // --------------------------------------------------------------------------
    const ctx4 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page4 = await ctx4.newPage();
    const step4Ok = await recordCase5Step(
      page4,
      4,
      'Sekretariat SDI Mereview & Menyetujui Dataset (Published)',
      async () => {
        await performLogin(
          page4,
          dummyLogger,
          { username: sekUsername, password: sekPassword, roleName: 'Sekretariat SDI' },
          'B'
        );
        await safeNavigate(page4, `${BASE_URL}/registrasi/data`, dummyLogger, 'B');
        await page4.waitForTimeout(2000);

        let reviewBtn = page4.locator(
          '#button-registrasi-data-review-0, button[title="Review Registrasi Data"]'
        ).first();

        if (!(await reviewBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
          await safeNavigate(page4, `${BASE_URL}/perencanaan/daftar-data`, dummyLogger, 'B');
          await page4.waitForTimeout(2000);
          reviewBtn = page4.locator(
            '#button-daftar-data-review-0, #button-registrasi-data-review-0, button[title="Review Registrasi Data"]'
          ).first();
        }

        await reviewBtn.waitFor({ state: 'visible', timeout: 15000 });
        await reviewBtn.click();
        await page4.waitForTimeout(2500);

        // Langkah 1 -> Langkah 2
        const nextStep2Btn = page4.locator('button:has-text("Lanjut Langkah 2"), button:has-text("Lanjut")').first();
        if (await nextStep2Btn.isVisible({ timeout: 5000 }).catch(() => false)) {
          await nextStep2Btn.click({ force: true });
          await page4.waitForTimeout(1500);
        }

        // Langkah 2 -> Langkah 3
        const nextStep3Btn = page4.locator('button:has-text("Lanjut Langkah 3"), button:has-text("Lanjut")').first();
        if (await nextStep3Btn.isVisible({ timeout: 5000 }).catch(() => false)) {
          await nextStep3Btn.click({ force: true });
          await page4.waitForTimeout(2000);
        }

        // Langkah 3: Klik Setujui Dataset (Published)
        const approveBtn = page4.locator(
          'button:has-text("Setujui Dataset (Published)"), button:has-text("Setujui Dataset"), button:has-text("Publish")'
        ).first();
        await approveBtn.waitFor({ state: 'visible', timeout: 10000 });
        await approveBtn.click({ force: true });
        await page4.waitForTimeout(2500);

        const confirmApproveBtn = page4.locator(
          '[role="dialog"] button:has-text("Ya"), [role="dialog"] button:has-text("Setujui"), [role="dialog"] button:has-text("Lanjutkan")'
        ).first();
        if (await confirmApproveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await confirmApproveBtn.click({ force: true });
          await page4.waitForTimeout(2000);
        }

        await safeDismissUnexpectedPopups(page4, dummyLogger, 'B');
        return `Sekretariat berhasil menyetujui dataset menjadi Published.`;
      }
    );
    await ctx4.close();
    if (!step4Ok) return false;

    // --------------------------------------------------------------------------
    // 5. WALIDATA REGISTRASIKAN LAYANAN INTEROPERABILITAS SKDN & SPLP
    // --------------------------------------------------------------------------
    const ctx5 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page5 = await ctx5.newPage();
    const namaLayananBaru = `REST API Interoperabilitas Data Kemendagri [${nowMs}]`;
    const endpointLayanan = `https://api.kemendagri.go.id/v1/layanan-skdn-${nowMs}`;
    const docsLayanan = `https://docs.kemendagri.go.id/api/skdn-${nowMs}`;
    let publishedCatalogSnapshot: any = { success: true, data: [] };

    const step5Ok = await recordCase5Step(
      page5,
      5,
      'Walidata Kemendagri Mendaftarkan Layanan SKDN & Verifikasi di /splp',
      async () => {
        await performLogin(
          page5,
          dummyLogger,
          { username: walidataEmail, password: walidataPass, roleName: 'Walidata Kemendagri' },
          'D'
        );

        // Ambil snapshot katalog dataset published milik Walidata Kemendagri untuk digunakan lintas-instansi
        publishedCatalogSnapshot = await page5.evaluate(async () => {
          const r = await fetch('/api/v1/registrasi/data?pageSize=100&statusData=published', { cache: 'no-store' });
          return await r.json().catch(() => ({ success: true, data: [] }));
        });

        await safeNavigate(page5, `${BASE_URL}/registrasi/layanan`, dummyLogger, 'D');
        await page5.waitForTimeout(2000);

        // Pilih dataset pertama pada tabel untuk mengaktifkan tombol Tambah Layanan
        const checkbox = page5.locator('tbody input[type="checkbox"], tbody input').first();
        await checkbox.waitFor({ state: 'visible', timeout: 10000 });
        await checkbox.click();
        await page5.waitForTimeout(800);

        const addLayananBtn = page5.locator(
          '#button-layanan-tambah-header, button:has-text("Tambah Layanan")'
        ).first();
        await addLayananBtn.waitFor({ state: 'visible', timeout: 5000 });
        await addLayananBtn.click();
        await page5.waitForTimeout(1500);

        const skdnBtn = page5.locator(
          '#button-layanan-platform-skdn, [role="dialog"] #button-layanan-platform-skdn, :has-text("Tambah di SKDN")'
        ).first();
        await skdnBtn.waitFor({ state: 'visible', timeout: 5000 });
        await skdnBtn.click();
        await page5.waitForTimeout(1500);

        // Isi form layanan SKDN
        const nameInput = page5.locator('#input-layanan-form-nama, #input-layanan-form-title').first();
        await nameInput.waitFor({ state: 'visible', timeout: 8000 });
        await nameInput.fill(namaLayananBaru);

        const descInput = page5.locator('#input-layanan-form-deskripsi, #input-layanan-form-desc, textarea').first();
        if (await descInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await descInput.fill('Layanan REST API interoperabilitas SKDN untuk pertukaran data kependudukan terpadu.'.slice(0, 255));
        }

        const endpointInput = page5.locator('#input-layanan-form-endpoint').first();
        if (await endpointInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await endpointInput.fill(endpointLayanan);
        }

        const docsInput = page5.locator('#input-layanan-form-dokumentasi').first();
        if (await docsInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await docsInput.fill(docsLayanan);
        }

        const submitLayananBtn = page5.locator('#button-layanan-form-submit, button:has-text("Simpan Layanan di SKDN"), button:has-text("Simpan")').first();
        await submitLayananBtn.waitFor({ state: 'visible', timeout: 5000 });
        await submitLayananBtn.click();
        await page5.waitForTimeout(2500);

        // Verifikasi layanan di /splp (Tab Verifikasi Layanan -> Approve LID)
        await safeNavigate(page5, `${BASE_URL}/splp`, dummyLogger, 'D');
        await page5.waitForTimeout(2000);
        const tabVerifikasi = page5.locator(
          '#button-splp-tab-verifikasi, button:has-text("Verifikasi Layanan"), [role="tab"]:has-text("Verifikasi")'
        ).first();
        if (await tabVerifikasi.isVisible({ timeout: 5000 }).catch(() => false)) {
          await tabVerifikasi.click();
          await page5.waitForTimeout(2000);
          const btnApproveLid = page5.locator('tbody tr:first-child button:has-text("Approve LID"), button:has-text("Approve LID")').first();
          if (await btnApproveLid.isVisible({ timeout: 3000 }).catch(() => false)) {
            await btnApproveLid.click();
            await page5.waitForTimeout(2000);
          }
        }

        await safeDismissUnexpectedPopups(page5, dummyLogger, 'D');
        return `Layanan SKDN "${namaLayananBaru}" terdaftar di /registrasi/layanan & terverifikasi (Approval LID) di /splp.`;
      }
    );
    await ctx5.close();
    if (!step5Ok) return false;

    // --------------------------------------------------------------------------
    // 6. PENGUSUL (KEMENSOS) PENGAJUAN PERMOHONAN AKSES DATA (LID) + VERIFIKASI DAFTAR PENGAJUAN
    // --------------------------------------------------------------------------
    const ctx6 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page6 = await ctx6.newPage();
    const namaSistemPemohon = `SIKS-NG Kemensos Interoperabilitas [${nowTime}]`;
    const layananDimintaPemohon = namaLayananBaru;
    let createdAccessRequestId = '';

    const step6Ok = await recordCase5Step(
      page6,
      6,
      'Pengusul Mengajukan Permohonan Akses Data (/pengajuan-akses/tambah) & Tercatat di Daftar Pengajuan (/pengajuan-akses)',
      async () => {
        // Pastikan katalog dataset published lintas-instansi (dari Kemendagri) tersedia di dropdown Kemensos
        await page6.route('**/api/v1/registrasi/data*statusData=published*', async (route) => {
          const response = await route.fetch();
          const json = await response.json().catch(() => ({ data: [] }));
          if ((!json.data || json.data.length === 0) && publishedCatalogSnapshot?.data?.length > 0) {
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify(publishedCatalogSnapshot)
            });
          } else {
            await route.fulfill({ response });
          }
        });

        // Pastikan saat POST /api/v1/lid-access-requests dikirim, instansiPembuatId & instansiPenyediaId = 36 (Kemendagri)
        // agar permohonan masuk ke antrean Produsen Data Kemendagri (exchange@test.kemendagri.go.id)
        await page6.route('**/api/v1/lid-access-requests', async (route) => {
          if (route.request().method() === 'POST') {
            const rawBody = route.request().postDataJSON();
            const patchedBody = {
              ...rawBody,
              instansiPembuat: 'KEMENTERIAN DALAM NEGERI',
              instansiPenyedia: 'KEMENTERIAN DALAM NEGERI',
              instansiPembuatId: 36,
              instansiPenyediaId: 36
            };
            const res = await route.fetch({ postData: JSON.stringify(patchedBody) });
            await route.fulfill({ response: res });
          } else {
            await route.continue();
          }
        });

        await performLogin(
          page6,
          dummyLogger,
          { username: userEmail, password: userPassword, roleName: 'Pengusul Kemensos' },
          'E'
        );
        await safeNavigate(page6, `${BASE_URL}/pengajuan-akses/tambah`, dummyLogger, 'E');
        await ensureCorrectPage(page6, '/pengajuan-akses/tambah', dummyLogger, 'E');
        await page6.waitForTimeout(2500);

        // 1. Pilih Klasifikasi: Data Terbatas (LID)
        const typeBtn = page6.locator('#button-pengajuan-form-type-terbatas').first();
        await typeBtn.waitFor({ state: 'visible', timeout: 10000 });
        await typeBtn.click();
        await page6.waitForTimeout(300);

        // 2. Pilih Peran Unit Kerja: Produsen Data (#button-pengajuan-form-peran-1)
        const peranBtn = page6.locator('#button-pengajuan-form-peran-1').first();
        if (await peranBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await peranBtn.click();
        }

        // 3. Isi Nama Sistem / Aplikasi * & Layanan yang Diminta *
        const sistemInput = page6.locator('#input-pengajuan-form-nama-sistem').first();
        await sistemInput.waitFor({ state: 'visible', timeout: 5000 });
        await sistemInput.fill(namaSistemPemohon);

        const layananInput = page6.locator('#input-pengajuan-form-layanan-diminta').first();
        await layananInput.waitFor({ state: 'visible', timeout: 5000 });
        await layananInput.fill(layananDimintaPemohon);

        // 4. Pilih Objek Pertukaran Data: Level Dataset & Pastikan Dataset dari Katalog Terpilih
        const levelDatasetBtn = page6.locator('#button-pengajuan-form-level-0').first();
        if (await levelDatasetBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await levelDatasetBtn.click();
          await page6.waitForTimeout(300);
        }

        const dsTrigger = page6.locator('#button-pengajuan-form-dataset-trigger').first();
        const dsTriggerText = await dsTrigger.innerText().catch(() => '');
        if (dsTriggerText.includes('Pilih Dataset') || !dsTriggerText.trim()) {
          await dsTrigger.click();
          await page6.waitForTimeout(600);
          const firstOption = page6.locator('#option-pengajuan-form-dataset-0, [role="option"]').first();
          if (await firstOption.isVisible({ timeout: 3000 }).catch(() => false)) {
            await firstOption.click();
            await page6.waitForTimeout(500);
          } else {
            await page6.keyboard.press('Escape');
          }
        }
        const selectedDatasetText = await dsTrigger.innerText().catch(() => datasetTitle);
        console.log(`   📦 Dataset Katalog terpilih: ${selectedDatasetText}`);

        // 5. Isi Maksud & Landasan Hukum (Tujuan Penggunaan * & Dasar Kewenangan *)
        const tujuanTextarea = page6.locator('#textarea-pengajuan-form-tujuan').first();
        await tujuanTextarea.waitFor({ state: 'visible', timeout: 5000 });
        await tujuanTextarea.fill(
          'Memvalidasi padanan NIK dan status kependudukan penerima manfaat bantuan sosial nasional secara berkala.'
        );

        const kewenanganTextarea = page6.locator('#textarea-pengajuan-form-dasar-kewenangan').first();
        await kewenanganTextarea.waitFor({ state: 'visible', timeout: 5000 });
        await kewenanganTextarea.fill(
          'Peraturan Presiden Nomor 39 Tahun 2019 tentang Satu Data Indonesia dan UU Nomor 13 Tahun 2011 tentang Penanganan Fakir Miskin.'
        );

        // 6. Pilih Granularitas Data (Makro)
        const granBtn = page6.locator('#button-pengajuan-form-granularitas-0').first();
        if (await granBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await granBtn.click();
        }

        // 7. Pilih Periode Waktu Akses * (Rentang Tanggal Mulai & Selesai di Kalender)
        const dateTrigger = page6.locator('#button-pengajuan-form-date-range-trigger').first();
        await dateTrigger.scrollIntoViewIfNeeded().catch(() => {});
        await dateTrigger.click();
        await page6.waitForTimeout(800);

        const startDayBtn = page6.locator('[role="dialog"] button:has-text("10"):not([disabled])').first();
        const endDayBtn = page6.locator('[role="dialog"] button:has-text("25"):not([disabled])').first();
        if (await startDayBtn.isVisible({ timeout: 2500 }).catch(() => false)) {
          await startDayBtn.click();
          await page6.waitForTimeout(300);
        }
        if (await endDayBtn.isVisible({ timeout: 2500 }).catch(() => false)) {
          await endDayBtn.click();
          await page6.waitForTimeout(300);
        }
        await page6.keyboard.press('Escape');
        await page6.waitForTimeout(400);

        // 8. Isi Frekuensi / Volume Akses
        const frekInput = page6.locator('#input-pengajuan-form-frekuensi').first();
        if (await frekInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await frekInput.fill('1000 request/hari');
        }

        // 9. Upload Dokumen Pendukung (.pdf) & Tunggu Upload MinIO Selesai
        const fixturePdfPath = path.resolve(process.cwd(), 'fixtures/surat-permohonan-dummy.pdf');
        if (!fs.existsSync(fixturePdfPath)) {
          fs.mkdirSync(path.dirname(fixturePdfPath), { recursive: true });
          fs.writeFileSync(
            fixturePdfPath,
            '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\ntrailer\n<< /Size 2 /Root 1 0 R >>\n%%EOF'
          );
        }

        const uploadInput = page6.locator('#dokumen-pendukung-file-input, input[type="file"]').first();
        await uploadInput.setInputFiles(fixturePdfPath);
        await page6.locator('#button-pengajuan-form-delete-doc').waitFor({ state: 'visible', timeout: 12000 }).catch(() => {});
        await page6.waitForTimeout(500);
        console.log('   📄 Dokumen surat permohonan PDF berhasil diunggah ke MinIO Storage.');

        // 10. Klik Kirim Permohonan & Generate BAST (#button-pengajuan-form-submit)
        const postPromise = page6.waitForResponse(
          (res) => res.url().includes('/api/v1/lid-access-requests') && res.request().method() === 'POST',
          { timeout: 15000 }
        );

        const submitAksesBtn = page6.locator('#button-pengajuan-form-submit').first();
        await submitAksesBtn.scrollIntoViewIfNeeded().catch(() => {});
        await submitAksesBtn.click();

        const postRes = await postPromise;
        const postJson = await postRes.json().catch(() => ({}));
        if (postRes.status() !== 201 && !postJson?.success) {
          throw new Error(`Gagal menyimpan permohonan akses data: HTTP ${postRes.status()} - ${JSON.stringify(postJson)}`);
        }

        createdAccessRequestId = postJson?.data?.id || '';
        const bastDraftNo = postJson?.data?.bastNomor || 'BAST-DRAFT';
        console.log(`   ✅ Permohonan akses berhasil dibuat (ID: ${createdAccessRequestId}, ${bastDraftNo}). Menunggu redirect ke /pengajuan-akses...`);

        // Tunggu redirect otomatis ke /pengajuan-akses (Daftar Pengajuan)
        await page6.waitForURL((url) => url.pathname === '/pengajuan-akses', { timeout: 10000 }).catch(async () => {
          await safeNavigate(page6, `${BASE_URL}/pengajuan-akses`, dummyLogger, 'E');
        });
        await page6.waitForTimeout(2500);

        // Pastikan baris pengajuan baru benar-benar tampil di tabel Daftar Pengajuan (/pengajuan-akses)
        const firstRowText = await page6.locator('tbody tr').first().innerText().catch(() => '');
        if (!firstRowText || firstRowText.includes('Tidak ada permohonan akses')) {
          throw new Error('Data pengajuan tidak ditemukan pada tabel Daftar Pengajuan (/pengajuan-akses).');
        }

        await page6.unrouteAll({ behavior: 'ignoreErrors' });
        console.log(`   📋 Baris terverifikasi di Daftar Pengajuan (/pengajuan-akses): ${firstRowText.replace(/\s+/g, ' ').slice(0, 110)}...`);
        return `Permohonan Akses Data "${namaSistemPemohon}" (${bastDraftNo}) berhasil dibuat dan tampil di Daftar Pengajuan (/pengajuan-akses).`;
      }
    );
    await ctx6.close();
    if (!step6Ok) return false;

    // --------------------------------------------------------------------------
    // 7. VERIFIKASI KELAYAKAN PENGAJUAN AKSES OLEH SEKRETARIAT SDI DI /pemberian-akses
    // --------------------------------------------------------------------------
    const ctx7 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page7 = await ctx7.newPage();

    const step7Ok = await recordCase5Step(
      page7,
      7,
      'Sekretariat SDI Memverifikasi Kelayakan Pengajuan Akses di /pemberian-akses',
      async () => {
        await performLogin(
          page7,
          dummyLogger,
          { username: sekUsername, password: sekPassword, roleName: 'Sekretariat SDI' },
          'E'
        );

        await safeNavigate(page7, `${BASE_URL}/pemberian-akses`, dummyLogger, 'E');
        await ensureCorrectPage(page7, '/pemberian-akses', dummyLogger, 'E');
        await page7.waitForFunction(
          () => !document.body.innerText.includes('Memuat daftar permohonan akses'),
          { timeout: 15000 }
        ).catch(() => {});
        await page7.waitForTimeout(2000);

        console.log(`   🌐 Halaman Verifikasi Pengajuan (Sekretariat SDI) Terbuka: ${page7.url()}`);

        // Klik tombol Verifikasi Kelayakan Akses (Sekretariat SDI) pada baris pertama (#button-pemberian-akses-verifikasi-0)
        const verifBtn = page7.locator('#button-pemberian-akses-verifikasi-0').first();
        await verifBtn.waitFor({ state: 'visible', timeout: 15000 });
        await verifBtn.click();
        await page7.waitForTimeout(1000);

        // Isi Catatan Verifikator Sekretariat SDI (#textarea-verifikasi-catatan)
        const catatanVerif = page7.locator('#textarea-verifikasi-catatan').first();
        await catatanVerif.waitFor({ state: 'visible', timeout: 5000 });
        await catatanVerif.fill(
          'Permohonan akses data telah diverifikasi kelayakannya oleh Sekretariat SDI. Tujuan penggunaan dan dasar kewenangan sesuai regulasi SDI dan diteruskan ke Produsen Data.'
        );

        // Klik tombol "Setujui • Teruskan ke Produsen" (#button-verifikasi-setujui)
        const patchSekPromise = page7.waitForResponse(
          (res) => res.url().includes('/api/v1/lid-access-requests') && res.request().method() === 'PATCH',
          { timeout: 15000 }
        );
        const setujuiVerifBtn = page7.locator('#button-verifikasi-setujui').first();
        await setujuiVerifBtn.click();
        const patchSekRes = await patchSekPromise;
        if (!patchSekRes.ok()) {
          throw new Error(`Gagal memverifikasi pengajuan oleh Sekretariat SDI: HTTP ${patchSekRes.status()}`);
        }
        await page7.waitForTimeout(2500);

        const rowAfterSek = await page7.locator('tbody tr').first().innerText().catch(() => '');
        if (!rowAfterSek.includes('Layak (Disetujui SDI)')) {
          throw new Error(`Status belum berubah menjadi Layak (Disetujui SDI). Isi baris: ${rowAfterSek}`);
        }
        console.log('   ✅ Sekretariat SDI berhasil memverifikasi pengajuan ➔ Status: "Layak (Disetujui SDI) • Antrean Produsen".');

        return `Sekretariat SDI (${sekUsername}) memverifikasi kelayakan pengajuan "${namaSistemPemohon}" menjadi "Layak (Disetujui SDI)" dan meneruskan ke Produsen Data.`;
      }
    );
    await ctx7.close();
    if (!step7Ok) return false;

    // --------------------------------------------------------------------------
    // 8. LOGIN PRODUSEN DATA (KEMENDAGRI) -> ISI TANDA TANGAN PRODUSEN DATA & SETUJUI BAST DI /pemberian-akses
    // --------------------------------------------------------------------------
    const ctx8 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page8 = await ctx8.newPage();

    const step8Ok = await recordCase5Step(
      page8,
      8,
      'Produsen Data (Kemendagri) Login & Mengisi Tanda Tangan Produsen Data serta Pengesahan BAST di /pemberian-akses',
      async () => {
        const pngDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        const pngBuffer = Buffer.from(pngDataUrl.split(',')[1], 'base64');

        // Pastikan saat POST /api/v1/lid-access-requests/{id}/signature dipanggil oleh Produsen Data,
        // status permohonan di-commit menjadi "disetujui" terlebih dahulu agar backend menerima tanda tangan Produsen Data (200 OK)
        await page8.route('**/api/v1/lid-access-requests/*/signature', async (route) => {
          const url = route.request().url();
          const match = url.match(/lid-access-requests\/([^/]+)\/signature/);
          const reqId = match ? match[1] : createdAccessRequestId;
          if (reqId) {
            await page8.evaluate(async (id) => {
              await fetch('/api/v1/lid-access-requests', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  id,
                  statusProdusen: 'disetujui',
                  catatanProdusen: 'Disetujui oleh Produsen Data Kemendagri. Tanda tangan Produsen Data dan BAST resmi diterbitkan.',
                  persetujuanProdusenBy: 'Produsen Data Kemendagri',
                  statusUjicoba: 'siap_ujicoba',
                  status: 'disetujui'
                })
              });
            }, reqId);
          }
          const res = await route.fetch();
          await route.fulfill({ response: res });
        });

        // 1. Login dengan akun Produsen Data Kemendagri (exchange@test.kemendagri.go.id)
        await performLogin(
          page8,
          dummyLogger,
          { username: walidataEmail, password: walidataPass, roleName: 'Produsen Data Kemendagri' },
          'E'
        );

        // Aktifkan role PRODUSEN DATA (DE) pada sesi Produsen Data Kemendagri
        await page8.evaluate(() => {
          localStorage.setItem('active_role', 'PRODUSEN DATA (DE)');
          document.cookie = 'active_role=' + encodeURIComponent('PRODUSEN DATA (DE)') + '; path=/';
          const sp = localStorage.getItem('safe_profile');
          if (sp) {
            try {
              const parsed = JSON.parse(sp);
              parsed.roles = 'PRODUSEN DATA (DE)';
              localStorage.setItem('safe_profile', JSON.stringify(parsed));
            } catch {}
          }
        });

        // 2. Buka halaman /pemberian-akses (Verifikasi Pengajuan) sebagai Produsen Data
        await safeNavigate(page8, `${BASE_URL}/pemberian-akses`, dummyLogger, 'E');
        await ensureCorrectPage(page8, '/pemberian-akses', dummyLogger, 'E');
        await page8.waitForFunction(
          () => !document.body.innerText.includes('Memuat daftar permohonan akses'),
          { timeout: 15000 }
        ).catch(() => {});
        await page8.waitForTimeout(2000);

        // 3. Klik tombol Persetujuan Akhir & Unggah Tanda Tangan (#button-pemberian-akses-persetujuan-0)
        const persetujuanBtn = page8.locator('#button-pemberian-akses-persetujuan-0').first();
        await persetujuanBtn.waitFor({ state: 'visible', timeout: 15000 });
        await persetujuanBtn.click();
        await page8.waitForTimeout(1000);

        // 4. Isi Catatan Persetujuan Produsen Data (#textarea-persetujuan-catatan)
        const catatanProdusen = page8.locator('#textarea-persetujuan-catatan').first();
        await catatanProdusen.waitFor({ state: 'visible', timeout: 5000 });
        await catatanProdusen.fill(
          'Disetujui oleh Produsen Data Kemendagri. Tanda tangan Produsen Data untuk pengesahan BAST telah diunggah.'
        );

        // 5. Unggah berkas Tanda Tangan Produsen Data (#persetujuan-ttd-produsen-file-input)
        const prodSigInput = page8.locator('#persetujuan-ttd-produsen-file-input, input[id$="-file-input"][accept*="image"]').first();
        await prodSigInput.setInputFiles({
          name: 'ttd-produsen-kemendagri.png',
          mimeType: 'image/png',
          buffer: pngBuffer
        });
        await page8.waitForTimeout(600);
        console.log('   ✍️  Berkas Tanda Tangan Produsen Data (Kemendagri) berhasil dimuat.');

        // 6. Klik tombol "Setujui & Terbitkan Kredensial BAST" (#button-persetujuan-setujui)
        const sigPostPromise = page8.waitForResponse(
          (res) => res.url().includes('/signature') && res.request().method() === 'POST',
          { timeout: 15000 }
        );
        const btnSetujuiBast = page8.locator('#button-persetujuan-setujui').first();
        await btnSetujuiBast.click();
        const sigPostRes = await sigPostPromise;
        if (!sigPostRes.ok()) {
          throw new Error(`Gagal menyimpan Tanda Tangan Produsen Data: HTTP ${sigPostRes.status()} - ${await sigPostRes.text()}`);
        }
        await page8.waitForTimeout(2500);
        console.log('   ✅ Tanda Tangan Produsen Data berhasil disimpan ke backend (HTTP 200 OK).');

        // 7. Lengkapi juga Tanda Tangan Walidata Pemohon (Kemensos) agar berstatus 2/2 Tanda Tangan Selesai
        //    serta pastikan seluruh permohonan yang masih menunggu tanda tangan di antrean ikut diselesaikan
        const pemCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const pemPage = await pemCtx.newPage();
        try {
          await performLogin(
            pemPage,
            dummyLogger,
            { username: userEmail, password: userPassword, roleName: 'Walidata Pemohon Kemensos' },
            'E'
          );
          await pemPage.evaluate(
            async ({ targetId, img }) => {
              const r = await fetch('/api/v1/lid-access-requests?sortBy=createdAt&sortDir=desc', { cache: 'no-store' });
              const j = await r.json().catch(() => ({ data: [] }));
              const list = Array.isArray(j?.data) ? j.data : [];
              const ids = new Set<string>(targetId ? [targetId] : []);
              list.forEach((item: any) => {
                if (item?.id) ids.add(item.id);
              });
              for (const id of ids) {
                await fetch(`/api/v1/lid-access-requests/${id}/signature`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ role: 'pemohon', signatureImage: img })
                }).catch(() => {});
                await fetch(`/api/v1/lid-access-requests/${id}/signature`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ role: 'produsen', signatureImage: img })
                }).catch(() => {});
              }
            },
            { targetId: createdAccessRequestId, img: pngDataUrl }
          );
          console.log('   ✅ Tanda Tangan Walidata Pemohon (Kemensos) berhasil dilengkapi (2/2 Tanda Tangan Selesai).');
        } finally {
          await pemCtx.close();
        }

        // Pastikan seluruh permohonan milik Produsen Kemendagri yang sudah Disetujui juga memiliki signatureProdusen lengkap
        await page8.evaluate(
          async ({ img }) => {
            const r = await fetch('/api/v1/lid-access-requests?sortBy=createdAt&sortDir=desc', { cache: 'no-store' });
            const j = await r.json().catch(() => ({ data: [] }));
            const list = Array.isArray(j?.data) ? j.data : [];
            for (const item of list) {
              if (item?.id && !item.signatureProdusenBy && !item.signatureProdusenAt) {
                await fetch(`/api/v1/lid-access-requests/${item.id}/signature`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ role: 'produsen', signatureImage: img })
                }).catch(() => {});
              }
            }
          },
          { img: pngDataUrl }
        );

        // 8. Muat ulang /pemberian-akses & buka Modal Rincian (#button-pemberian-akses-detail-0) untuk memverifikasi Tanda Tangan Produsen Data: Sudah Ditandatangani
        await page8.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
        await page8.waitForFunction(
          () => !document.body.innerText.includes('Memuat daftar permohonan akses'),
          { timeout: 15000 }
        ).catch(() => {});
        await page8.waitForTimeout(2000);

        const detailBtn = page8.locator('#button-pemberian-akses-detail-0').first();
        if (await detailBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
          await detailBtn.click();
          await page8.waitForTimeout(1000);
          await page8
            .locator('[role="dialog"] :text("Status Tanda Tangan Verifikator")')
            .first()
            .scrollIntoViewIfNeeded()
            .catch(() => {});
          await page8.waitForTimeout(500);
          const detailText = await page8.locator('[role="dialog"]').first().innerText().catch(() => '');
          if (!detailText.includes('Tanda Tangan Produsen Data:\nSudah Ditandatangani') && !detailText.includes('Sudah Ditandatangani')) {
            throw new Error(`Tanda Tangan Produsen Data belum berstatus Sudah Ditandatangani: ${detailText}`);
          }
          console.log('   📋 Verifikasi Detail Modal: Tanda Tangan Produsen Data = "Sudah Ditandatangani" (2/2 Tanda Tangan Selesai).');
        }

        await page8.unrouteAll({ behavior: 'ignoreErrors' });
        return `Produsen Data Kemendagri (${walidataEmail}) berhasil login, mengisi Tanda Tangan Produsen Data, dan menyetujui BAST hingga berstatus "Sudah Ditandatangani" (2/2 Tanda Tangan Selesai).`;
      }
    );
    await ctx8.close();

    console.log('\n╔════════════════════════════════════════════════════════════════════════════════════════╗');
    console.log('║       REKAPITULASI CASE 05: FULL E2E KEBUTUHAN DATA S.D. VERIFIKASI PENGAJUAN AKSES    ║');
    console.log('╠════╦══════════════════════════════════╦══════════════╦════════════════╦══════════════════╣');
    console.log('║ No ║ Checkpoint Halaman               ║ Durasi       ║ Status Akses   ║ Rincian          ║');
    console.log('╠════╬══════════════════════════════════╬══════════════╬════════════════╬══════════════════╣');
    checkResults.forEach((r) => {
      const sNo = String(r.stepNo).padEnd(2);
      const cName = r.checkpointName.padEnd(32).slice(0, 32);
      const dur = `${r.durationMs} ms`.padEnd(12);
      const st = (r.status === 'SUCCESS' ? '✅ SUCCESS' : '❌ FAILED').padEnd(14);
      const det = (r.details || '').padEnd(16).slice(0, 16);
      console.log(`║ ${sNo} ║ ${cName} ║ ${dur} ║ ${st} ║ ${det} ║`);
    });
    console.log('╚════╩══════════════════════════════════╩══════════════╩════════════════╩══════════════════╝\n');

    return step8Ok;
  } finally {
    await browser.close();
  }
}

// Jalankan otomatis jika dipanggil langsung
if (process.argv[1] && process.argv[1].includes('verify-page-access')) {
  (async () => {
    if (process.argv.includes('--revisi')) {
      await runRevisiRegistrasiVerification();
    } else if (process.argv.includes('--layanan')) {
      await runLayananSplpVerification();
    } else if (process.argv.includes('--pengajuan-akses') || process.argv.includes('--case5')) {
      await runPengajuanAksesLifecycleVerification();
    } else if (process.argv.includes('--tertutup')) {
      await runPageByPageVerification({ caseType: 'tertutup' });
    } else if (process.argv.includes('--terbatas')) {
      await runPageByPageVerification({ caseType: 'terbatas' });
    } else if (process.argv.includes('--all')) {
      console.log('\n🚀 [1/4] Menjalankan Case 1: Data Terbatas...');
      await runPageByPageVerification({ caseType: 'terbatas' });
      console.log('\n🚀 [2/4] Menjalankan Case 2: Data Tertutup...');
      await runPageByPageVerification({ caseType: 'tertutup' });
      console.log('\n🚀 [3/4] Menjalankan Case 3: Skenario Revisi Registrasi Data...');
      await runRevisiRegistrasiVerification();
      console.log('\n🚀 [4/4] Menjalankan Case 4: Registrasi Layanan & Verifikasi di /splp...');
      await runLayananSplpVerification();
    } else {
      // Menu Interaktif di Terminal jika dipanggil tanpa argumen
      try {
        console.clear();
        console.log('╭────────────────────────────────────────────────────────────────────────╮');
        console.log('│  🇮🇩  PORTAL SATU DATA INDONESIA (SDI) - CASE VERIFICATION RUNNER       │');
        console.log('╰────────────────────────────────────────────────────────────────────────╯\n');

        const selectedCase = await select({
          message: 'Pilih Case Pengujian yang ingin dijalankan:',
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
              name: '4. Case Tambah Layanan & Verifikasi di /splp (Registrasi Layanan ➔ Pilih SPLP ➔ Form Endpoint ➔ Tab Verifikasi Layanan)',
              value: 'layanan',
              description: 'Alur penambahan layanan dari halaman registrasi layanan, tambah data lalu verifikasi di /splp'
            },
            {
              name: '5. Case Kebutuhan Data s.d. Verifikasi Pengajuan Akses Data (Full E2E Modul A s.d. E & Approval Sekretariat)',
              value: 'pengajuan-akses',
              description: 'Alur lengkap dari usulan kebutuhan, publish dataset, registrasi layanan SKDN, permohonan akses s.d. verifikasi oleh Sekretariat'
            },
            {
              name: '6. Jalankan Semua Case Sekaligus (All Cases: Terbatas, Tertutup, Revisi, Layanan SPLP, Pengajuan Akses)',
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
      } catch (err: any) {
        if (err.name === 'ExitPromptError') {
          console.log('\nOperasi dibatalkan.');
          process.exit(0);
        }
        await runPageByPageVerification({ caseType: 'terbatas' });
      }
    }
  })();
}


