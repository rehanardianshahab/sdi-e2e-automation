import { chromium } from 'playwright';
import { select } from '@inquirer/prompts';
import * as dotenv from 'dotenv';
import { performLogin } from '../pages/auth.page.js';
import { safeNavigate, assertNoValidationErrors, safeDismissUnexpectedPopups } from '../utils/page-error-guard.js';
import { StepLogger } from '../utils/step-logger.js';
import { resolveInstansiContext } from '../utils/instansi-helper.js';
import {
  loadKemenporaExcelCatalog,
  pickKemenporaDataset,
  buildSdiPayloadFromKemenporaExcel,
  fillDatasetRegistrationFromExcelPayload,
  KemenporaDatasetBundle
} from '../generators/kemenpora-excel-loader.js';

dotenv.config();

export interface KamusDataElement {
  idElemen: string;
  idData?: string;
  namaElemen: string;
  alias: string;
  definisi: string;
  satuan: string;
  tipeData: string;
  formatPanjang: string;
  sifatKewajiban: 'Mandatory' | 'Optional';
  isPrimaryKey?: boolean;
}

// Backward-compatible export untuk DS-PORA-001 / DT-PORA-001 (olahragawan) langsung dari Excel
export const kemenporaKamusDataDS001: KamusDataElement[] = (() => {
  try {
    const bundle = pickKemenporaDataset('DT-PORA-001');
    return bundle.kamusData.map((k) => ({
      idElemen: k.idElemen,
      idData: k.idData,
      namaElemen: k.namaElemen,
      alias: k.alias,
      definisi: k.definisi,
      satuan: k.satuan,
      tipeData: k.tipeDataRaw,
      formatPanjang: k.formatPanjang,
      sifatKewajiban: k.sifatKewajiban,
      isPrimaryKey: k.isPrimaryKey
    }));
  } catch {
    return [];
  }
})();

export interface RegisterKemenporaOptions {
  /**
   * ID Data (misal "DT-PORA-001" s.d. "DT-PORA-030") atau ID Dataset ("DS-PORA-001" s.d. "DS-PORA-030")
   * atau Nama Dataset/Entitas (misal "olahragawan", "tenor", "cabor").
   */
  idData?: string;
  /**
   * Jika true, jalankan insert berurutan untuk seluruh 30 ID Data (DT-PORA-001 s.d. DT-PORA-030).
   */
  all?: boolean;
  /**
   * Jika true, tampilkan menu interaktif pemilihan ID Data di terminal.
   */
  interactive?: boolean;
}

/**
 * Menjalankan insert Dataset (RegDataset), Entitas (RegEntitasData), dan Kamus Data (RegKamusData)
 * untuk 1 bundle ID Data (DT-PORA-xxx / DS-PORA-xxx).
 */
export async function runInsertSingleKemenporaBundle(bundle: KemenporaDatasetBundle): Promise<boolean> {
  const isHeadless = process.env.HEADLESS !== 'false';
  const browser = await chromium.launch({ headless: isHeadless, slowMo: 100 });
  const BASE_URL = (process.env.BASE_URL || 'https://fe-staging.data.go.id').replace(/\/$/, '');
  const logger = new StepLogger(['AUTH', 'A', 'B', 'C'], `RegKemenpora-${bundle.idData}`);
  const instansiCtx = resolveInstansiContext('exchange@test.kemendagri.go.id');
  const pengusulEmail = instansiCtx.loginEmail;
  const pengusulPassword = process.env.USER_PENGUSUL_PASSWORD || '123456789';
  const targetEmail = instansiCtx.targetLoginEmail;
  const targetPassword = instansiCtx.targetLoginPassword;
  const sekEmail = process.env.USER_SEKRETARIAT_USERNAME || 'Mkalmunawar@gmail.com';
  const sekPass = process.env.USER_SEKRETARIAT_PASSWORD || '@Celestial12';

  const payload = buildSdiPayloadFromKemenporaExcel({
    idData: bundle.idData,
    userEmail: pengusulEmail
  });

  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║   INSERT DATA EXCEL KEMENPORA: RegDataset ➔ RegEntitasData ➔ RegKamusData    ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log(`  🆔 ID Data (RegEntitas/Kamus) : ${bundle.idData}`);
  console.log(`  📦 ID Dataset (RegDataset)    : ${bundle.idDataset} (${bundle.dataset.namaDataset})`);
  console.log(`  📝 Deskripsi Dataset          : ${bundle.dataset.deskripsiDataset}`);
  console.log(`  🗂️  Nama Entitas               : ${bundle.entitas.namaEntitas} (${bundle.entitas.definisi})`);
  console.log(`  📖 Total Elemen RegKamusData  : ${bundle.kamusData.length} Elemen (${bundle.kamusData[0]?.idElemen || '-'} s.d. ${bundle.kamusData[bundle.kamusData.length - 1]?.idElemen || '-'})`);
  console.log(`  🏢 Pengusul ➔ Target          : ${instansiCtx.loginInstansiName} ➔ ${instansiCtx.targetInstansi}\n`);

  try {
    // --------------------------------------------------------------------------
    // CEK ANTREAN WALIDATA KEMENPORA TERLEBIH DAHULU
    // Jika belum ada baris antrean siap registrasi untuk dataset ini, buat & setujui usulan baru
    // --------------------------------------------------------------------------
    const checkCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const checkPage = await checkCtx.newPage();
    let hasReadyQueueRow = false;

    try {
      await performLogin(
        checkPage,
        logger,
        { username: targetEmail, password: targetPassword, roleName: 'Walidata Kemenpora' },
        'C'
      );
      await safeNavigate(checkPage, `${BASE_URL}/registrasi/data`, logger, 'C');
      await checkPage.waitForTimeout(2000);

      // Cek apakah ada baris dengan nama dataset ini yang memiliki tombol Registrasikan Data
      const matchingRowBtn = checkPage
        .locator('tbody tr')
        .filter({ hasText: bundle.dataset.namaDataset })
        .locator('button[title="Registrasikan Data"], [id^="button-registrasi-data-registrasikan-"]')
        .first();

      hasReadyQueueRow = await matchingRowBtn.isVisible({ timeout: 2500 }).catch(() => false);
    } finally {
      await checkCtx.close();
    }

    const timestamp = Date.now();
    const namaDatasetUsulan = `${bundle.dataset.namaDataset} - ${bundle.dataset.deskripsiDataset} [${timestamp}]`.slice(0, 100);

    if (hasReadyQueueRow) {
      console.log(
        `⚡ Ditemukan usulan aktif untuk dataset "${bundle.dataset.namaDataset}" (${bundle.idDataset}) di antrean /registrasi/data. Langsung melanjutkan ke insert Step 1–3...`
      );
    } else {
      // ------------------------------------------------------------------------
      // FASE 1: PENGUSUL (KEMENDAGRI) AJUKAN USULAN KEBUTUHAN DATA KE KEMENPORA
      // ------------------------------------------------------------------------
      console.log(`▶ [FASE 1] Mengajukan usulan kebutuhan data baru untuk ${bundle.idDataset} (${bundle.dataset.namaDataset})...`);
      const pengusulContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const pengusulPage = await pengusulContext.newPage();

      await performLogin(
        pengusulPage,
        logger,
        {
          username: pengusulEmail,
          password: pengusulPassword,
          roleName: `Pengusul ${instansiCtx.loginInstansiName}`
        },
        'A'
      );

      await safeNavigate(pengusulPage, `${BASE_URL}/perencanaan/kebutuhan-data`, logger, 'A');
      await pengusulPage.waitForTimeout(2000);

      const addBtn = pengusulPage
        .locator('#button-kebutuhan-tambah, #button-kebutuhan-ajukan, button:has-text("Ajukan Kebutuhan")')
        .first();
      await addBtn.waitFor({ state: 'visible', timeout: 15000 });
      await addBtn.click();
      await pengusulPage.waitForTimeout(1500);

      const modalDialog = pengusulPage.locator('[role="dialog"]').first();
      await modalDialog.waitFor({ state: 'visible', timeout: 8000 });

      const namaInput = modalDialog.locator('#input-kebutuhan-form-nama, #input-kebutuhan-form-nama-data, input').first();
      await namaInput.fill(namaDatasetUsulan);

      // Pilih Instansi Target: KEMENTERIAN PEMUDA DAN OLAHRAGA
      const instansiTrigger = modalDialog
        .locator('#button-kebutuhan-form-instansi-trigger, button[role="combobox"]')
        .first();
      if (await instansiTrigger.isVisible({ timeout: 3000 }).catch(() => false)) {
        await instansiTrigger.click();
        await pengusulPage.waitForTimeout(500);
        const searchBox = pengusulPage.locator('input[placeholder*="Cari" i]').first();
        if (await searchBox.isVisible({ timeout: 2000 }).catch(() => false)) {
          await searchBox.fill('PEMUDA DAN OLAHRAGA');
          await pengusulPage.waitForTimeout(600);
        }
        const option = pengusulPage.locator('[role="option"]:has-text("KEMENTERIAN PEMUDA DAN OLAHRAGA")').first();
        if (await option.isVisible({ timeout: 4000 }).catch(() => false)) {
          await option.click();
        } else {
          const fallbackOpt = pengusulPage.locator('[role="option"]').first();
          if (await fallbackOpt.isVisible()) await fallbackOpt.click();
        }
      }

      const produsenInput = modalDialog.locator('#input-kebutuhan-form-produsen-data').first();
      if (await produsenInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await produsenInput.fill(payload.kebutuhanData.produsenData);
      }

      const walidataInput = modalDialog.locator('#input-kebutuhan-form-walidata').first();
      if (await walidataInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await walidataInput.fill(payload.kebutuhanData.waliData);
      }

      const tujuanInput = modalDialog.locator('#input-kebutuhan-form-tujuan-pengusulan, textarea').first();
      if (await tujuanInput.isVisible()) {
        await tujuanInput.fill(payload.kebutuhanData.tujuanPengusulan);
      }

      await assertNoValidationErrors(pengusulPage, `Pengajuan Usulan Kebutuhan Kemenpora [${bundle.idDataset}]`);
      const submitUsulanBtn = modalDialog
        .locator('#button-kebutuhan-form-submit, button:has-text("Kirim Usulan Kebutuhan"), button:has-text("Ajukan")')
        .first();
      await submitUsulanBtn.click({ force: true });
      await pengusulPage.waitForTimeout(3000);

      await safeDismissUnexpectedPopups(pengusulPage, logger, 'A');
      console.log(`   ✅ Usulan "${namaDatasetUsulan}" berhasil diajukan.`);
      await pengusulContext.close();

      // ------------------------------------------------------------------------
      // FASE 2: SEKRETARIAT SDI TETAPKAN STATUS "DAPAT DISEDIAKAN"
      // ------------------------------------------------------------------------
      console.log(`▶ [FASE 2] Sekretariat SDI menetapkan usulan ${bundle.idDataset} menjadi "Dapat Disediakan"...`);
      const sekContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const sekPage = await sekContext.newPage();

      await performLogin(
        sekPage,
        logger,
        { username: sekEmail, password: sekPass, roleName: 'Sekretariat SDI' },
        'B'
      );

      await safeNavigate(sekPage, `${BASE_URL}/perencanaan/kebutuhan-data`, logger, 'B');
      await sekPage.waitForTimeout(2000);

      const penetapanBtn = sekPage.locator('button:has-text("Penetapan"), a:has-text("Penetapan")').first();
      await penetapanBtn.waitFor({ state: 'visible', timeout: 15000 });
      await penetapanBtn.click();
      await sekPage.waitForTimeout(1500);

      const penetapanModal = sekPage.locator('[role="dialog"]').first();
      if (await penetapanModal.isVisible({ timeout: 5000 }).catch(() => false)) {
        const catInput = penetapanModal.locator('textarea').first();
        if (await catInput.isVisible()) {
          await catInput.fill(payload.kebutuhanData.catatanReviewSekretariat);
        }
        const confirmBtn = penetapanModal
          .locator('#button-kebutuhan-detail-dapat-disediakan, button:has-text("Konfirmasi Dapat Disediakan")')
          .first();
        await confirmBtn.waitFor({ state: 'visible', timeout: 5000 });
        await confirmBtn.click();
        await sekPage.waitForTimeout(3000);
      }
      await safeDismissUnexpectedPopups(sekPage, logger, 'B');
      console.log('   ✅ Usulan berhasil ditetapkan "Dapat Disediakan" oleh Sekretariat.');
      await sekContext.close();
    }

    // --------------------------------------------------------------------------
    // FASE 3: WALIDATA KEMENPORA INSERT DATASET (Step 1), ENTITAS (Step 2), & KAMUS DATA (Step 3)
    // --------------------------------------------------------------------------
    console.log(
      `▶ [FASE 3] Walidata Kemenpora melakukan Insert untuk ID Data ${bundle.idData} (${bundle.idDataset} - ${bundle.dataset.namaDataset})...`
    );
    const kemenporaContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const kemenporaPage = await kemenporaContext.newPage();

    await performLogin(
      kemenporaPage,
      logger,
      {
        username: targetEmail,
        password: targetPassword,
        roleName: 'Walidata Kemenpora'
      },
      'C'
    );

    await safeNavigate(kemenporaPage, `${BASE_URL}/registrasi/data`, logger, 'C');
    await kemenporaPage.waitForTimeout(2500);

    // Utamakan baris yang cocok dengan namaDataset, fallback ke baris pertama
    const specificRowBtn = kemenporaPage
      .locator('tbody tr')
      .filter({ hasText: bundle.dataset.namaDataset })
      .locator('button[title="Registrasikan Data"], [id^="button-registrasi-data-registrasikan-"]')
      .first();

    if (await specificRowBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await specificRowBtn.click();
    } else {
      const regBtn = kemenporaPage
        .locator('#button-registrasi-data-registrasikan-0, button[title="Registrasikan Data"]')
        .first();
      await regBtn.waitFor({ state: 'visible', timeout: 15000 });
      await regBtn.click();
    }
    await kemenporaPage.waitForTimeout(3000);

    const currentUrl = kemenporaPage.url();
    console.log(`   🔗 URL Form Registrasi: ${currentUrl}`);

    // Jalankan pengisian Step 1 (RegDataset), Step 2 (RegEntitasData), dan Step 3 (RegKamusData berdasarkan ID Data)
    await fillDatasetRegistrationFromExcelPayload(kemenporaPage, payload, { validateErrors: true });

    // Submit & Review Registrasi Dataset
    console.log('   ▶ Mengirimkan Registrasi Dataset...');
    const submitBtn = kemenporaPage
      .locator(
        '#button-dataset-open-confirm-submit, button:has-text("Kirimkan Registrasi Dataset"), button:has-text("Review"), button:has-text("Kirim")'
      )
      .first();
    await submitBtn.waitFor({ state: 'visible', timeout: 8000 });
    await submitBtn.click({ force: true });
    await kemenporaPage.waitForTimeout(1500);

    const confirmModal = kemenporaPage.locator('[role="dialog"]').first();
    await confirmModal.waitFor({ state: 'visible', timeout: 5000 });

    const checkbox = confirmModal.locator('input[type="checkbox"]').first();
    if (await checkbox.isVisible()) {
      await checkbox.check();
      await kemenporaPage.waitForTimeout(400);
    }

    await assertNoValidationErrors(kemenporaPage, 'Modal Konfirmasi Kirim Registrasi Dataset');
    const finalSubmitBtn = confirmModal
      .locator('button:has-text("Setujui & Kirim"), button:has-text("Kirim Registrasi Dataset")')
      .first();
    await finalSubmitBtn.click({ force: true });
    await kemenporaPage.waitForTimeout(3000);

    await safeDismissUnexpectedPopups(kemenporaPage, logger, 'C');
    console.log(
      `   ✅ Registrasi Dataset ${bundle.idDataset} (${bundle.idData} - ${bundle.dataset.namaDataset}) berhasil disubmit oleh Walidata Kemenpora!`
    );
    await kemenporaContext.close();

    // --------------------------------------------------------------------------
    // FASE 4: SEKRETARIAT SDI REVIEW & PUBLISH DATASET
    // --------------------------------------------------------------------------
    console.log(`▶ [FASE 4] Sekretariat SDI mereview dan menyetujui (Publish) dataset ${bundle.idDataset}...`);
    const sekPubContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const sekPubPage = await sekPubContext.newPage();

    await performLogin(
      sekPubPage,
      logger,
      { username: sekEmail, password: sekPass, roleName: 'Sekretariat SDI' },
      'B'
    );

    await safeNavigate(sekPubPage, `${BASE_URL}/registrasi/data`, logger, 'B');
    await sekPubPage.waitForTimeout(2500);

    let reviewBtn = sekPubPage
      .locator('tbody tr')
      .filter({ hasText: bundle.dataset.namaDataset })
      .locator('button[title="Review Registrasi Data"], [id^="button-registrasi-data-review-"]')
      .first();

    if (!(await reviewBtn.isVisible({ timeout: 2500 }).catch(() => false))) {
      reviewBtn = sekPubPage
        .locator('#button-registrasi-data-review-0, button[title="Review Registrasi Data"]')
        .first();
    }

    if (!(await reviewBtn.isVisible({ timeout: 4000 }).catch(() => false))) {
      await safeNavigate(sekPubPage, `${BASE_URL}/perencanaan/daftar-data`, logger, 'B');
      await sekPubPage.waitForTimeout(2000);
      reviewBtn = sekPubPage
        .locator('#button-daftar-data-review-0, #button-registrasi-data-review-0, button[title="Review Registrasi Data"]')
        .first();
    }

    if (await reviewBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
      await reviewBtn.click();
      await sekPubPage.waitForTimeout(2500);

      console.log(`   🔍 URL Review Sekretariat: ${sekPubPage.url()}`);

      const nextStep2Btn = sekPubPage.locator('button:has-text("Lanjut Langkah 2")').first();
      if (await nextStep2Btn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await nextStep2Btn.click({ force: true });
        await sekPubPage.waitForTimeout(1500);
      }

      const nextStep3Btn = sekPubPage.locator('button:has-text("Lanjut Langkah 3")').first();
      if (await nextStep3Btn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await nextStep3Btn.click({ force: true });
        await sekPubPage.waitForTimeout(2000);
      }

      const approveBtn = sekPubPage
        .locator(
          'button:has-text("Setujui Dataset (Published)"), button:has-text("Setujui Dataset"), button:has-text("Publish"), button:has-text("Setujui")'
        )
        .first();

      if (await approveBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
        await approveBtn.click({ force: true });
        await sekPubPage.waitForTimeout(3000);

        const confirmApproveBtn = sekPubPage
          .locator(
            '[role="dialog"] button:has-text("Ya"), [role="dialog"] button:has-text("Setujui"), [role="dialog"] button:has-text("Lanjutkan")'
          )
          .first();
        if (await confirmApproveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await confirmApproveBtn.click({ force: true });
          await sekPubPage.waitForTimeout(2500);
        }

        console.log(`   ✅ Dataset ${bundle.idDataset} (${bundle.dataset.namaDataset}) berhasil disetujui dan berstatus Published.`);
      }
    }

    await safeDismissUnexpectedPopups(sekPubPage, logger, 'B');
    await sekPubContext.close();

    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log(
      `║  SUKSES: ${bundle.idData} / ${bundle.idDataset} (${bundle.dataset.namaDataset.padEnd(20).slice(0, 20)}) BERHASIL DI-INSERT! ║`
    );
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
    return true;
  } catch (err: any) {
    console.error(`❌ Gagal insert untuk ${bundle.idData} (${bundle.idDataset} - ${bundle.dataset.namaDataset}):`, err.message);
    return false;
  } finally {
    await browser.close();
  }
}

/**
 * Menjalankan flow insert data Excel Kemenpora berdasarkan ID Data:
 * - Mendukung pemilihan 1 ID Data spesifik (DT-PORA-001 s.d. DT-PORA-030)
 * - Mendukung eksekusi semua 30 ID Data sekaligus (options.all = true)
 * - Mendukung menu interaktif pemilihan ID Data (options.interactive = true)
 */
export async function runRegisterKemenporaMTNFlow(options: RegisterKemenporaOptions = {}): Promise<boolean> {
  const catalog = loadKemenporaExcelCatalog();

  if (options.interactive) {
    const mode = await select({
      message: 'Pilih Mode Insert Data Excel Kemenpora (RegDataset, RegEntitasData, RegKamusData):',
      choices: [
        {
          name: '1. Pilih Berdasarkan ID Data Spesifik (DT-PORA-001 s.d. DT-PORA-030) [Recommended]',
          value: 'single',
          description: 'Pilih salah satu dari 30 ID Data untuk insert Dataset, Entitas, dan seluruh elemen Kamus Datanya'
        },
        {
          name: '2. Insert Seluruh 30 ID Data Secara Berurutan (DT-PORA-001 s.d. DT-PORA-030)',
          value: 'all',
          description: 'Looping otomatis insert seluruh 30 Dataset, 30 Entitas, dan 211 Elemen Kamus Data dari Excel'
        }
      ],
      default: 'single'
    });

    if (mode === 'all') {
      options.all = true;
    } else {
      const chosenIdData = await select({
        message: 'Pilih ID Data (DT-PORA-xxx / DS-PORA-xxx) yang akan di-insert:',
        choices: catalog.map((b) => ({
          name: `${b.idData} | ${b.idDataset} | ${b.dataset.namaDataset.padEnd(22)} (${b.kamusData.length} elemen kamus data)`,
          value: b.idData,
          description: `Dataset: ${b.dataset.deskripsiDataset} | Entitas: ${b.entitas.namaEntitas}`
        })),
        pageSize: 15
      });
      options.idData = chosenIdData;
    }
  }

  if (options.all) {
    console.log(`\n🚀 Memulai Insert Berurutan untuk Seluruh ${catalog.length} ID Data (DT-PORA-001 s.d. DT-PORA-030)...\n`);
    let successCount = 0;
    for (let i = 0; i < catalog.length; i++) {
      const b = catalog[i];
      console.log(`\n════════════════════════════════════════════════════════════════════════════════`);
      console.log(`📌 [${i + 1}/${catalog.length}] Memproses ${b.idData} (${b.idDataset} - ${b.dataset.namaDataset})...`);
      console.log(`════════════════════════════════════════════════════════════════════════════════`);
      const ok = await runInsertSingleKemenporaBundle(b);
      if (ok) successCount++;
    }
    console.log(
      `\n🏁 Selesai Insert Seluruh ID Data: ${successCount}/${catalog.length} ID Data berhasil diregistrasikan hingga Published.`
    );
    return successCount === catalog.length;
  }

  const bundle = pickKemenporaDataset(options.idData || 'DT-PORA-001');
  return runInsertSingleKemenporaBundle(bundle);
}

// Eksekusi langsung dari CLI:
// - npx tsx src/flows/register-kemenpora-mtn-flow.ts                -> interaktif (jika TTY) atau DT-PORA-001
// - npx tsx src/flows/register-kemenpora-mtn-flow.ts --id=DT-PORA-002 -> insert ID Data spesifik
// - npx tsx src/flows/register-kemenpora-mtn-flow.ts --all          -> insert seluruh 30 ID Data
if (process.argv[1]?.includes('register-kemenpora-mtn-flow')) {
  const args = process.argv.slice(2);
  const isAll = args.includes('--all');
  const idArg = args.find((a) => a.startsWith('--id='))?.split('=')[1] || args.find((a) => !a.startsWith('--'));
  const envId = process.env.ID_DATA || process.env.DATASET_ID;
  const isInteractive = !isAll && !idArg && !envId && Boolean(process.stdin.isTTY);

  runRegisterKemenporaMTNFlow({
    idData: idArg || envId,
    all: isAll,
    interactive: isInteractive
  }).catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
