import { Page } from 'playwright';
import { StepLogger, ModuleCode } from './step-logger.js';

/**
 * Helper untuk menentukan pemetaan instansi pengusul dan instansi target.
 * ATURAN MUTLAK:
 * Hanya dua instansi yang memiliki akun di staging:
 * 1. Kementerian Sosial (Kemensos) - exchange@test.kemensos.go.id
 * 2. Kementerian Dalam Negeri (Kemendagri) - exchange@test.kemendagri.go.id
 *
 * Pemetaan pasangan:
 * - Jika pengusul adalah Kemensos, maka target WAJIB Kemendagri.
 * - Jika pengusul adalah Kemendagri, maka target WAJIB Kemensos.
 * - DILARANG KERAS memilih atau menggunakan instansi selain keduanya!
 */

export interface InstansiContext {
  loginEmail: string;
  loginInstansiName: string;
  targetInstansi: string;
  targetKeywords: string[];
  targetProdusenData: string;
  targetWaliData: string;
  defaultTopic: string;
  targetLoginEmail: string;
  targetLoginPassword: string;
}

export const ALLOWED_INSTANSI = {
  KEMENSOS: {
    name: 'Kementerian Sosial (Kemensos)',
    targetName: 'KEMENTERIAN SOSIAL',
    email: 'exchange@test.kemensos.go.id',
    password: process.env.USER_PENGUSUL_PASSWORD || '123456789',
    keywords: ['Kementerian Sosial', 'Kemensos', 'KEMENSOS', 'Sosial'],
    produsenData: 'Direktorat Jenderal Pemberdayaan Sosial',
    waliData: 'Pusat Data dan Informasi Kesejahteraan Sosial (Pusdatin Kesos)',
    topic: 'Data Terpadu Kesejahteraan Sosial (DTKS) Kemensos untuk Sinkronisasi Bantuan Daerah'
  },
  KEMENDAGRI: {
    name: 'Kementerian Dalam Negeri (Kemendagri)',
    targetName: 'KEMENTERIAN DALAM NEGERI',
    email: 'exchange@test.kemendagri.go.id',
    password: process.env.USER_WALIDATA_PASSWORD || '123456789',
    keywords: ['Kementerian Dalam Negeri', 'Kemendagri', 'KEMENDAGRI', 'Dalam Negeri'],
    produsenData: 'Direktorat Jenderal Kependudukan dan Pencatatan Sipil',
    waliData: 'Pusat Data dan Informasi Kemendagri',
    topic: 'Data Terpadu Kependudukan dan Identitas Wilayah Kemendagri untuk Validasi Penerima Manfaat'
  }
} as const;

export function resolveInstansiContext(userEmail?: string): InstansiContext {
  const email = (
    userEmail ||
    process.env.USER_PENGUSUL_USERNAME ||
    ALLOWED_INSTANSI.KEMENSOS.email
  ).toLowerCase();

  const isKemensos = email.includes('kemensos') || email.includes('sosial');

  if (isKemensos) {
    // Pengusul: Kemensos -> Target WAJIB: Kemendagri
    return {
      loginEmail: email,
      loginInstansiName: ALLOWED_INSTANSI.KEMENSOS.name,
      targetInstansi: ALLOWED_INSTANSI.KEMENDAGRI.targetName,
      targetKeywords: [...ALLOWED_INSTANSI.KEMENDAGRI.keywords],
      targetProdusenData: ALLOWED_INSTANSI.KEMENDAGRI.produsenData,
      targetWaliData: ALLOWED_INSTANSI.KEMENDAGRI.waliData,
      defaultTopic: ALLOWED_INSTANSI.KEMENDAGRI.topic,
      targetLoginEmail: ALLOWED_INSTANSI.KEMENDAGRI.email,
      targetLoginPassword: ALLOWED_INSTANSI.KEMENDAGRI.password
    };
  } else {
    // Pengusul: Kemendagri -> Target WAJIB: Kemensos
    return {
      loginEmail: email,
      loginInstansiName: ALLOWED_INSTANSI.KEMENDAGRI.name,
      targetInstansi: ALLOWED_INSTANSI.KEMENSOS.targetName,
      targetKeywords: [...ALLOWED_INSTANSI.KEMENSOS.keywords],
      targetProdusenData: ALLOWED_INSTANSI.KEMENSOS.produsenData,
      targetWaliData: ALLOWED_INSTANSI.KEMENSOS.waliData,
      defaultTopic: ALLOWED_INSTANSI.KEMENSOS.topic,
      targetLoginEmail: ALLOWED_INSTANSI.KEMENSOS.email,
      targetLoginPassword: ALLOWED_INSTANSI.KEMENSOS.password
    };
  }
}

/**
 * Memilih instansi target secara KETAT di dropdown SDI.
 * Menjamin tidak pernah memilih instansi lain selain Kemensos dan Kemendagri.
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
  await page.waitForTimeout(500);

  const searchInput = page.locator('#input-kebutuhan-form-instansi-search');
  const isSearchAvailable = await searchInput.isVisible({ timeout: 2500 }).catch(() => false);

  let optionFound = false;
  let selectedOptionText = '';

  if (isSearchAvailable) {
    // Coba keyword spesifik
    const searchTerms = [
      instansiCtx.targetInstansi,
      instansiCtx.targetKeywords[0],
      instansiCtx.targetKeywords[1] || instansiCtx.targetInstansi
    ];

    for (const term of searchTerms) {
      if (optionFound) break;
      await searchInput.fill('');
      await searchInput.fill(term);
      await page.waitForTimeout(500);

      const options = page.locator('[role="option"], [id^="button-kebutuhan-form-instansi-item-"]');
      const count = await options.count().catch(() => 0);

      for (let i = 0; i < count; i++) {
        const opt = options.nth(i);
        const optText = (await opt.innerText().catch(() => '')).trim();

        const matchesTarget =
          instansiCtx.targetKeywords.some((k) =>
            optText.toUpperCase().includes(k.toUpperCase())
          ) || optText.toUpperCase().includes(instansiCtx.targetInstansi.toUpperCase());

        // Validasi negatif: Pastikan bukan instansi lain
        const isForbidden =
          !optText.toUpperCase().includes('DALAM NEGERI') &&
          !optText.toUpperCase().includes('KEMENDAGRI') &&
          !optText.toUpperCase().includes('SOSIAL') &&
          !optText.toUpperCase().includes('KEMENSOS');

        if (matchesTarget && !isForbidden) {
          await opt.scrollIntoViewIfNeeded().catch(() => {});
          await opt.click({ force: true });
          optionFound = true;
          selectedOptionText = optText;
          break;
        }
      }
    }
  } else {
    // Tanpa search input
    const options = page.locator('[role="option"], [id^="button-kebutuhan-form-instansi-item-"]');
    const count = await options.count().catch(() => 0);
    for (let i = 0; i < count; i++) {
      const opt = options.nth(i);
      const optText = (await opt.innerText().catch(() => '')).trim();

      const matchesTarget = instansiCtx.targetKeywords.some((k) =>
        optText.toUpperCase().includes(k.toUpperCase())
      );

      const isForbidden =
        !optText.toUpperCase().includes('DALAM NEGERI') &&
        !optText.toUpperCase().includes('KEMENDAGRI') &&
        !optText.toUpperCase().includes('SOSIAL') &&
        !optText.toUpperCase().includes('KEMENSOS');

      if (matchesTarget && !isForbidden) {
        await opt.scrollIntoViewIfNeeded().catch(() => {});
        await opt.click({ force: true });
        optionFound = true;
        selectedOptionText = optText;
        break;
      }
    }
  }

  if (!optionFound) {
    throw new Error(
      `[CRITICAL INSTANSI GUARD] Tidak ditemukan opsi untuk "${instansiCtx.targetInstansi}". ` +
      `Sesuai instruksi: DILARANG menggunakan instansi selain Kemensos dan Kemendagri karena tidak ada akunnya!`
    );
  }

  await page.waitForTimeout(500);

  // Verifikasi akhir
  const verifiedText = (await trigger.innerText().catch(() => '')).trim();
  const isVerified =
    instansiCtx.targetKeywords.some((kw) =>
      verifiedText.toUpperCase().includes(kw.toUpperCase())
    ) || verifiedText.toUpperCase().includes(instansiCtx.targetInstansi.toUpperCase());

  if (!isVerified) {
    throw new Error(
      `[CRITICAL INSTANSI GUARD] Instansi yang terpasang "${verifiedText}" BUKAN target valid ("${instansiCtx.targetInstansi}"). ` +
      `Sistem membatalkan form karena instansi selain Kemensos & Kemendagri tidak memiliki akun login!`
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
