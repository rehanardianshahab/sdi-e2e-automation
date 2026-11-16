import { Page } from 'playwright';
import { StepLogger, ModuleCode } from './step-logger.js';
import { safeDismissUnexpectedPopups, safeNavigate } from './page-error-guard.js';

/**
 * Mendeteksi popup/modal tak terduga (misal warning, info, promo, session dialog)
 * dan otomatis mencari serta menekan tombol close/dismiss/batal/silang,
 * DENGAN proteksi agar TIDAK menutup modal form aktif.
 */
export async function dismissUnexpectedPopups(
  page: Page,
  logger?: StepLogger,
  moduleCode: ModuleCode = 'A',
  expectedPath?: string
) {
  await safeDismissUnexpectedPopups(page, logger, moduleCode, expectedPath);
}

/**
 * Memastikan browser berada pada halaman/URL yang diharapkan.
 * Jika URL saat ini melenceng atau tidak sesuai target, otomatis kembali (navigate ulang) ke halaman yang benar
 * menggunakan safeNavigate (mencegah timeout networkidle hanging).
 */
export async function ensureCorrectPage(
  page: Page,
  expectedPathOrUrl: string,
  logger?: StepLogger,
  moduleCode: ModuleCode = 'A'
) {
  await safeDismissUnexpectedPopups(page, logger, moduleCode, expectedPathOrUrl);

  const currentUrl = page.url();
  const isMatch = currentUrl.includes(expectedPathOrUrl);

  if (!isMatch) {
    const baseUrl = (process.env.BASE_URL || 'https://fe-staging.data.go.id').replace(/\/$/, '');
    const fullTarget = expectedPathOrUrl.startsWith('http')
      ? expectedPathOrUrl
      : `${baseUrl}${expectedPathOrUrl.startsWith('/') ? '' : '/'}${expectedPathOrUrl}`;

    if (logger) {
      await safeNavigate(page, fullTarget, logger, moduleCode, {
        stepDescription: `Halaman melenceng (${currentUrl}) ➔ Mengembalikan navigasi ke: ${fullTarget}`,
        waitUntil: 'domcontentloaded'
      });
    } else {
      await safeNavigate(page, fullTarget, undefined, moduleCode, {
        waitUntil: 'domcontentloaded'
      });
    }
  }
}

function normalizeSelector(elementId: string): string {
  if (
    elementId.startsWith('#') ||
    elementId.startsWith('.') ||
    elementId.startsWith('[') ||
    elementId.includes(':') ||
    elementId.includes(',') ||
    elementId.includes(' ') ||
    elementId.includes('>')
  ) {
    return elementId;
  }
  return `#${elementId}`;
}

export async function fillById(
  page: Page,
  logger: StepLogger,
  moduleCode: ModuleCode,
  elementId: string,
  value: string,
  fieldLabel: string,
  expectedPath?: string
) {
  if (expectedPath) {
    await ensureCorrectPage(page, expectedPath, logger, moduleCode);
  } else {
    await safeDismissUnexpectedPopups(page, logger, moduleCode, expectedPath);
  }

  const selector = normalizeSelector(elementId);
  const stepIndex = logger.logProgress(
    moduleCode,
    'FILL_INPUT',
    selector,
    `Mengisi ${fieldLabel} (${selector})`
  );

  const locator = page.locator(selector).first();
  await locator.waitFor({ state: 'visible', timeout: 15000 });
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await locator.fill(value);

  logger.markSuccess(
    stepIndex,
    `Terisi "${value.slice(0, 15)}..." ➔ Lanjut`
  );
}

export async function clickById(
  page: Page,
  logger: StepLogger,
  moduleCode: ModuleCode,
  elementId: string,
  actionLabel: string,
  successMessage = 'Berhasil diklik ➔ Lanjut',
  expectedPath?: string
) {
  if (expectedPath) {
    await ensureCorrectPage(page, expectedPath, logger, moduleCode);
  } else {
    await safeDismissUnexpectedPopups(page, logger, moduleCode, expectedPath);
  }

  const selector = normalizeSelector(elementId);
  const stepIndex = logger.logProgress(
    moduleCode,
    'CLICK_BUTTON',
    selector,
    `Klik ${actionLabel} (${selector})`
  );

  const locator = page.locator(selector).first();
  await locator.waitFor({ state: 'visible', timeout: 15000 });
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  
  try {
    await locator.click({ timeout: 5000 });
  } catch (err: any) {
    if (err.message.includes('intercepts pointer events') || err.message.includes('Timeout')) {
      await page.waitForTimeout(300);
      await locator.click({ force: true });
    } else {
      throw err;
    }
  }

  logger.markSuccess(stepIndex, `${successMessage}`);
}

export async function selectById(
  page: Page,
  logger: StepLogger,
  moduleCode: ModuleCode,
  elementId: string,
  optionLabel: string,
  fieldLabel: string,
  expectedPath?: string
) {
  if (expectedPath) {
    await ensureCorrectPage(page, expectedPath, logger, moduleCode);
  } else {
    await safeDismissUnexpectedPopups(page, logger, moduleCode);
  }

  const selector = normalizeSelector(elementId);
  const stepIndex = logger.logProgress(
    moduleCode,
    'SELECT_OPTION',
    selector,
    `Pilih "${optionLabel}" di ${fieldLabel}`
  );

  const locator = page.locator(selector).first();
  await locator.waitFor({ state: 'visible', timeout: 15000 });
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await locator.selectOption({ label: optionLabel });

  logger.markSuccess(
    stepIndex,
    `"${optionLabel.slice(0, 15)}..." terpilih ➔ Lanjut`
  );
}
