import { Page } from 'playwright';
import { StepLogger, ModuleCode } from './step-logger.js';

/**
 * Helper untuk menentukan pemetaan instansi pengusul dan instansi target.
 * ATURAN UTAMA:
 * Pasangan akun utama di staging:
 * 1. Pengusul: Kementerian Dalam Negeri (Kemendagri) - exchange@test.kemendagri.go.id (instansiId: 36)
 * 2. Target Instansi (Walidata / Produsen): Kementerian Pemuda dan Olahraga (Kemenpora) - exchange.kemenpora@test.kemenpora.go.id (instansiId: 55)
 *
 * Pemetaan pasangan:
 * - Jika pengusul adalah Kemendagri, maka target WAJIB Kemenpora.
 * - Jika pengusul adalah Kemenpora, maka target WAJIB Kemendagri.
 */

export interface InstansiContext {
  loginEmail: string;
  loginInstansiName: string;
  loginInstansiId: number;
  targetInstansi: string;
  targetInstansiId: number;
  targetKeywords: string[];
  targetProdusenData: string;
  targetWaliData: string;
  defaultTopic: string;
  targetLoginEmail: string;
  targetLoginPassword: string;
}

export const ALLOWED_INSTANSI = {
  KEMENDAGRI: {
    id: 36,
    name: 'Kementerian Dalam Negeri (Kemendagri)',
    targetName: 'KEMENTERIAN DALAM NEGERI',
    email: 'exchange@test.kemendagri.go.id',
    password: process.env.USER_PENGUSUL_PASSWORD || '123456789',
    keywords: ['Kementerian Dalam Negeri', 'Kemendagri', 'KEMENDAGRI', 'Dalam Negeri'],
    produsenData: 'Direktorat Jenderal Kependudukan dan Pencatatan Sipil',
    waliData: 'Pusat Data dan Informasi Kemendagri',
    topic: 'Data Terpadu Kependudukan dan Identitas Wilayah Kemendagri untuk Sinkronisasi Kepemudaan Nasional'
  },
  KEMENPORA: {
    id: 55,
    name: 'Kementerian Pemuda dan Olahraga (Kemenpora)',
    targetName: 'KEMENTERIAN PEMUDA DAN OLAHRAGA',
    email: 'exchange.kemenpora@test.kemenpora.go.id',
    password: process.env.USER_WALIDATA_PASSWORD || '123456789',
    keywords: ['Kementerian Pemuda dan Olahraga', 'PEMUDA DAN OLAHRAGA', 'Kemenpora', 'KEMENPORA', 'Pemuda'],
    produsenData: 'Deputi Bidang Pengembangan Pemuda dan Pemberdayaan Olahraga',
    waliData: 'Pusat Data dan Sistem Informasi Kemenpora (Pusdatin Kemenpora)',
    topic: 'Data Terpadu Kepemudaan, Prestasi Olahraga Daerah, dan Indeks Pembangunan Pemuda Nasional'
  }
} as const;

export function resolveInstansiContext(userEmail?: string): InstansiContext {
  const email = (
    userEmail ||
    process.env.USER_PENGUSUL_USERNAME ||
    ALLOWED_INSTANSI.KEMENDAGRI.email
  ).toLowerCase();

  const isKemenpora = email.includes('kemenpora') || email.includes('pemuda');

  if (isKemenpora) {
    // Pengusul: Kemenpora -> Target WAJIB: Kemendagri
    return {
      loginEmail: email,
      loginInstansiName: ALLOWED_INSTANSI.KEMENPORA.name,
      loginInstansiId: ALLOWED_INSTANSI.KEMENPORA.id,
      targetInstansi: ALLOWED_INSTANSI.KEMENDAGRI.targetName,
      targetInstansiId: ALLOWED_INSTANSI.KEMENDAGRI.id,
      targetKeywords: [...ALLOWED_INSTANSI.KEMENDAGRI.keywords],
      targetProdusenData: ALLOWED_INSTANSI.KEMENDAGRI.produsenData,
      targetWaliData: ALLOWED_INSTANSI.KEMENDAGRI.waliData,
      defaultTopic: ALLOWED_INSTANSI.KEMENDAGRI.topic,
      targetLoginEmail: ALLOWED_INSTANSI.KEMENDAGRI.email,
      targetLoginPassword: ALLOWED_INSTANSI.KEMENDAGRI.password
    };
  } else {
    // Pengusul: Kemendagri -> Target WAJIB: Kemenpora
    return {
      loginEmail: email,
      loginInstansiName: ALLOWED_INSTANSI.KEMENDAGRI.name,
      loginInstansiId: ALLOWED_INSTANSI.KEMENDAGRI.id,
      targetInstansi: ALLOWED_INSTANSI.KEMENPORA.targetName,
      targetInstansiId: ALLOWED_INSTANSI.KEMENPORA.id,
      targetKeywords: [...ALLOWED_INSTANSI.KEMENPORA.keywords],
      targetProdusenData: ALLOWED_INSTANSI.KEMENPORA.produsenData,
      targetWaliData: ALLOWED_INSTANSI.KEMENPORA.waliData,
      defaultTopic: ALLOWED_INSTANSI.KEMENPORA.topic,
      targetLoginEmail: ALLOWED_INSTANSI.KEMENPORA.email,
      targetLoginPassword: ALLOWED_INSTANSI.KEMENPORA.password
    };
  }
}

/**
 * Memilih instansi target secara KETAT di dropdown SDI.
 * Menjamin selalu memilih instansi target yang sesuai (Kemenpora / Kemendagri).
 */
export async function selectStrictInstansi(
  page: Page,
  instansiCtx: InstansiContext,
  logger?: StepLogger,
  mod: ModuleCode = 'A'
): Promise<boolean> {
  const trigger = page.locator('#button-kebutuhan-form-instansi-trigger');
  await trigger.waitFor({ state: 'visible', timeout: 10000 });

  const currentText = (await trigger.innerText().catch(() => '')).trim();
  // Cek apakah sudah terpilih instansi target yang sah
  if (
    instansiCtx.targetKeywords.some((kw) =>
      currentText.toUpperCase().includes(kw.toUpperCase())
    )
  ) {
    if (logger) {
      logger.markSuccess(
        logger.logProgress(mod, 'SELECT_OPTION', '#button-kebutuhan-form-instansi-trigger', `Instansi Target: ${currentText}`),
        `Instansi ${currentText} sudah sesuai kriteria`
      );
    }
    return true;
  }

  // Buka dropdown
  await trigger.click();
  await page.waitForTimeout(1000);

  const searchInput = page.locator('#input-kebutuhan-form-instansi-search, input[placeholder*="Cari" i]').first();
  const isSearchAvailable = await searchInput.isVisible({ timeout: 2500 }).catch(() => false);

  let optionFound = false;
  let selectedOptionText = '';

  if (isSearchAvailable) {
    const searchTerms = [
      'PEMUDA DAN OLAHRAGA',
      instansiCtx.targetInstansi,
      ...instansiCtx.targetKeywords
    ];
    // Ambil distinct terms
    const distinctTerms = Array.from(new Set(searchTerms)).filter(Boolean);

    for (const term of distinctTerms) {
      if (optionFound) break;
      await searchInput.fill('');
      await page.waitForTimeout(300);
      await searchInput.fill(term);
      await searchInput.dispatchEvent('input').catch(() => {});

      // Tunggu 1 - 2 detik setelah mengetik sesuai kebutuhan debounce & pencarian portal
      await page.waitForTimeout(2000);

      // Cek langsung locator opsi target yang cocok
      const targetOption = page
        .locator('[role="option"], [id^="button-kebutuhan-form-instansi-item-"]')
        .filter({
          hasText: new RegExp(
            instansiCtx.targetKeywords.join('|') || instansiCtx.targetInstansi,
            'i'
          )
        })
        .first();

      if (await targetOption.isVisible({ timeout: 2500 }).catch(() => false)) {
        selectedOptionText = (await targetOption.innerText().catch(() => '')).trim();
        await targetOption.scrollIntoViewIfNeeded().catch(() => {});
        await targetOption.click({ force: true });
        optionFound = true;
        break;
      }

      const options = page.locator('[role="option"], [id^="button-kebutuhan-form-instansi-item-"]');
      const count = await options.count().catch(() => 0);

      for (let i = 0; i < count; i++) {
        const opt = options.nth(i);
        const optText = (await opt.innerText().catch(() => '')).trim();

        const matchesTarget =
          instansiCtx.targetKeywords.some((k) =>
            optText.toUpperCase().includes(k.toUpperCase())
          ) || optText.toUpperCase().includes(instansiCtx.targetInstansi.toUpperCase());

        if (matchesTarget) {
          await opt.scrollIntoViewIfNeeded().catch(() => {});
          await opt.click({ force: true });
          optionFound = true;
          selectedOptionText = optText;
          break;
        }
      }
    }
  } else {
    // Dropdown tanpa search input: cari langsung di list opsi
    await page.waitForTimeout(1500);
    const targetOption = page
      .locator('[role="option"], [id^="button-kebutuhan-form-instansi-item-"]')
      .filter({
        hasText: new RegExp(
          instansiCtx.targetKeywords.join('|') || instansiCtx.targetInstansi,
          'i'
        )
      })
      .first();

    if (await targetOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      selectedOptionText = (await targetOption.innerText().catch(() => '')).trim();
      await targetOption.scrollIntoViewIfNeeded().catch(() => {});
      await targetOption.click({ force: true });
      optionFound = true;
    } else {
      const options = page.locator('[role="option"], [id^="button-kebutuhan-form-instansi-item-"]');
      const count = await options.count().catch(() => 0);
      for (let i = 0; i < count; i++) {
        const opt = options.nth(i);
        const optText = (await opt.innerText().catch(() => '')).trim();

        const matchesTarget = instansiCtx.targetKeywords.some((k) =>
          optText.toUpperCase().includes(k.toUpperCase())
        );

        if (matchesTarget) {
          await opt.scrollIntoViewIfNeeded().catch(() => {});
          await opt.click({ force: true });
          optionFound = true;
          selectedOptionText = optText;
          break;
        }
      }
    }
  }

  if (!optionFound) {
    throw new Error(
      `[CRITICAL INSTANSI GUARD] Tidak ditemukan opsi untuk "${instansiCtx.targetInstansi}". ` +
      `Pastikan opsi "${instansiCtx.targetInstansi}" tersedia di dropdown!`
    );
  }

  await page.waitForTimeout(1000);

  // Verifikasi akhir
  const verifiedText = (await trigger.innerText().catch(() => '')).trim();
  const isVerified =
    instansiCtx.targetKeywords.some((kw) =>
      verifiedText.toUpperCase().includes(kw.toUpperCase())
    ) || verifiedText.toUpperCase().includes(instansiCtx.targetInstansi.toUpperCase());

  if (!isVerified) {
    throw new Error(
      `[CRITICAL INSTANSI GUARD] Instansi yang terpasang "${verifiedText}" BUKAN target valid ("${instansiCtx.targetInstansi}").`
    );
  }

  if (logger) {
    logger.markSuccess(
      logger.logProgress(
        mod,
        'CLICK_BUTTON',
        '#button-kebutuhan-form-instansi-item-target',
        `Pilih Instansi Target: ${selectedOptionText || verifiedText}`
      ),
      `Instansi Target terpilih: ${verifiedText}`
    );
  }

  return true;
}
