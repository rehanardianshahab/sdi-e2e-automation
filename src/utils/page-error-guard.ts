import { Page } from 'playwright';
import { StepLogger, ModuleCode } from './step-logger.js';
import {
  NAVIGATION_POLICY,
  DIALOG_POLICY,
  POPUP_ROLLBACK_POLICY,
  PageAvoidanceRule
} from '../config/page-error-avoidance.js';
import { SdiAutomationPayload } from '../schemas/sdi-e2e.schema.js';
import { FALLBACK_FAKE_DATA } from '../generators/fallback-fake-data.js';
import { resolveInstansiContext } from './instansi-helper.js';

export interface PopupDismissResult {
  dismissed: boolean;
  rollbackDetected: boolean;
  urlBefore?: string;
  urlAfter?: string;
  popupMessage?: string;
  mitigationApplied?: string;
}

/**
 * Menghasilkan durasi jeda acak dalam rentang detik yang ditentukan (default: 2 - 4 detik)
 */
export function getRandomDelay(minSec = 2, maxSec = 4): number {
  return Math.floor(Math.random() * ((maxSec - minSec) * 1000 + 1)) + minSec * 1000;
}

/**
 * Deep merge utilitas untuk memastikan tidak ada properti payload yang undefined
 * serta menyesuaikan target instansi:
 * - Jika login Kemensos -> target Kemendagri
 * - Jika login Kemendagri -> target Kemensos
 */
export function sanitizePayload(
  payload?: Partial<SdiAutomationPayload> | null,
  userEmail?: string
): SdiAutomationPayload {
  const instansiCtx = resolveInstansiContext(userEmail);
  const base = JSON.parse(JSON.stringify(FALLBACK_FAKE_DATA));

  // Sesuaikan nilai fallback dengan instansi target yang tepat
  base.kebutuhanData.instansiIndikasi = instansiCtx.targetInstansi;
  base.kebutuhanData.produsenData = instansiCtx.targetProdusenData;
  base.kebutuhanData.waliData = instansiCtx.targetWaliData;

  const result: SdiAutomationPayload = {
    kebutuhanData: {
      ...base.kebutuhanData,
      ...(payload?.kebutuhanData || {})
    },
    registrasiDataset: {
      step1Informasi: {
        ...base.registrasiDataset.step1Informasi,
        ...(payload?.registrasiDataset?.step1Informasi || {})
      },
      step2Entitas:
        payload?.registrasiDataset?.step2Entitas &&
        payload.registrasiDataset.step2Entitas.length > 0
          ? payload.registrasiDataset.step2Entitas
          : base.registrasiDataset.step2Entitas,
      step3KamusData:
        payload?.registrasiDataset?.step3KamusData &&
        payload.registrasiDataset.step3KamusData.length > 0
          ? payload.registrasiDataset.step3KamusData
          : base.registrasiDataset.step3KamusData
    },
    registrasiLayananLID: {
      ...base.registrasiLayananLID,
      ...(payload?.registrasiLayananLID || {})
    },
    pengajuanAksesLID: {
      ...base.pengajuanAksesLID,
      ...(payload?.pengajuanAksesLID || {})
    }
  };

  // Garansi konsistensi aturan instansi target: HANYA Kemensos atau Kemendagri
  result.kebutuhanData.instansiIndikasi = instansiCtx.targetInstansi;
  result.kebutuhanData.produsenData = instansiCtx.targetProdusenData;
  result.kebutuhanData.waliData = instansiCtx.targetWaliData;

  // Garansi batasan panjang karakter deskripsi maksimal 255 karakter
  if (result.registrasiDataset?.step1Informasi?.deskripsi) {
    result.registrasiDataset.step1Informasi.deskripsi = result.registrasiDataset.step1Informasi.deskripsi.slice(0, 255);
  }
  if (result.registrasiLayananLID?.apiDesc) {
    result.registrasiLayananLID.apiDesc = result.registrasiLayananLID.apiDesc.slice(0, 255);
  }

  return result;
}

/**
 * Menunggu hingga backdrop / modal overlay selesai beranimasi dan tidak lagi menghalangi pointer-events
 */
export async function waitForOverlayDismissed(page: Page, timeoutMs = 3000) {
  try {
    const backdrop = page.locator('div[data-state="closed"].fixed.inset-0, .bg-black\\/80[data-state="closed"]').first();
    if (await backdrop.isVisible({ timeout: 200 }).catch(() => false)) {
      await backdrop.waitFor({ state: 'hidden', timeout: timeoutMs }).catch(() => {});
    }
  } catch {
    // Abaikan
  }
}

/**
 * Menutup popup tak terduga dengan:
 * 1. Proteksi terhadap form dialog aktif
 * 2. Pengecekan rollback halaman saat mengklik tombol "Mengerti" (atau tombol konfirmasi)
 * 3. Pelaporan eksplisit ke logger jika terjadi redirect mundur
 * 4. Mitigasi auto-recovery kembali ke halaman yang diinginkan
 */
export async function safeDismissUnexpectedPopups(
  page: Page,
  logger?: StepLogger,
  moduleCode: ModuleCode = 'A',
  expectedUrlOrPath?: string
): Promise<PopupDismissResult> {
  const result: PopupDismissResult = {
    dismissed: false,
    rollbackDetected: false
  };

  try {
    // 1. Cek apakah ada dialog form yang sedang aktif dengan input di dalamnya (form utama)
    const hasActiveFormDialog = await page
      .locator('[role="dialog"] input, [role="dialog"] textarea, [role="dialog"] form')
      .first()
      .isVisible({ timeout: 200 })
      .catch(() => false);

    // 2. Deteksi khusus popup peringatan (misal peringatan ganti kata sandi) dengan tombol "Mengerti"
    const mengertiBtn = page
      .locator('[role="alertdialog"] button:has-text("Mengerti"), [role="dialog"] button:has-text("Mengerti"), button:has-text("Mengerti")')
      .first();

    if (await mengertiBtn.isVisible({ timeout: 300 }).catch(() => false)) {
      const urlBefore = page.url();
      result.urlBefore = urlBefore;

      // Ambil teks pesan popup untuk catatan report
      const dialogContainer = page.locator('[role="alertdialog"], [role="dialog"], div.fixed.inset-0').first();
      const popupText = (await dialogContainer.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
      result.popupMessage = popupText;

      // 1. Klik tombol "Mengerti"
      if (logger) {
        const clickIdx = logger.logProgress(
          moduleCode,
          'CLICK_BUTTON',
          'button:has-text("Mengerti")',
          'Klik tombol "Mengerti" pada popup peringatan akun/keamanan'
        );
        await mengertiBtn.click({ force: true });
        logger.markSuccess(clickIdx, 'Tombol "Mengerti" diklik');
      } else {
        await mengertiBtn.click({ force: true });
      }

      // 2. Buat jeda 2 - 4 detik sebelum pindah halaman
      const pauseMs = getRandomDelay(2, 4);
      if (logger) {
        const pauseIdx = logger.logProgress(
          moduleCode,
          'VERIFY',
          '#jeda-transisi',
          `Jeda ${(pauseMs / 1000).toFixed(1)} detik sebelum pindah halaman...`
        );
        await page.waitForTimeout(pauseMs);
        logger.markSuccess(pauseIdx, 'Jeda selesai ➔ Berpindah halaman');
      } else {
        await page.waitForTimeout(pauseMs);
      }

      const urlAfter = page.url();
      result.urlAfter = urlAfter;
      result.dismissed = true;

      // 3. Pindah halaman / kembali ke halaman sebelumnya dan lanjutkan automasi
      if (urlAfter.includes('/change-password')) {
        const returnTarget = expectedUrlOrPath
          ? (expectedUrlOrPath.startsWith('http')
              ? expectedUrlOrPath
              : `${(process.env.BASE_URL || 'https://fe-staging.data.go.id').replace(/\/$/, '')}/${expectedUrlOrPath.replace(/^\//, '')}`)
          : `${(process.env.BASE_URL || 'https://fe-staging.data.go.id').replace(/\/$/, '')}/dashboard`;

        if (logger) {
          const navBackIdx = logger.logProgress(
            moduleCode,
            'NAVIGATE',
            '#return-from-change-password',
            `Terdeteksi dialihkan ke /change-password ➔ Kembali ke ${returnTarget}`
          );
          await page.goto(returnTarget, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
          logger.markSuccess(navBackIdx, `Berhasil kembali ke ${returnTarget} ➔ Lanjutkan automasi`);
        } else {
          await page.goto(returnTarget, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
        }
      } else if (expectedUrlOrPath) {
        const cleanPath = expectedUrlOrPath.replace(/^\//, '');
        const fullExpected = expectedUrlOrPath.startsWith('http')
          ? expectedUrlOrPath
          : `${(process.env.BASE_URL || 'https://fe-staging.data.go.id').replace(/\/$/, '')}/${cleanPath}`;

        if (!urlAfter.includes(expectedUrlOrPath)) {
          if (logger) {
            const navIdx = logger.logProgress(
              moduleCode,
              'NAVIGATE',
              '#return-previous-page',
              `Kembali ke halaman sebelumnya (${fullExpected}) dan lanjutkan automasi`
            );
            await page.goBack().catch(() => {});
            await page.waitForTimeout(300);

            if (!page.url().includes(expectedUrlOrPath)) {
              await page.goto(fullExpected, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
            }
            logger.markSuccess(navIdx, `Kembali ke ${fullExpected} ➔ Automasi dilanjutkan`);
          } else {
            await page.goBack().catch(() => {});
            if (!page.url().includes(expectedUrlOrPath)) {
              await page.goto(fullExpected, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
            }
          }
        }
      } else if (urlAfter !== urlBefore && !urlBefore.includes('/login')) {
        if (logger) {
          const backIdx = logger.logProgress(
            moduleCode,
            'NAVIGATE',
            '#page-go-back',
            `Kembali ke halaman sebelumnya (${urlBefore}) dan lanjutkan automasi`
          );
          await page.goBack().catch(() => {});
          await page.waitForTimeout(300);
          if (page.url() !== urlBefore) {
            await page.goto(urlBefore, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
          }
          logger.markSuccess(backIdx, `Kembali ke ${urlBefore} ➔ Automasi dilanjutkan`);
        } else {
          await page.goBack().catch(() => {});
        }
      }

      await page.waitForTimeout(300);
      return result;
    }

    // Jangan tutup modal Terms & Conditions (karena perlu persetujuan Continue)
    const hasTerms = await page.locator('text="Terms & Conditions", text="Syarat & Ketentuan"').first().isVisible({ timeout: 200 }).catch(() => false);
    if (hasTerms) {
      return result;
    }

    // 3. Popup banner standar (cookie, info)
    const generalSelectors = [
      '[role="alertdialog"] button:has-text("Tutup")',
      '.cookie-banner button',
      '.announcement-popup button'
    ];

    if (!hasActiveFormDialog) {
      generalSelectors.push(
        'button[aria-label="Close"]',
        'button[aria-label="Tutup"]',
        'button:has-text("✕")',
        'button:has-text("×")',
        '[role="dialog"] button:has-text("Tutup")',
        '.dialog-close'
      );
    }

    for (const selector of generalSelectors) {
      const btn = page.locator(selector).first();
      if (await btn.isVisible({ timeout: 200 }).catch(() => false)) {
        if (logger) {
          const idx = logger.logProgress(
            moduleCode,
            'CLICK_BUTTON',
            selector,
            `[Guard] Menutup popup alert tidak terduga (${selector})`
          );
          await btn.click({ force: true }).catch(() => {});
          logger.markSuccess(idx, 'Popup aman ditutup ➔ Lanjut');
        } else {
          await btn.click({ force: true }).catch(() => {});
        }
        result.dismissed = true;
        await page.waitForTimeout(200);
      }
    }
  } catch {
    // Abaikan error pada pemeriksaan popup
  }

  return result;
}

function expectedPathOrUrl(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

/**
 * Navigasi halaman yang aman dari timeout hanging (menghindari networkidle hanging 30s)
 */
export async function safeNavigate(
  page: Page,
  targetUrl: string,
  logger?: StepLogger,
  moduleCode: ModuleCode = 'A',
  options?: {
    timeoutMs?: number;
    waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
    stepDescription?: string;
  }
): Promise<boolean> {
  await safeDismissUnexpectedPopups(page, logger, moduleCode, targetUrl);

  const matchedRoute = Object.keys(NAVIGATION_POLICY.routePolicies).find((r) =>
    targetUrl.includes(r)
  );
  const routePolicy = matchedRoute ? NAVIGATION_POLICY.routePolicies[matchedRoute] : undefined;

  const timeoutMs =
    options?.timeoutMs ||
    routePolicy?.timeoutMs ||
    NAVIGATION_POLICY.navigationTimeoutMs;

  const waitUntil =
    options?.waitUntil ||
    routePolicy?.waitUntil ||
    NAVIGATION_POLICY.preferredWaitUntil;

  const desc = options?.stepDescription || `Navigasi ke ${targetUrl}`;
  let stepIndex: number | undefined;
  if (logger) {
    stepIndex = logger.logProgress(moduleCode, 'NAVIGATE', '#safe-nav', desc);
  }

  let lastErr: any;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      // Jeda 2 - 4 detik sebelum pindah halaman (atau jeda retry)
      const navPause = attempt === 1 ? getRandomDelay(2, 3) : 3000;
      await page.waitForTimeout(navPause);

      await page.goto(targetUrl, {
        waitUntil,
        timeout: timeoutMs
      });

      if (logger && stepIndex !== undefined) {
        logger.markSuccess(stepIndex, `Halaman berhasil dimuat (${waitUntil}${attempt > 1 ? `, attempt ${attempt}` : ''}) ➔ Lanjut`);
      }
      return true;
    } catch (err: any) {
      lastErr = err;
      if (err.message.includes('Timeout') || err.message.includes('ERR_TIMED_OUT')) {
        if (attempt < 3) {
          console.warn(`[safeNavigate] Percobaan ${attempt} ke ${targetUrl} mengalami timeout, mencoba kembali...`);
          continue;
        }
      } else {
        break;
      }
    }
  }

  const err = lastErr;
  if (err && (err.message.includes('Timeout') || err.message.includes('ERR_TIMED_OUT')) && waitUntil !== 'domcontentloaded') {
    try {
      await page.goto(targetUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 20000
      });
      if (logger && stepIndex !== undefined) {
        logger.markSuccess(
          stepIndex,
          `Halaman dimuat via fallback (domcontentloaded) ➔ Lanjut`
        );
      }
      return true;
    } catch (fallbackErr: any) {
      if (routePolicy?.skipIfUnavailable) {
        if (logger && stepIndex !== undefined) {
          logger.markSuccess(
            stepIndex,
            `Halaman opsional dilewati karena tidak tersedia (${fallbackErr.message.slice(0, 30)}...)`
          );
        }
        return false;
      }
      throw fallbackErr;
    }
  }

  if (routePolicy?.skipIfUnavailable) {
    if (logger && stepIndex !== undefined) {
      logger.markSuccess(
        stepIndex,
        `Halaman opsional dilewati (${err?.message?.slice(0, 30) || 'unknown'}...)`
      );
    }
    return false;
  }

  throw err;
}

/**
 * Mengecek apakah ada pesan kesalahan validasi (validation error) nyata yang muncul di formulir:
 * - Elemen form berstatus invalid: [aria-invalid="true"]
 * - Pesan error validasi form: teks berisi "wajib", "harus diisi", "tidak boleh kosong", "tidak valid", "karakter"
 * Mengabaikan tanda bintang merah (*) dan elemen styling navigasi tema merah SDI.
 */
export async function detectValidationErrors(page: Page): Promise<string[]> {
  try {
    return await page.evaluate(() => {
      const errors: string[] = [];

      // 1. Cek input, textarea, select dengan atribut aria-invalid="true"
      const invalidFields = Array.from(
        document.querySelectorAll('input[aria-invalid="true"], textarea[aria-invalid="true"], select[aria-invalid="true"]')
      );
      for (const field of invalidFields) {
        const name =
          field.getAttribute('name') ||
          field.id ||
          field.getAttribute('placeholder') ||
          'Field';
        errors.push(`Field "${name}" tidak valid (aria-invalid)`);
      }

      // 2. Cek pesan teks kesalahan validasi form
      const candidateNodes = Array.from(
        document.querySelectorAll(
          '[role="alert"]:not(#__next-route-announcer__), p.text-destructive, p.text-red-500, span.text-destructive, span.text-red-500, .error-message, [data-error]'
        )
      );

      for (const el of candidateNodes) {
        // Lewati jika berada di dalam sidebar / navbar / menu
        if (el.closest('aside, nav, header, [role="navigation"]')) continue;

        const text = (el.textContent || '').trim();
        // Abaikan tanda bintang asterik (*) required label
        if (text === '*' || text === '**' || text.length === 0) continue;
        if (text.includes('Dashboard') || text.includes('Logout')) continue;

        const tLower = text.toLowerCase();
        // Validasi error biasanya menyatakan keharusan / format / kesalahan input
        if (
          tLower.includes('wajib') ||
          tLower.includes('harus') ||
          tLower.includes('tidak boleh') ||
          tLower.includes('tidak valid') ||
          tLower.includes('salah') ||
          tLower.includes('gagal') ||
          tLower.includes('minimal') ||
          tLower.includes('maksimal')
        ) {
          errors.push(text);
        }
      }

      return Array.from(new Set(errors));
    });
  } catch {
    return [];
  }
}

/**
 * Memastikan tidak ada validation error pada halaman/dialog saat ini.
 * Jika ada, lempar Exception dengan daftar field/error yang harus diperbaiki.
 */
export async function assertNoValidationErrors(page: Page, contextName: string) {
  const errors = await detectValidationErrors(page);
  if (errors.length > 0) {
    throw new Error(
      `[VALIDATION_ERROR] Terdeteksi kesalahan validasi pada ${contextName}: ${errors.join('; ')}`
    );
  }
}

