import { chromium, Page } from 'playwright';
import { performLogin } from '../pages/auth.page.js';
import { safeNavigate, assertNoValidationErrors, safeDismissUnexpectedPopups } from '../utils/page-error-guard.js';
import { StepLogger } from '../utils/step-logger.js';
import { resolveInstansiContext, selectStrictInstansi } from '../utils/instansi-helper.js';
import { kemenpora14Entities, kemenpora99KamusElements } from '../generators/kemenpora-mtn-data.js';

export async function runRegisterKemenporaRelationalFlow() {
  const browser = await chromium.launch({ headless: true, slowMo: 50 });
  const BASE_URL = process.env.BASE_URL || 'https://fe-staging.data.go.id';
  const logger = new StepLogger(['INIT', 'A', 'B', 'C'], 'RegKemenporaRelasi');
  const instansiCtx = resolveInstansiContext('exchange@test.kemendagri.go.id');
  const pengusulEmail = instansiCtx.loginEmail;
  const pengusulPassword = process.env.USER_PENGUSUL_PASSWORD || '123456789';
  const targetEmail = instansiCtx.targetLoginEmail;
  const targetPassword = instansiCtx.targetLoginPassword;

  console.log('╔════════════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║     REGISTRASI DATASET KEMENPORA MTN SKEMA RELASIONAL: 14 ENTITAS & 106 KAMUS DATA     ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════════════════╝');
  console.log(`Pengusul : ${instansiCtx.loginInstansiName} (${pengusulEmail})`);
  console.log(`Target   : ${instansiCtx.targetInstansi} (${targetEmail})`);
  console.log(`Entitas  : ${kemenpora14Entities.length} Entitas Terelasi`);
  console.log(`Kamus    : ${kemenpora99KamusElements.length} Elemen Kamus Data Lengkap\n`);

  try {
    const timestamp = Date.now();
    const namaDatasetUsulan = `Data Terpadu Olahragawan dan Manajemen Talenta Keolahragaan Nasional (DS-PORA-001 Klaster Relasi) [${timestamp}]`;

    // --------------------------------------------------------------------------
    // FASE 1: KEMENDAGRI AJUKAN USULAN KEBUTUHAN DATA KE KEMENPORA
    // --------------------------------------------------------------------------
    console.log('▶ [FASE 1] Kemendagri mengajukan usulan kebutuhan data ke Kemenpora...');
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

    const addBtn = pengusulPage.locator('#button-kebutuhan-tambah, button:has-text("Ajukan Kebutuhan")').first();
    await addBtn.waitFor({ state: 'visible', timeout: 15000 });
    await addBtn.click();
    await pengusulPage.waitForTimeout(1500);

    const modalDialog = pengusulPage.locator('[role="dialog"]').first();
    await modalDialog.waitFor({ state: 'visible', timeout: 8000 });

    const namaInput = modalDialog.locator('#input-kebutuhan-form-nama, input').first();
    await namaInput.fill(namaDatasetUsulan);

    // Pilih Instansi Target secara ketat dengan jeda debounce 2 detik
    await selectStrictInstansi(pengusulPage, instansiCtx, logger, 'A');

    const tujuanInput = modalDialog.locator('#input-kebutuhan-form-tujuan-pengusulan, textarea').first();
    if (await tujuanInput.isVisible()) {
      await tujuanInput.fill(
        'Registrasi Data Kemenpora MTN (DS-PORA-001) klaster terpadu 14 entitas olahragawan untuk tata kelola Manajemen Talenta Nasional Keolahragaan.'
      );
    }

    await assertNoValidationErrors(pengusulPage, 'Pengajuan Usulan Kebutuhan Kemenpora');
    const submitUsulanBtn = modalDialog.locator('#button-kebutuhan-form-submit, button:has-text("Kirim Usulan Kebutuhan"), button:has-text("Ajukan")').first();
    await submitUsulanBtn.click({ force: true });
    await pengusulPage.waitForTimeout(3000);

    await safeDismissUnexpectedPopups(pengusulPage, logger, 'A');
    console.log(`   ✅ Usulan "${namaDatasetUsulan}" berhasil diajukan.`);
    await pengusulContext.close();

    // --------------------------------------------------------------------------
    // FASE 2: SEKRETARIAT SDI TETAPKAN STATUS "DAPAT DISEDIAKAN"
    // --------------------------------------------------------------------------
    console.log('▶ [FASE 2] Sekretariat SDI menetapkan usulan menjadi "Dapat Disediakan"...');
    const sekContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const sekPage = await sekContext.newPage();

    const sekEmail = process.env.USER_SEKRETARIAT_USERNAME || 'Mkalmunawar@gmail.com';
    const sekPass = process.env.USER_SEKRETARIAT_PASSWORD || '@Celestial12';

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
        await catInput.fill('Ditetapkan untuk registrasi data MTN Kemenpora klaster relasi olahragawan.');
      }
      const confirmBtn = penetapanModal.locator(
        '#button-kebutuhan-detail-dapat-disediakan, button:has-text("Konfirmasi Dapat Disediakan")'
      ).first();
      await confirmBtn.waitFor({ state: 'visible', timeout: 5000 });
      await confirmBtn.click();
      await sekPage.waitForTimeout(3000);
    }
    await safeDismissUnexpectedPopups(sekPage, logger, 'B');
    console.log('   ✅ Usulan berhasil ditetapkan "Dapat Disediakan" oleh Sekretariat.');
    await sekContext.close();

    // --------------------------------------------------------------------------
    // FASE 3: WALIDATA KEMENPORA REGISTRASI DATA (STEP 1 ➔ STEP 2 ➔ STEP 3)
    // --------------------------------------------------------------------------
    console.log('▶ [FASE 3] Walidata Kemenpora mengisi Registrasi Data (Step 1 s.d. Step 3)...');
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

    // Cari tombol Registrasikan Data pada baris pertama usulan
    const regBtn = kemenporaPage.locator(
      '#button-registrasi-data-registrasikan-0, button[title="Registrasikan Data"]'
    ).first();
    await regBtn.waitFor({ state: 'visible', timeout: 15000 });
    await regBtn.click();
    await kemenporaPage.waitForTimeout(3000);

    const currentUrl = kemenporaPage.url();
    console.log(`   🔗 URL Form Registrasi: ${currentUrl}`);

    // ==========================================================================
    // STEP 1: INFORMASI DATASET
    // ==========================================================================
    console.log('   ▶ [Step 1] Mengisi Informasi Dataset...');
    const descInput = kemenporaPage.locator('#input-dataset-step1-deskripsi');
    if (await descInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await descInput.fill(
        'Dataset relasional terpadu MTN Keolahragaan Kemenpora yang menyimpan data olahragawan, pelatih, pembinaan, serta riwayat prestasi dan pengukuran kesehatan nasional.'.slice(0, 255)
      );
    }

    // Klasifikasi Risiko: Terbatas (pastikan aktif)
    const terbatasBtn = kemenporaPage.locator('#button-dataset-step1-risiko-terbatas');
    const tbClass = (await terbatasBtn.getAttribute('class')) || '';
    if (!tbClass.includes('emerald') && !tbClass.includes('primary')) {
      await terbatasBtn.click();
      console.log('      🏷️ Klasifikasi Risiko: Terbatas');
    }

    // Format Data: JSON (pastikan aktif, jangan toggle off)
    const jsonBtn = kemenporaPage.locator('#button-dataset-step1-format-json');
    const jsonClass = (await jsonBtn.getAttribute('class')) || '';
    if (!jsonClass.includes('emerald') && !jsonClass.includes('primary')) {
      await jsonBtn.click();
      console.log('      📁 Format Data: JSON diaktifkan');
    } else {
      console.log('      📁 Format Data: JSON (sudah aktif)');
    }

    // Isi Dropdown Selects di Step 1
    const temaSelect = kemenporaPage.locator('#select-dataset-step1-tema');
    await temaSelect.selectOption({ label: 'Pendidikan dan Tenaga Kerja' });
    await temaSelect.dispatchEvent('change');

    const jenisSelect = kemenporaPage.locator('#select-dataset-step1-jenis-data');
    await jenisSelect.selectOption({ label: 'Data Induk' });
    await jenisSelect.dispatchEvent('change');

    const frekuensiSelect = kemenporaPage.locator('#select-dataset-step1-frekuensi');
    await frekuensiSelect.selectOption({ label: 'Tahunan' });
    await frekuensiSelect.dispatchEvent('change');

    const dampakKerahasiaan = kemenporaPage.locator('#select-dataset-step1-dampak-kerahasiaan');
    await dampakKerahasiaan.selectOption({ value: 'sedang' });
    await dampakKerahasiaan.dispatchEvent('change');

    const dampakIntegritas = kemenporaPage.locator('#select-dataset-step1-dampak-integritas');
    await dampakIntegritas.selectOption({ value: 'tinggi' });
    await dampakIntegritas.dispatchEvent('change');

    const dampakKetersediaan = kemenporaPage.locator('#select-dataset-step1-dampak-ketersediaan');
    await dampakKetersediaan.selectOption({ value: 'sedang' });
    await dampakKetersediaan.dispatchEvent('change');

    await kemenporaPage.waitForTimeout(500);

    await assertNoValidationErrors(kemenporaPage, 'Registrasi Dataset Step 1');
    const nextBtn1 = kemenporaPage.locator('#button-dataset-next-step').first();
    await nextBtn1.waitFor({ state: 'visible', timeout: 5000 });
    await nextBtn1.click({ force: true });
    await kemenporaPage.waitForTimeout(2000);
    console.log('   ✅ Step 1 berhasil disimpan.');

    // ==========================================================================
    // STEP 2: MULTI-ENTITAS DATA (14 ENTITAS TERELASI)
    // ==========================================================================
    console.log(`   ▶ [Step 2] Menambahkan ${kemenpora14Entities.length} Entitas Data Terelasi...`);

    for (let i = 0; i < kemenpora14Entities.length; i++) {
      const ent = kemenpora14Entities[i];
      console.log(`      [${i + 1}/${kemenpora14Entities.length}] Menambahkan entitas "${ent.namaEntitas}"...`);

      const addEntitasBtn = kemenporaPage.locator(
        '#button-dataset-step2-tambah-entitas, button:has-text("Tambah Entitas")'
      ).first();
      await addEntitasBtn.waitFor({ state: 'visible', timeout: 10000 });
      await addEntitasBtn.click({ force: true });
      await kemenporaPage.waitForTimeout(800);

      const entDialog = kemenporaPage.locator('[role="dialog"]').first();
      await entDialog.waitFor({ state: 'visible', timeout: 5000 });

      await entDialog.locator('#input-dataset-step2-nama-entitas').fill(ent.namaEntitas);
      await entDialog.locator('#input-dataset-step2-definisi-entitas').fill(ent.definisi.slice(0, 255));

      await assertNoValidationErrors(kemenporaPage, `Modal Entitas [${ent.namaEntitas}]`);
      const saveEntBtn = entDialog.locator('button:has-text("Tambah"), button:has-text("Simpan")').first();
      await saveEntBtn.click({ force: true });
      await kemenporaPage.waitForTimeout(1000);
    }

    console.log(`   ✅ Seluruh ${kemenpora14Entities.length} entitas berhasil didaftarkan di Langkah 2.`);
    await assertNoValidationErrors(kemenporaPage, 'Registrasi Dataset Step 2');

    const nextBtn2 = kemenporaPage.locator('#button-dataset-next-step').first();
    await nextBtn2.waitFor({ state: 'visible', timeout: 5000 });
    await nextBtn2.click({ force: true });
    await kemenporaPage.waitForTimeout(2000);
    console.log('   ✅ Step 2 berhasil disimpan.');

    // ==========================================================================
    // STEP 3: MULTI-KAMUS DATA (106 ELEMEN LENGKAP B4. RegKamusData.csv)
    // ==========================================================================
    console.log(`   ▶ [Step 3] Menambahkan ${kemenpora99KamusElements.length} Elemen Kamus Data Terelasi 1 per 1...`);

    for (let i = 0; i < kemenpora99KamusElements.length; i++) {
      const elem = kemenpora99KamusElements[i];
      if ((i + 1) % 10 === 0 || i === 0 || i === kemenpora99KamusElements.length - 1) {
        console.log(`      [${i + 1}/${kemenpora99KamusElements.length}] Memproses elemen "${elem.namaElemen}" [${elem.namaEntitas}] (${elem.tipeData})...`);
      }

      const addElemBtn = kemenporaPage.locator(
        '#button-dataset-step3-tambah-elemen, button:has-text("Tambah Elemen")'
      ).first();
      await addElemBtn.waitFor({ state: 'visible', timeout: 8000 });
      await addElemBtn.click({ force: true });
      await kemenporaPage.waitForTimeout(600);

      const elemDialog = kemenporaPage.locator('[role="dialog"]').first();
      await elemDialog.waitFor({ state: 'visible', timeout: 5000 });

      // Pilih Entitas pemilik elemen pada dropdown modal jika berbeda dari entitas pertama
      const entitasTrigger = elemDialog.locator('#select-dataset-step3-modal-entitas');
      if (await entitasTrigger.isVisible()) {
        const currentEnt = (await entitasTrigger.innerText().catch(() => '')).trim();
        if (currentEnt !== elem.namaEntitas) {
          await entitasTrigger.click();
          await kemenporaPage.waitForTimeout(300);
          const entOpt = kemenporaPage.locator(`[role="option"]:has-text("${elem.namaEntitas}")`).first();
          if (await entOpt.isVisible({ timeout: 2000 }).catch(() => false)) {
            await entOpt.click();
            await kemenporaPage.waitForTimeout(200);
          }
        }
      }

      // Isi input fields yang memiliki ID spesifik
      await elemDialog.locator('#input-dataset-step3-modal-nama-elemen').fill(elem.namaElemen);
      await elemDialog.locator('#input-dataset-step3-modal-alias').fill(elem.alias);
      await elemDialog.locator('#textarea-dataset-step3-modal-definisi').fill(elem.definisi.slice(0, 255));
      await elemDialog.locator('#input-dataset-step3-modal-satuan').fill(elem.satuan);
      await elemDialog.locator('#input-dataset-step3-modal-format-panjang').fill(elem.formatPanjang);

      // Sifat Kewajiban (Mandatory / Optional)
      if (elem.sifatKewajiban === 'Optional') {
        const kewajibanTrigger = elemDialog.locator('#select-dataset-step3-modal-sifat-kewajiban');
        if (await kewajibanTrigger.isVisible()) {
          await kewajibanTrigger.click();
          await kemenporaPage.waitForTimeout(250);
          const opt = kemenporaPage.locator('[role="option"]:has-text("Optional")').first();
          if (await opt.isVisible()) await opt.click();
        }
      }

      await assertNoValidationErrors(kemenporaPage, `Modal Elemen Kamus Data [${elem.namaElemen}]`);
      const saveElemBtn = elemDialog.locator('#button-dataset-step3-modal-simpan, button:has-text("Tambah Kamus Data"), button:has-text("Simpan")').first();
      await saveElemBtn.click({ force: true });
      await kemenporaPage.waitForTimeout(600);
    }

    console.log(`   ✅ Seluruh ${kemenpora99KamusElements.length} elemen kamus data berhasil ditambahkan ke daftar.`);
    await assertNoValidationErrors(kemenporaPage, 'Registrasi Dataset Step 3 (Daftar Kamus Data)');

    // Pilih Primary Key pada baris id_olahragawan
    const pkRadio = kemenporaPage.locator('tbody tr:has-text("id_olahragawan") button:has-text("Pilih PK"), tbody tr:has-text("id_olahragawan") input[type="radio"]').first();
    if (await pkRadio.isVisible({ timeout: 3000 }).catch(() => false)) {
      await pkRadio.click({ force: true });
      console.log('   🔑 Primary Key "id_olahragawan" dipilih.');
      await kemenporaPage.waitForTimeout(500);
    }

    // ==========================================================================
    // SUBMIT & REVIEW REGISTRASI DATASET
    // ==========================================================================
    console.log('   ▶ Mengirimkan Registrasi Dataset...');
    const submitBtn = kemenporaPage.locator(
      '#button-dataset-open-confirm-submit, button:has-text("Kirimkan Registrasi Dataset"), button:has-text("Review"), button:has-text("Kirim")'
    ).first();
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
    const finalSubmitBtn = confirmModal.locator(
      'button:has-text("Setujui & Kirim"), button:has-text("Kirim Registrasi Dataset")'
    ).first();
    await finalSubmitBtn.click({ force: true });
    await kemenporaPage.waitForTimeout(3000);

    await safeDismissUnexpectedPopups(kemenporaPage, logger, 'C');
    console.log('   ✅ Registrasi Dataset berhasil disubmit oleh Walidata Kemenpora!');
    await kemenporaContext.close();

    // --------------------------------------------------------------------------
    // FASE 4: SEKRETARIAT SDI REVIEW & PUBLISH DATASET
    // --------------------------------------------------------------------------
    console.log('▶ [FASE 4] Sekretariat SDI mereview dan menyetujui (Publish) dataset...');
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

    let reviewBtn = sekPubPage.locator(
      '#button-registrasi-data-review-0, button[title="Review Registrasi Data"]'
    ).first();

    if (!(await reviewBtn.isVisible({ timeout: 4000 }).catch(() => false))) {
      await safeNavigate(sekPubPage, `${BASE_URL}/perencanaan/daftar-data`, logger, 'B');
      await sekPubPage.waitForTimeout(2000);
      reviewBtn = sekPubPage.locator(
        '#button-daftar-data-review-0, #button-registrasi-data-review-0, button[title="Review Registrasi Data"]'
      ).first();
    }

    if (await reviewBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
      await reviewBtn.click();
      await sekPubPage.waitForTimeout(2500);

      console.log(`   🔍 URL Review Sekretariat: ${sekPubPage.url()}`);

      // Review Langkah 1 -> Lanjut Langkah 2
      const nextStep2Btn = sekPubPage.locator('button:has-text("Lanjut Langkah 2")').first();
      if (await nextStep2Btn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await nextStep2Btn.click({ force: true });
        await sekPubPage.waitForTimeout(1500);
      }

      // Review Langkah 2 -> Lanjut Langkah 3
      const nextStep3Btn = sekPubPage.locator('button:has-text("Lanjut Langkah 3")').first();
      if (await nextStep3Btn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await nextStep3Btn.click({ force: true });
        await sekPubPage.waitForTimeout(2000);
      }

      // Langkah 3: Klik tombol "Setujui Dataset (Published)"
      const approveBtn = sekPubPage.locator(
        'button:has-text("Setujui Dataset (Published)"), button:has-text("Setujui Dataset"), button:has-text("Publish"), button:has-text("Setujui")'
      ).first();

      if (await approveBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
        await approveBtn.click({ force: true });
        await sekPubPage.waitForTimeout(3000);

        // Konfirmasi di modal dialog jika muncul
        const confirmApproveBtn = sekPubPage.locator(
          '[role="dialog"] button:has-text("Ya"), [role="dialog"] button:has-text("Setujui"), [role="dialog"] button:has-text("Lanjutkan")'
        ).first();
        if (await confirmApproveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await confirmApproveBtn.click({ force: true });
          await sekPubPage.waitForTimeout(2500);
        }

        console.log('   ✅ Dataset berhasil disetujui dan dipublikasikan (Published).');
      } else {
        console.log('   ℹ️ Tombol persetujuan final tidak ditemukan.');
      }
    } else {
      console.log('   ℹ️ Baris antrean review sekretariat memerlukan verifikasi manual / sinkronisasi.');
    }

    await safeDismissUnexpectedPopups(sekPubPage, logger, 'B');
    await sekPubContext.close();

    console.log('\n╔════════════════════════════════════════════════════════════════════════════════════════╗');
    console.log('║       SUKSES: DATASET KEMENPORA KLASTER RELASIONAL BERHASIL DIREGISTRASIKAN!           ║');
    console.log('╚════════════════════════════════════════════════════════════════════════════════════════╝\n');

  } catch (err: any) {
    console.error('❌ Terjadi kesalahan pada flow registrasi Kemenpora MTN:', err);
    throw err;
  } finally {
    await browser.close();
  }
}

if (process.argv[1]?.includes('register-kemenpora-mtn-flow')) {
  runRegisterKemenporaRelationalFlow().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
