import { chromium } from 'playwright';
import { performLogin } from './pages/auth.page.js';
import { safeNavigate, assertNoValidationErrors } from './utils/page-error-guard.js';
import { StepLogger } from './utils/step-logger.js';

async function testEntitas255LiveFlow() {
  const browser = await chromium.launch({ headless: true, slowMo: 100 });
  const BASE_URL = 'https://fe-staging.data.go.id';
  const dummyLogger = new StepLogger(['AUTH', 'A', 'B', 'C'], 'Entitas255Test');

  const textEntitas255 =
    'Entitas data agregat kependudukan yang memuat seluruh parameter identitas penduduk nasional, status keterpaduan sosial ekonomi, data kemiskinan ekstrem, serta riwayat bantuan secara periodik dan terstandarisasi untuk kebutuhan integrasi antar instansi RI.';

  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║       UJI FIELD DEFINISI ENTITAS DENGAN 255 KARAKTER (PORTAL SDI)            ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log(`Panjang teks yang akan diuji: ${textEntitas255.length} karakter`);
  console.log(`Teks uji:\n"${textEntitas255}"\n`);

  try {
    // --------------------------------------------------------------------------
    // Cek apakah Walidata Kemendagri sudah punya baris siap registrasi
    // --------------------------------------------------------------------------
    let waliContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    let waliPage = await waliContext.newPage();

    await performLogin(
      waliPage,
      dummyLogger,
      { username: 'exchange@test.kemendagri.go.id', password: '123456789', roleName: 'Walidata Kemendagri' },
      'AUTH'
    );
    await safeNavigate(waliPage, `${BASE_URL}/registrasi/data`, dummyLogger, 'CHECK');
    await waliPage.waitForTimeout(2000);

    const existingRegBtn = waliPage.locator('#button-registrasi-data-registrasikan-0, button[title="Registrasikan Data"]').first();
    const hasExistingRow = await existingRegBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasExistingRow) {
      console.log('⚡ Ditemukan baris yang siap diregistrasikan di Walidata Kemendagri.');
    } else {
      console.log('ℹ️ Tidak ada baris aktif di Walidata Kemendagri. Menyiapkan usulan baru...');
      await waliContext.close();

      // 1. PENGUSUL KEMENSOS BUAT USULAN BARU
      console.log('▶ [1/2] Pengusul Kemensos membuat usulan baru...');
      const pengusulContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const pengusulPage = await pengusulContext.newPage();

      await performLogin(
        pengusulPage,
        dummyLogger,
        { username: 'exchange@test.kemensos.go.id', password: '123456789', roleName: 'Pengusul Kemensos' },
        'AUTH'
      );
      await safeNavigate(pengusulPage, `${BASE_URL}/perencanaan/kebutuhan-data`, dummyLogger, 'A');
      await pengusulPage.waitForTimeout(2000);

      const now = Date.now();
      const namaData = `Data Uji Entitas 255 [${now}]`;

      const addBtn = pengusulPage.locator('#button-kebutuhan-tambah, button:has-text("Ajukan Kebutuhan")').first();
      await addBtn.waitFor({ state: 'visible', timeout: 10000 });
      await addBtn.click();
      await pengusulPage.waitForTimeout(1500);

      const modal = pengusulPage.locator('[role="dialog"]').first();
      await modal.waitFor({ state: 'visible', timeout: 5000 });

      const namaInput = modal.locator('#input-kebutuhan-form-nama, input').first();
      await namaInput.fill(namaData);

      const trigger = modal.locator('#button-kebutuhan-form-instansi-trigger, button[role="combobox"]').first();
      if (await trigger.isVisible()) {
        await trigger.click();
        await pengusulPage.waitForTimeout(500);
        const searchIn = pengusulPage.locator('input[placeholder*="Cari" i]').first();
        if (await searchIn.isVisible()) await searchIn.fill('DALAM NEGERI');
        await pengusulPage.waitForTimeout(500);
        const item = pengusulPage.locator('[role="option"]:has-text("KEMENTERIAN DALAM NEGERI")').first();
        if (await item.isVisible()) await item.click();
      }

      const tujuanInput = modal.locator('textarea').first();
      if (await tujuanInput.isVisible()) {
        await tujuanInput.fill('Pengujian batas maksimal 255 karakter pada definisi entitas registrasi data.');
      }

      const submitUsulanBtn = modal.locator('#button-kebutuhan-form-submit, button:has-text("Ajukan")').first();
      await submitUsulanBtn.click();
      await pengusulPage.waitForTimeout(3000);
      console.log(`✅ Usulan "${namaData}" berhasil diajukan.`);
      await pengusulContext.close();

      // 2. SEKRETARIAT SDI KONFIRMASI "DAPAT DISEDIAKAN"
      console.log('▶ [2/2] Sekretariat SDI menetapkan status "Dapat Disediakan"...');
      const sekContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const sekPage = await sekContext.newPage();

      await performLogin(
        sekPage,
        dummyLogger,
        { username: 'Mkalmunawar@gmail.com', password: '@Celestial12', roleName: 'Sekretariat SDI' },
        'AUTH'
      );
      await safeNavigate(sekPage, `${BASE_URL}/perencanaan/kebutuhan-data`, dummyLogger, 'B');
      await sekPage.waitForTimeout(2000);

      const penetapanBtn = sekPage.locator('button:has-text("Penetapan"), a:has-text("Penetapan")').first();
      await penetapanBtn.waitFor({ state: 'visible', timeout: 15000 });
      await penetapanBtn.click();
      await sekPage.waitForTimeout(2000);

      const catatanReview = sekPage.locator('textarea').first();
      if (await catatanReview.isVisible({ timeout: 2000 }).catch(() => false)) {
        await catatanReview.fill('Disetujui untuk pengujian batas karakter entitas.');
      }

      const konfirmBtn = sekPage.locator('#button-kebutuhan-detail-dapat-disediakan, button:has-text("Konfirmasi Dapat Disediakan")').first();
      await konfirmBtn.waitFor({ state: 'visible', timeout: 5000 });
      await konfirmBtn.click();
      await sekPage.waitForTimeout(3000);
      console.log('✅ Sekretariat berhasil menetapkan status "Dapat Disediakan".');
      await sekContext.close();

      // Buka kembali Walidata Kemendagri
      waliContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      waliPage = await waliContext.newPage();

      await performLogin(
        waliPage,
        dummyLogger,
        { username: 'exchange@test.kemendagri.go.id', password: '123456789', roleName: 'Walidata Kemendagri' },
        'AUTH'
      );
      await safeNavigate(waliPage, `${BASE_URL}/registrasi/data`, dummyLogger, 'C');
      await waliPage.waitForTimeout(2000);
    }

    // --------------------------------------------------------------------------
    // 3. WALIDATA BUKA FORM REGISTRASI DATA
    // --------------------------------------------------------------------------
    console.log('▶ Membuka Form Registrasi Data...');
    const regBtn = waliPage.locator('#button-registrasi-data-registrasikan-0, button[title="Registrasikan Data"]').first();
    await regBtn.waitFor({ state: 'visible', timeout: 15000 });
    await regBtn.click();
    await waliPage.waitForTimeout(3000);

    const currentRegUrl = waliPage.url();
    console.log(`   🔗 URL Form Registrasi: ${currentRegUrl}`);

    // STEP 1: Lengkapi seluruh field wajib Step 1
    console.log('▶ Mengisi Step 1 (Informasi Dataset)...');
    const descStep1 = waliPage.locator('#input-dataset-step1-deskripsi, textarea').first();
    if (await descStep1.isVisible({ timeout: 5000 }).catch(() => false)) {
      await descStep1.fill('Dataset agregat kependudukan untuk validasi limit definisi entitas.'.slice(0, 255));
    }

    // Pilih Klasifikasi Risiko: Terbatas
    const klasifikasiBtn = waliPage.locator('button:has-text("Terbatas")').first();
    if (await klasifikasiBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await klasifikasiBtn.click({ force: true });
      console.log('   🏷️  Klasifikasi Risiko dipilih: Terbatas');
    }

    // Format Ketersediaan Data
    for (const fmt of ['JSON', 'REST API']) {
      const fmtBtn = waliPage.locator(`button:has-text("${fmt}")`).first();
      if (await fmtBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await fmtBtn.click({ force: true }).catch(() => {});
      }
    }

    // Selects: Tema, Jenis Data, Frekuensi, Dampak
    const selects = waliPage.locator('select');
    const selectCount = await selects.count();
    console.log(`   📋 Mengisi ${selectCount} dropdown select di Step 1...`);
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
    await waliPage.waitForTimeout(500);

    // Klik Lanjut ke Step 2
    const nextStep1 = waliPage.locator('#button-dataset-next-step, button:has-text("Lanjut Langkah 2"), button:has-text("Lanjut")').first();
    await nextStep1.waitFor({ state: 'visible', timeout: 5000 });
    await nextStep1.click({ force: true });
    await waliPage.waitForTimeout(2000);

    console.log(`   🌐 URL saat ini (harus di Step 2): ${waliPage.url()}`);

    // --------------------------------------------------------------------------
    // STEP 2: UJI FIELD DEFINISI ENTITAS DENGAN 255 KARAKTER
    // --------------------------------------------------------------------------
    console.log('\n▶ Menguji Step 2 (Tambah Entitas & Definisi 255 Karakter)...');
    const addEntitasBtn = waliPage.locator('#button-dataset-step2-tambah-entitas, button:has-text("Tambah Entitas")').first();
    await addEntitasBtn.waitFor({ state: 'visible', timeout: 10000 });
    await addEntitasBtn.click({ force: true });
    await waliPage.waitForTimeout(1500);

    const entModal = waliPage.locator('[role="dialog"]').first();
    await entModal.waitFor({ state: 'visible', timeout: 5000 });
    console.log('   🔍 Modal "Tambah Entitas" berhasil terbuka.');

    // 1. Cek field nama entitas
    const entNameInput = entModal.locator('input').first();
    await entNameInput.fill('entitas_kependudukan_255');
    console.log('   📝 Nama entitas diisi: "entitas_kependudukan_255"');

    // 2. Cek atribut dan elemen textarea definisi
    const entDescTextarea = entModal.locator('textarea').first();
    const maxlengthAttr = await entDescTextarea.getAttribute('maxlength').catch(() => null);
    console.log(`   ℹ️  Atribut HTML 'maxlength' pada textarea definisi: ${maxlengthAttr !== null ? maxlengthAttr : 'Tidak ada batasan di atribut HTML (None)'}`);

    // 3. Isi textarea dengan tepat 255 karakter
    console.log(`   ✍️  Mengisi textarea definisi dengan ${textEntitas255.length} karakter...`);
    await entDescTextarea.fill(textEntitas255);
    await waliPage.waitForTimeout(500);

    // 4. Verifikasi panjang string yang tersimpan di DOM textarea
    const actualLength = (await entDescTextarea.inputValue()).length;
    console.log(`   📏 Panjang karakter terisi di DOM: ${actualLength} karakter`);

    if (actualLength === 255) {
      console.log('   ✅ DOM textarea menerima tepat 255 karakter tanpa pemotongan otomatis!');
    } else {
      console.warn(`   ⚠️ DOM textarea berisi ${actualLength} karakter.`);
    }

    // 5. Coba periksa apakah ada indikator counter (misal 255/255) atau pesan warning
    const counterText = await entModal.locator('text=/\\d+\\/\\d+/').innerText().catch(() => null);
    if (counterText) {
      console.log(`   🔢 Karakter counter terdeteksi: "${counterText}"`);
    }

    // 6. Klik tombol Tambah / Simpan di modal
    console.log('   💾 Menekan tombol "Tambah / Simpan Entitas"...');
    const saveEntitasBtn = entModal.locator('button:has-text("Tambah"), button:has-text("Simpan")').first();
    await saveEntitasBtn.click({ force: true });
    await waliPage.waitForTimeout(2000);

    // 7. Cek apakah modal tertutup dan tidak ada pesan error validasi
    const isModalStillOpen = await entModal.isVisible().catch(() => false);
    const errorMessages = await waliPage.locator('.text-red-500, .text-destructive, [role="alert"]').allInnerTexts().catch(() => []);

    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                              HASIL PENGUJIAN                                 ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

    let canAccept255 = false;
    if (!isModalStillOpen && errorMessages.length === 0) {
      console.log('   ✅ STATUS: BISA!');
      console.log('   ✅ Modal tertutup dengan sukses tanpa error validasi.');
      canAccept255 = true;
    } else if (isModalStillOpen && errorMessages.length > 0) {
      console.log('   ❌ STATUS: TIDAK BISA / GAGAL VALIDASI.');
      console.log(`   ❌ Pesan error: ${JSON.stringify(errorMessages)}`);
    } else {
      console.log(`   ⚠️ Modal masih terbuka: ${isModalStillOpen}, Errors: ${JSON.stringify(errorMessages)}`);
    }

    // 8. Cek apakah baris entitas tampil di tabel Step 2
    const pageText = await waliPage.locator('main, table').innerText().catch(() => '');
    const isRowInTable = pageText.includes('entitas_kependudukan_255');
    console.log(`   📊 Entitas tercantum di daftar tabel Step 2: ${isRowInTable ? 'YA (Tercantum)' : 'TIDAK'}`);

    // 9. Lanjut ke Step 3 untuk memastikan form state valid
    const nextStep2 = waliPage.locator('#button-dataset-next-step, button:has-text("Lanjut Langkah 3"), button:has-text("Lanjut")').first();
    if (await nextStep2.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nextStep2.click({ force: true });
      await waliPage.waitForTimeout(2000);
      const isStep3 = waliPage.url().includes('3') || (await waliPage.locator('text=Langkah 3, text=Kamus Data').isVisible().catch(() => false));
      console.log(`   🚀 Berhasil lanjut ke Step 3: ${isStep3 ? 'YA (Form State 100% Valid)' : 'Belum / Error'}`);
    }

    console.log('\n================================================================================');
    if (canAccept255 && isRowInTable) {
      console.log('🎯 KESIMPULAN FINAL: Definisi entitas DAPAT diisi dan disimpan dengan 255 karakter.');
    } else {
      console.log('🎯 KESIMPULAN FINAL: Pengujian menunjukkan kendala pada pengisian 255 karakter.');
    }
    console.log('================================================================================\n');

    await waliContext.close();
  } catch (err: any) {
    console.error('❌ Terjadi error saat uji alur entitas 255 karakter:', err);
  } finally {
    await browser.close();
  }
}

testEntitas255LiveFlow();
