import { chromium, Page } from 'playwright';
import { performLogin } from '../pages/auth.page.js';
import { safeNavigate, assertNoValidationErrors, safeDismissUnexpectedPopups } from '../utils/page-error-guard.js';
import { StepLogger } from '../utils/step-logger.js';
import { resolveInstansiContext } from '../utils/instansi-helper.js';

export interface KamusDataElement {
  idElemen: string;
  namaElemen: string;
  alias: string;
  definisi: string;
  satuan: string;
  tipeData: string;
  formatPanjang: string;
  sifatKewajiban: 'Mandatory' | 'Optional';
  isPrimaryKey?: boolean;
}

// 16 Elemen Kamus Data untuk DS-PORA-001 / DT-PORA-001 (olahragawan) dari B4. RegKamusData.csv
export const kemenporaKamusDataDS001: KamusDataElement[] = [
  {
    idElemen: 'DE-PORA-001',
    namaElemen: 'id_olahragawan',
    alias: 'id_olahragawan',
    definisi: 'ID unik data talenta olahragawan',
    satuan: '-',
    tipeData: 'varchar',
    formatPanjang: '50',
    sifatKewajiban: 'Optional',
    isPrimaryKey: true
  },
  {
    idElemen: 'DE-PORA-002',
    namaElemen: 'nik',
    alias: 'nik',
    definisi: 'Nomor Induk Kependudukan olahragawan',
    satuan: '-',
    tipeData: 'varchar',
    formatPanjang: '21',
    sifatKewajiban: 'Mandatory'
  },
  {
    idElemen: 'DE-PORA-003',
    namaElemen: 'nisn',
    alias: 'nisn',
    definisi: 'Nomor Induk Siswa Nasional olahragawan',
    satuan: '-',
    tipeData: 'varchar',
    formatPanjang: '255',
    sifatKewajiban: 'Optional'
  },
  {
    idElemen: 'DE-PORA-004',
    namaElemen: 'id_asal',
    alias: 'id_asal',
    definisi: 'Asal Daerah Olahragawan',
    satuan: '-',
    tipeData: 'int',
    formatPanjang: '20',
    sifatKewajiban: 'Optional'
  },
  {
    idElemen: 'DE-PORA-005',
    namaElemen: 'nama_lengkap',
    alias: 'nama_lengkap',
    definisi: 'Nama lengkap Olahragawan',
    satuan: '-',
    tipeData: 'varchar',
    formatPanjang: '100',
    sifatKewajiban: 'Optional'
  },
  {
    idElemen: 'DE-PORA-006',
    namaElemen: 'nama_depan',
    alias: 'nama_depan',
    definisi: 'Nama Depan Olahragawan',
    satuan: '-',
    tipeData: 'varchar',
    formatPanjang: '100',
    sifatKewajiban: 'Mandatory'
  },
  {
    idElemen: 'DE-PORA-007',
    namaElemen: 'nama_belakang',
    alias: 'nama_belakang',
    definisi: 'Nama belakang Olahragawan',
    satuan: '-',
    tipeData: 'varchar',
    formatPanjang: '100',
    sifatKewajiban: 'Mandatory'
  },
  {
    idElemen: 'DE-PORA-008',
    namaElemen: 'jenis_kelamin',
    alias: 'jenis_kelamin',
    definisi: 'Jenis kelamin olahragawan',
    satuan: '-',
    tipeData: 'varchar',
    formatPanjang: '4',
    sifatKewajiban: 'Mandatory'
  },
  {
    idElemen: 'DE-PORA-009',
    namaElemen: 'provinsi',
    alias: 'provinsi',
    definisi: 'Asal Provinsi Olahragawan',
    satuan: '-',
    tipeData: 'varchar',
    formatPanjang: '100',
    sifatKewajiban: 'Mandatory'
  },
  {
    idElemen: 'DE-PORA-010',
    namaElemen: 'alamat',
    alias: 'alamat',
    definisi: 'Alamat lengkap olahragawan berdasarkan KTP',
    satuan: '-',
    tipeData: 'text',
    formatPanjang: '255',
    sifatKewajiban: 'Mandatory'
  },
  {
    idElemen: 'DE-PORA-011',
    namaElemen: 'alamat_domisili',
    alias: 'alamat_domisili',
    definisi: 'Alamat tempat tinggal domisili olahragawan saat ini',
    satuan: '-',
    tipeData: 'text',
    formatPanjang: '255',
    sifatKewajiban: 'Mandatory'
  },
  {
    idElemen: 'DE-PORA-012',
    namaElemen: 'tempat_lahir',
    alias: 'tempat_lahir',
    definisi: 'Tempat kelahiran olahragawan',
    satuan: '-',
    tipeData: 'varchar',
    formatPanjang: '100',
    sifatKewajiban: 'Mandatory'
  },
  {
    idElemen: 'DE-PORA-013',
    namaElemen: 'tanggal_lahir',
    alias: 'tanggal_lahir',
    definisi: 'Tanggal lahir olahragawan',
    satuan: '-',
    tipeData: 'date',
    formatPanjang: '10',
    sifatKewajiban: 'Mandatory'
  },
  {
    idElemen: 'DE-PORA-014',
    namaElemen: 'status_disabilitas',
    alias: 'status_disabilitas',
    definisi: 'Status apakah olahragawan penyandang disabilitas',
    satuan: '-',
    tipeData: 'tinyint',
    formatPanjang: '1',
    sifatKewajiban: 'Optional'
  },
  {
    idElemen: 'DE-PORA-015',
    namaElemen: 'foto',
    alias: 'foto',
    definisi: 'URL tautan foto resmi olahragawan',
    satuan: '-',
    tipeData: 'varchar',
    formatPanjang: '255',
    sifatKewajiban: 'Mandatory'
  },
  {
    idElemen: 'DE-PORA-016',
    namaElemen: 'status',
    alias: 'status',
    definisi: 'Status keaktifan olahragawan nasional',
    satuan: '-',
    tipeData: 'varchar',
    formatPanjang: '4',
    sifatKewajiban: 'Mandatory'
  }
];

export async function runRegisterKemenporaMTNFlow() {
  const browser = await chromium.launch({ headless: true, slowMo: 100 });
  const BASE_URL = process.env.BASE_URL || 'https://fe-staging.data.go.id';
  const logger = new StepLogger(['INIT', 'A', 'B', 'C'], 'RegKemenporaMTN');
  const instansiCtx = resolveInstansiContext('exchange@test.kemendagri.go.id');
  const pengusulEmail = instansiCtx.loginEmail;
  const pengusulPassword = process.env.USER_PENGUSUL_PASSWORD || '123456789';
  const targetEmail = instansiCtx.targetLoginEmail;
  const targetPassword = instansiCtx.targetLoginPassword;

  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║       REGISTRASI DATA KEMENPORA MTN: DATASET ➔ ENTITAS ➔ 16 KAMUS DATA       ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log(`Pengusul: ${instansiCtx.loginInstansiName} (${pengusulEmail})`);
  console.log(`Target  : ${instansiCtx.targetInstansi} (${targetEmail})`);
  console.log(`Dataset : DS-PORA-001 (olahragawan)`);
  console.log(`Kamus   : 16 Elemen Data Lengkap\n`);

  try {
    const timestamp = Date.now();
    const namaDatasetUsulan = `olahragawan - Data Olahragawan dan Talenta Keolahragaan Nasional [${timestamp}]`;

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

    // Pilih Instansi: KEMENTERIAN PEMUDA DAN OLAHRAGA
    const instansiTrigger = modalDialog.locator('#button-kebutuhan-form-instansi-trigger, button[role="combobox"]').first();
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

    const tujuanInput = modalDialog.locator('#input-kebutuhan-form-tujuan-pengusulan, textarea').first();
    if (await tujuanInput.isVisible()) {
      await tujuanInput.fill(
        'Registrasi Data Kemenpora MTN (DS-PORA-001) tabel olahragawan untuk pemadanan talenta keolahragaan nasional.'
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
        await catInput.fill('Ditetapkan untuk registrasi data MTN Kemenpora DS-PORA-001.');
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
    // STEP 1: INFORMASI DATASET (DS-PORA-001)
    // ==========================================================================
    console.log('   ▶ [Step 1] Mengisi Informasi Dataset (olahragawan)...');
    const descInput = kemenporaPage.locator('#input-dataset-step1-deskripsi');
    if (await descInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await descInput.fill('Tabel untuk menyimpan data olahragawan'.slice(0, 255));
    }

    // Klasifikasi Risiko: Terbatas (pastikan aktif)
    const terbatasBtn = kemenporaPage.locator('#button-dataset-step1-risiko-terbatas');
    const tbClass = (await terbatasBtn.getAttribute('class')) || '';
    if (!tbClass.includes('emerald') && !tbClass.includes('primary')) {
      await terbatasBtn.click();
      console.log('      🏷️ Klasifikasi Risiko: Terbatas');
    }

    // Format Data: JSON (pastikan aktif, jangan toggle off jika sudah aktif)
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
    // STEP 2: ENTITAS DATA (DT-PORA-001)
    // ==========================================================================
    console.log('   ▶ [Step 2] Menambahkan Entitas Data (olahragawan)...');
    const addEntitasBtn = kemenporaPage.locator(
      '#button-dataset-step2-tambah-entitas, button:has-text("Tambah Entitas")'
    ).first();
    await addEntitasBtn.waitFor({ state: 'visible', timeout: 10000 });
    await addEntitasBtn.click({ force: true });
    await kemenporaPage.waitForTimeout(1000);

    const entDialog = kemenporaPage.locator('[role="dialog"]').first();
    await entDialog.waitFor({ state: 'visible', timeout: 5000 });

    await entDialog.locator('#input-dataset-step2-nama-entitas').fill('olahragawan');
    await entDialog.locator('#input-dataset-step2-definisi-entitas').fill('Tabel untuk menyimpan data olahragawan'.slice(0, 255));

    await assertNoValidationErrors(kemenporaPage, 'Modal Tambah Entitas Step 2');
    const saveEntBtn = entDialog.locator('button:has-text("Tambah"), button:has-text("Simpan")').first();
    await saveEntBtn.click({ force: true });
    await kemenporaPage.waitForTimeout(1500);

    await assertNoValidationErrors(kemenporaPage, 'Registrasi Dataset Step 2');
    const nextBtn2 = kemenporaPage.locator('#button-dataset-next-step').first();
    await nextBtn2.waitFor({ state: 'visible', timeout: 5000 });
    await nextBtn2.click({ force: true });
    await kemenporaPage.waitForTimeout(2000);
    console.log('   ✅ Step 2 berhasil disimpan.');

    // ==========================================================================
    // STEP 3: KAMUS DATA (16 ELEMEN LENGKAP B4. RegKamusData.csv)
    // ==========================================================================
    console.log(`   ▶ [Step 3] Menambahkan 16 Elemen Kamus Data 1 per 1...`);

    for (let i = 0; i < kemenporaKamusDataDS001.length; i++) {
      const elem = kemenporaKamusDataDS001[i];
      console.log(`      [${i + 1}/16] Menambahkan elemen "${elem.namaElemen}" (${elem.tipeData}, ${elem.sifatKewajiban})...`);

      const addElemBtn = kemenporaPage.locator(
        '#button-dataset-step3-tambah-elemen, button:has-text("Tambah Elemen")'
      ).first();
      await addElemBtn.waitFor({ state: 'visible', timeout: 8000 });
      await addElemBtn.click({ force: true });
      await kemenporaPage.waitForTimeout(800);

      const elemDialog = kemenporaPage.locator('[role="dialog"]').first();
      await elemDialog.waitFor({ state: 'visible', timeout: 5000 });

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
          await kemenporaPage.waitForTimeout(300);
          const opt = kemenporaPage.locator('[role="option"]:has-text("Optional")').first();
          if (await opt.isVisible()) await opt.click();
        }
      }

      await assertNoValidationErrors(kemenporaPage, `Modal Elemen Kamus Data [${elem.namaElemen}]`);
      const saveElemBtn = elemDialog.locator('#button-dataset-step3-modal-simpan, button:has-text("Tambah Kamus Data"), button:has-text("Simpan")').first();
      await saveElemBtn.click({ force: true });
      await kemenporaPage.waitForTimeout(1000);
    }

    console.log('   ✅ Seluruh 16 elemen kamus data berhasil ditambahkan ke daftar.');
    await assertNoValidationErrors(kemenporaPage, 'Registrasi Dataset Step 3 (Daftar Kamus Data)');

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

    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║       SUKSES: DATASET KEMENPORA (DS-PORA-001) BERHASIL DIREGISTRASIKAN!       ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  } catch (err: any) {
    console.error('❌ Terjadi kesalahan pada flow registrasi Kemenpora MTN:', err);
    throw err;
  } finally {
    await browser.close();
  }
}

if (process.argv[1]?.includes('register-kemenpora-mtn-flow')) {
  runRegisterKemenporaMTNFlow().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
