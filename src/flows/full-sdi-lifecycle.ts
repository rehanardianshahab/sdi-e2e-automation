import * as path from "path";
import * as fs from "fs";
import { Page } from "playwright";
import { SdiAutomationPayload } from "../schemas/sdi-e2e.schema.js";
import { StepLogger } from "../utils/step-logger.js";
import {
  fillById,
  clickById,
  ensureCorrectPage,
  dismissUnexpectedPopups,
} from "../utils/id-helper.js";
import { safeNavigate, sanitizePayload } from "../utils/page-error-guard.js";
import { resolveInstansiContext, selectStrictInstansi } from "../utils/instansi-helper.js";

const BASE_URL = (process.env.BASE_URL || "https://fe-staging.data.go.id").replace(/\/$/, "");

/**
 * MODUL A: Pengajuan Kebutuhan Data (Perencanaan)
 * Sesuai alur resmi aplikasi: Pengisian form kebutuhan data sampai terkirim
 */
export async function runModuleA(
  page: Page,
  payload: SdiAutomationPayload,
  logger: StepLogger,
) {
  const loggedInEmail =
    process.env.USER_PENGUSUL_USERNAME ||
    process.env.USER_WALIDATA_USERNAME ||
    "exchange@test.kemensos.go.id";
  const instansiCtx = resolveInstansiContext(loggedInEmail);
  const safePayload = sanitizePayload(payload, loggedInEmail);
  const kbt = safePayload.kebutuhanData;
  const mod = "A";

  const stepNav = logger.logProgress(
    mod,
    "NAVIGATE",
    "#page-kebutuhan",
    `Navigasi ke /perencanaan/kebutuhan-data [Instansi: ${instansiCtx.loginInstansiName} ➔ Target: ${instansiCtx.targetInstansi}]`,
  );
  await safeNavigate(page, `${BASE_URL}/perencanaan/kebutuhan-data`, undefined, mod);
  await ensureCorrectPage(page, "/perencanaan/kebutuhan-data", logger, mod);
  logger.markSuccess(stepNav, "Halaman Kebutuhan Data siap");

  await clickById(
    page,
    logger,
    mod,
    '#button-kebutuhan-ajukan, button:has-text("Ajukan Kebutuhan"), a:has-text("Ajukan Kebutuhan"), button:has-text("Tambah Kebutuhan")',
    "Tombol Ajukan Kebutuhan",
    "Modal Form terbuka",
    "/perencanaan/kebutuhan-data"
  );
  await fillById(
    page,
    logger,
    mod,
    "#input-kebutuhan-form-nama-data",
    kbt.namaData,
    "Nama Kebutuhan Data",
  );

  const instansiTrigger = page.locator(
    "#button-kebutuhan-form-instansi-trigger",
  );
  if (await instansiTrigger.isVisible()) {
    await selectStrictInstansi(page, instansiCtx, logger, mod);
    await page.waitForTimeout(300);
  }

  const produsenInput = page.locator("#input-kebutuhan-form-produsen-data");
  if (await produsenInput.isVisible()) {
    await fillById(
      page,
      logger,
      mod,
      "#input-kebutuhan-form-produsen-data",
      instansiCtx.targetProdusenData || kbt.produsenData,
      `Produsen Data (${instansiCtx.targetInstansi})`,
    );
  }

  const walidataInput = page.locator("#input-kebutuhan-form-walidata");
  if (await walidataInput.isVisible()) {
    await fillById(
      page,
      logger,
      mod,
      "#input-kebutuhan-form-walidata",
      instansiCtx.targetWaliData || kbt.waliData,
      `Walidata (${instansiCtx.targetInstansi})`,
    );
  }

  await fillById(
    page,
    logger,
    mod,
    "#input-kebutuhan-form-tujuan-pengusulan",
    kbt.tujuanPengusulan,
    "Tujuan Pengusulan",
  );
  await clickById(
    page,
    logger,
    mod,
    "#button-kebutuhan-form-submit",
    "Kirim Usulan Kebutuhan",
    "Usulan Kebutuhan terkirim",
    "/perencanaan/kebutuhan-data"
  );

  // Tunggu proses penyimpanan form selesai dan popup konfirmasi/sukses tertutup
  await page.waitForTimeout(1500);
  await dismissUnexpectedPopups(page, logger, mod, "/perencanaan/kebutuhan-data");
}

/**
 * MODUL B: Verifikasi Daftar Data SSOT & Antrean Registrasi
 */
export async function runModuleB(
  page: Page,
  payload: SdiAutomationPayload,
  logger: StepLogger,
) {
  const safePayload = sanitizePayload(payload);
  const mod = "B";

  const stepNav = logger.logProgress(
    mod,
    "NAVIGATE",
    "#page-daftar-data",
    "Navigasi ke /perencanaan/daftar-data",
  );
  await safeNavigate(page, `${BASE_URL}/perencanaan/daftar-data`, undefined, mod);
  await ensureCorrectPage(page, "/perencanaan/daftar-data", logger, mod);
  logger.markSuccess(stepNav, "Daftar Data SSOT termuat");

  const stepNavReg = logger.logProgress(
    mod,
    "NAVIGATE",
    "#page-registrasi-data",
    "Navigasi ke /registrasi/data",
  );
  await safeNavigate(page, `${BASE_URL}/registrasi/data`, undefined, mod);
  await ensureCorrectPage(page, "/registrasi/data", logger, mod);
  logger.markSuccess(stepNavReg, "Antrean Registrasi Data termuat");

  const searchInput = page.locator("#input-registrasi-data-search");
  if (await searchInput.isVisible()) {
    await fillById(
      page,
      logger,
      mod,
      "#input-registrasi-data-search",
      safePayload.kebutuhanData.namaData,
      "Pencarian Dataset di Registrasi",
    );
  }
}

/**
 * MODUL C: Registrasi Dataset 3 Langkah & Review Publish SDI
 */
export async function runModuleC(
  page: Page,
  payload: SdiAutomationPayload,
  logger: StepLogger,
) {
  const mod = "C";
  const safePayload = sanitizePayload(payload);
  const ds = safePayload.registrasiDataset;

  await safeNavigate(page, `${BASE_URL}/registrasi/data`, undefined, mod);
  await ensureCorrectPage(page, "/registrasi/data", logger, mod);

  const regBtn = page.locator('#button-registrasi-data-registrasikan-0, button[title="Registrasikan Data"]').first();
  await regBtn.waitFor({ state: 'visible', timeout: 15000 });
  await clickById(
    page,
    logger,
    mod,
    '#button-registrasi-data-registrasikan-0, button[title="Registrasikan Data"]',
    "Tombol Registrasikan Dataset",
    "Masuk ke form registrasi inline",
  );
  await page.waitForTimeout(2500);

  // Step 1: Informasi Dataset
  await dismissUnexpectedPopups(page, logger, mod);
  const descInput = page
    .locator("#input-dataset-step1-deskripsi, #field-step1-deskripsi textarea")
    .first();
  if (await descInput.isVisible()) {
    await descInput.fill(ds.step1Informasi.deskripsi.slice(0, 255));
    logger.markSuccess(
      logger.logProgress(
        mod,
        "FILL_INPUT",
        "#field-step1-deskripsi",
        "Mengisi Deskripsi Dataset",
      ),
      "Deskripsi terisi",
    );
  }

  const nextBtn = page
    .locator('#button-dataset-next-step, button:has-text("Lanjut Langkah 2")')
    .first();
  if (await nextBtn.isVisible()) {
    await nextBtn.click();
    logger.markSuccess(
      logger.logProgress(
        mod,
        "CLICK_BUTTON",
        "#button-dataset-next-step",
        "Lanjut Langkah 2",
      ),
      "Draft Step 1 tersimpan",
    );
  }

  // Step 2: Entitas Data
  await page.waitForTimeout(500);
  await dismissUnexpectedPopups(page, logger, mod);
  const addEntitasBtn = page
    .locator(
      '#button-dataset-step2-tambah-entitas, button:has-text("Tambah Entitas")',
    )
    .first();
  if (await addEntitasBtn.isVisible()) {
    await addEntitasBtn.click();
    const entModal = page.locator('[role="dialog"]');
    if (await entModal.isVisible()) {
      await entModal
        .locator("input")
        .first()
        .fill(ds.step2Entitas[0].namaEntitas);
      await entModal
        .locator("textarea")
        .first()
        .fill(ds.step2Entitas[0].definisi);
      await entModal
        .locator('button:has-text("Tambah Entitas"), button:has-text("Simpan")')
        .first()
        .click();
      logger.markSuccess(
        logger.logProgress(
          mod,
          "CLICK_BUTTON",
          "#button-save-entitas",
          "Simpan Entitas",
        ),
        "Entitas berhasil disimpan",
      );
    }
  }

  const nextBtn2 = page
    .locator('#button-dataset-next-step, button:has-text("Lanjut Langkah 3")')
    .first();
  if (await nextBtn2.isVisible()) {
    await nextBtn2.click();
    logger.markSuccess(
      logger.logProgress(
        mod,
        "CLICK_BUTTON",
        "#button-dataset-next-step",
        "Lanjut Langkah 3",
      ),
      "Entitas tersimpan ➔ Masuk Langkah 3",
    );
  }

  // Step 3: Kamus Data
  await page.waitForTimeout(500);
  await dismissUnexpectedPopups(page, logger, mod);
  const addElemBtn = page
    .locator(
      '#button-dataset-step3-tambah-elemen, button:has-text("Tambah Elemen")',
    )
    .first();
  if (await addElemBtn.isVisible()) {
    await addElemBtn.click();
    const elemModal = page.locator('[role="dialog"]');
    if (await elemModal.isVisible()) {
      await elemModal
        .locator("input")
        .first()
        .fill(ds.step3KamusData[0].namaElemen);
      await elemModal
        .locator("textarea")
        .first()
        .fill(ds.step3KamusData[0].definisi);
      await elemModal
        .locator('button:has-text("Tambah Elemen"), button:has-text("Simpan")')
        .first()
        .click();
      logger.markSuccess(
        logger.logProgress(
          mod,
          "CLICK_BUTTON",
          "#button-save-elemen",
          "Simpan Elemen Kamus Data",
        ),
        "Elemen berhasil disimpan",
      );
    }
  }

  const submitBtn = page
    .locator(
      '#button-dataset-open-confirm-submit, button:has-text("Kirimkan Registrasi Dataset")',
    )
    .first();
  if (await submitBtn.isVisible()) {
    await submitBtn.click();
    const confirmModal = page.locator('[role="dialog"]');
    if (await confirmModal.isVisible()) {
      const checkbox = confirmModal.locator('input[type="checkbox"]').first();
      if (await checkbox.isVisible()) await checkbox.check();
      const finalSubmit = confirmModal
        .locator('button:has-text("Setujui & Kirim"), button:has-text("Kirim")')
        .first();
      if (await finalSubmit.isVisible()) await finalSubmit.click();
      logger.markSuccess(
        logger.logProgress(
          mod,
          "CLICK_BUTTON",
          "#button-dataset-confirm-submit",
          "Submit Registrasi Dataset",
        ),
        "Registrasi Dataset berhasil diajukan",
      );
    }
  }
}

/**
 * MODUL D: Registrasi Layanan Interoperabilitas (LID)
 */
export async function runModuleD(
  page: Page,
  payload: SdiAutomationPayload,
  logger: StepLogger,
) {
  const mod = "D";
  const safePayload = sanitizePayload(payload);
  const lid = safePayload.registrasiLayananLID;

  const stepNav = logger.logProgress(
    mod,
    "NAVIGATE",
    "#page-registrasi-layanan",
    "Navigasi ke /registrasi/layanan",
  );
  await safeNavigate(page, `${BASE_URL}/registrasi/layanan`, undefined, mod);
  await ensureCorrectPage(page, "/registrasi/layanan", logger, mod);
  logger.markSuccess(stepNav, "Halaman Registrasi Layanan termuat");

  const addLayananBtn = page
    .locator('#button-layanan-tambah, button:has-text("Tambah Layanan")')
    .first();
  if (await addLayananBtn.isVisible()) {
    await addLayananBtn.click();
    await fillById(
      page,
      logger,
      mod,
      "#input-layanan-form-title",
      lid.apiTitle,
      "Nama Layanan (API Title)",
    );
    await fillById(
      page,
      logger,
      mod,
      "#input-layanan-form-name",
      lid.apiName,
      "Slug Layanan (apiName)",
    );
    await fillById(
      page,
      logger,
      mod,
      "#input-layanan-form-desc",
      lid.apiDesc.slice(0, 255),
      "Deskripsi Layanan",
    );
    await fillById(
      page,
      logger,
      mod,
      "#input-layanan-form-endpoint",
      lid.endpointUrl,
      "Endpoint URL",
    );

    const submitLidBtn = page
      .locator(
        '#button-layanan-form-submit, button:has-text("Daftarkan Layanan"), button:has-text("Simpan")',
      )
      .first();
    if (await submitLidBtn.isVisible()) {
      await submitLidBtn.click();
      logger.markSuccess(
        logger.logProgress(
          mod,
          "CLICK_BUTTON",
          "#button-layanan-form-submit",
          "Daftarkan Layanan LID",
        ),
        "Layanan LID berhasil diajukan",
      );
    }
  }
}

/**
 * MODUL E: Permohonan Akses Data (LID)
 * Termasuk Upload File Surat Permohonan Resmi (.pdf)
 */
export async function runModuleE(
  page: Page,
  payload: SdiAutomationPayload,
  logger: StepLogger,
) {
  const mod = "E";
  const safePayload = sanitizePayload(payload);
  const aks = safePayload.pengajuanAksesLID;

  const stepNav = logger.logProgress(
    mod,
    "NAVIGATE",
    "#page-pengajuan-akses",
    "Navigasi ke /pengajuan-akses/tambah",
  );
  await safeNavigate(page, `${BASE_URL}/pengajuan-akses/tambah`, undefined, mod);
  await ensureCorrectPage(page, "/pengajuan-akses/tambah", logger, mod);
  logger.markSuccess(stepNav, "Halaman Pengajuan Akses termuat");

  const typeBtn = page
    .locator(
      '#button-pengajuan-form-type-terbatas, button:has-text("Terbatas")',
    )
    .first();
  if (await typeBtn.isVisible()) await typeBtn.click();

  const peranBtn = page.locator("#button-pengajuan-form-peran-0").first();
  if (await peranBtn.isVisible()) await peranBtn.click();

  const sistemInput = page.locator("#input-pengajuan-form-nama-sistem");
  if (await sistemInput.isVisible()) {
    await fillById(
      page,
      logger,
      mod,
      "#input-pengajuan-form-nama-sistem",
      aks.namaSistem,
      "Nama Sistem Pemohon",
    );
  }

  const tujuanInput = page.locator("#input-pengajuan-form-tujuan");
  if (await tujuanInput.isVisible()) {
    await fillById(
      page,
      logger,
      mod,
      "#input-pengajuan-form-tujuan",
      aks.tujuanPenggunaan,
      "Tujuan Penggunaan",
    );
  }

  // Upload File Surat Permohonan (.pdf)
  const fixturePdfPath = path.resolve(
    process.cwd(),
    "fixtures/surat-permohonan-dummy.pdf",
  );
  if (!fs.existsSync(fixturePdfPath)) {
    fs.mkdirSync(path.dirname(fixturePdfPath), { recursive: true });
    fs.writeFileSync(
      fixturePdfPath,
      "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\ntrailer\n<< /Size 2 /Root 1 0 R >>\n%%EOF",
    );
  }

  const uploadInput = page
    .locator('#input-pengajuan-form-file-upload, input[type="file"]')
    .first();
  if (await uploadInput.isVisible()) {
    await uploadInput.setInputFiles(fixturePdfPath);
    logger.markSuccess(
      logger.logProgress(
        mod,
        "UPLOAD_FILE",
        "#input-pengajuan-form-file-upload",
        "Upload Dokumen Surat Permohonan (PDF)",
      ),
      "File PDF berhasil diunggah",
    );
  }

  const submitAksesBtn = page
    .locator(
      '#button-pengajuan-form-submit, button:has-text("Kirim Pengajuan")',
    )
    .first();
  if (await submitAksesBtn.isVisible()) {
    await submitAksesBtn.scrollIntoViewIfNeeded().catch(() => {});
    await submitAksesBtn.click({ force: true });
    logger.markSuccess(
      logger.logProgress(
        mod,
        "CLICK_BUTTON",
        "#button-pengajuan-form-submit",
        "Kirim Pengajuan Akses Data",
      ),
      "Permohonan Akses Data berhasil diajukan (LID Selesai)",
    );
    await page.waitForTimeout(1500);
  }
}
