import { Page } from 'playwright';
import { StepLogger, ModuleCode } from '../utils/step-logger.js';
import { safeNavigate, safeDismissUnexpectedPopups } from '../utils/page-error-guard.js';

const BASE_URL = (process.env.BASE_URL || 'https://fe-staging.data.go.id').replace(/\/$/, '');

export interface LoginCredentials {
  username: string;
  password: string;
  roleName?: string;
}

export interface LoginCheckStatus {
  isLoggedIn: boolean;
  usernameOrRole?: string;
  reason: string;
}

/**
 * Memeriksa secara akurat apakah browser saat ini sudah berada dalam status login (sesi aktif)
 */
export async function checkIsLoggedIn(page: Page): Promise<LoginCheckStatus> {
  try {
    const currentUrl = page.url();

    // 0. Jika masih di about:blank atau belum membuka halaman web, belum login
    if (!currentUrl || currentUrl === 'about:blank' || !currentUrl.startsWith('http')) {
      return { isLoggedIn: false, reason: 'Browser belum memuat halaman web (about:blank)' };
    }

    // 1. Jika masih di halaman login dengan form input terbuka, pasti belum login
    const isLoginPage = currentUrl.includes('/login') || currentUrl.includes('/auth/signin');
    const hasLoginInput = await page
      .locator('#email, input[name="username"], input[name="password"]')
      .first()
      .isVisible({ timeout: 400 })
      .catch(() => false);

    if (isLoginPage && hasLoginInput) {
      return { isLoggedIn: false, reason: 'Masih di halaman login dengan form input aktif' };
    }

    // 2. Cek apakah ada tombol "Masuk" atau "Login" di navbar (indikator kuat belum login)
    const hasLoginNavBtn = await page
      .locator('header a:has-text("Masuk"), header a:has-text("Login"), header button:has-text("Masuk"), header button:has-text("Login")')
      .first()
      .isVisible({ timeout: 500 })
      .catch(() => false);

    if (hasLoginNavBtn) {
      return { isLoggedIn: false, reason: 'Terdapat tombol Masuk/Login di header navbar' };
    }

    // 3. Cek indikator pengguna login di header/navbar (avatar, profil, role aktif, logout)
    const profileIndicators = page
      .locator(
        'button:has-text("Role Aktif"), [data-testid="user-profile"], header button[aria-haspopup="menu"], button:has([aria-label="User"]), header div[role="button"]:has(img), header button:has-text("Logout"), button:has-text("Keluar")'
      )
      .first();

    const hasProfile = await profileIndicators.isVisible({ timeout: 800 }).catch(() => false);
    if (hasProfile) {
      const text = await profileIndicators.innerText().catch(() => '');
      return {
        isLoggedIn: true,
        usernameOrRole: text.replace(/\s+/g, ' ').trim(),
        reason: 'Elemen profil/role aktif terdeteksi di navbar'
      };
    }

    // 4. Cek keberadaan cookie sesi autentikasi
    const cookies = await page.context().cookies();
    const hasAuthCookie = cookies.some(
      (c) =>
        c.name.includes('next-auth.session-token') ||
        c.name.includes('__Secure-next-auth') ||
        c.name.includes('session') ||
        c.name.includes('token')
    );

    if (hasAuthCookie && !isLoginPage) {
      return { isLoggedIn: true, reason: 'Cookie sesi autentikasi terdeteksi aktif' };
    }

    return { isLoggedIn: false, reason: 'Tidak ditemukan bukti sesi aktif' };
  } catch {
    return { isLoggedIn: false, reason: 'Gagal melakukan verifikasi status sesi' };
  }
}

/**
 * Otomatisasi Login Lengkap ke Portal SDI:
 * 1. CEK DULU APAKAH SUDAH LOGIN ATAU BELUM
 * 2. Jika sudah login -> catat dan langsung lanjutkan automasi
 * 3. Jika belum -> buka form login, input kredensial, verifikasi popup & terms
 * 4. Verifikasi akhir: pastikan benar-benar berhasil login sebelum melanjutkan automasi
 */
export async function performLogin(
  page: Page,
  logger: StepLogger,
  credentials: LoginCredentials,
  moduleCode: ModuleCode = 'AUTH'
) {
  const roleLabel = credentials.roleName ? ` [${credentials.roleName}]` : '';

  // 1. CEK DULU APAKAH SUDAH LOGIN ATAU BELUM
  const initialCheck = await checkIsLoggedIn(page);
  if (initialCheck.isLoggedIn) {
    const checkStep = logger.logProgress(
      moduleCode,
      'VERIFY',
      '#session-check',
      `Pengecekan Status Sesi${roleLabel}: Sudah Login`
    );
    logger.markSuccess(
      checkStep,
      `Sesi login aktif terdeteksi (${initialCheck.reason}) ➔ Lanjutkan automasi`
    );
    return;
  }

  // 2. JIKA BELUM LOGIN, BUKA HALAMAN FORM LOGIN
  const stepIdx = logger.logProgress(
    moduleCode,
    'NAVIGATE',
    '#page-login',
    `Membuka form login${roleLabel}: ${credentials.username}`
  );

  await safeNavigate(page, `${BASE_URL}/login`, undefined, moduleCode, {
    waitUntil: 'domcontentloaded',
    timeoutMs: 45000
  });
  await page.waitForTimeout(1000);

  // Cek apakah halaman login otomatis me-redirect karena ada sesi tersimpan
  const redirectCheck = await checkIsLoggedIn(page);
  if (redirectCheck.isLoggedIn) {
    logger.markSuccess(stepIdx, `Sesi aktif terdeteksi setelah navigasi ➔ Lanjutkan automasi`);
    return;
  }

  // 3. ISI EMAIL / USERNAME & PASSWORD
  await page.waitForSelector('#email', { state: 'visible', timeout: 15000 });
  await page.fill('#email', credentials.username);
  await page.waitForSelector('input[type="password"]', { state: 'visible', timeout: 15000 });
  await page.fill('input[type="password"]', credentials.password);
  await page.waitForTimeout(500);

  // 4. SUBMIT FORM LOGIN
  await page.click('button[type="submit"]:has-text("Login")');
  await page.waitForTimeout(2000);

  // 5. SCROLL TERMS & KETENTUAN JIKA MUNCUL LALU KLIK CONTINUE
  await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('*'));
    all.forEach((el) => {
      const style = window.getComputedStyle(el);
      if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
        el.scrollTop = el.scrollHeight;
        el.dispatchEvent(new Event('scroll', { bubbles: true }));
      }
    });
  });
  await page.waitForTimeout(1000);

  const continueBtn = page.locator('button:has-text("Continue")').first();
  if (await continueBtn.isVisible().catch(() => false)) {
    console.log('[performLogin] Terms dialog terdeteksi ➔ Mengklik tombol Continue...');
    await continueBtn.click();
    await page.waitForTimeout(2000);
  }

  // 6. CEK APAKAH MUNCUL PESAN KESALAHAN LOGIN YANG SEBENARNYA (HANYA JIKA MASIH DI HALAMAN LOGIN)
  if (page.url().includes('/login')) {
    const errorAlert = page
      .locator('[role="alert"]:not(#__next-route-announcer__), .text-destructive:not(button), .text-red-500, p:has-text("salah"), p:has-text("tidak sesuai"), p:has-text("gagal")')
      .first();

    if (await errorAlert.isVisible().catch(() => false)) {
      const errorText = (await errorAlert.innerText().catch(() => '')).trim();
      if (errorText.length > 0 && !errorText.toLowerCase().includes('terms') && !errorText.toLowerCase().includes('syarat')) {
        throw new Error(
          `Login GAGAL untuk ${credentials.username}: "${errorText}". Periksa username dan password di file .env.`
        );
      }
    }
  }

  // 7. TUNGGU REDIRECT KELUAR DARI HALAMAN LOGIN
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);

  // 8. TANGANI POPUP PERINGATAN KATA SANDI (KLIK MENGERTI LALU JEDA 2-4 DETIK)
  await safeDismissUnexpectedPopups(page, logger, moduleCode);

  // 9. VERIFIKASI AKHIR APAKAH BENAR-BENAR BERHASIL LOGIN
  const finalCheck = await checkIsLoggedIn(page);
  if (!finalCheck.isLoggedIn && page.url().includes('/login')) {
    throw new Error(
      `Login GAGAL: Browser masih berada di rute login (${page.url()}). Autentikasi belum berhasil sehingga automasi form tidak dapat dilanjutkan. Pastikan kredensial di .env valid.`
    );
  }

  logger.markSuccess(stepIdx, `Berhasil Login sebagai ${credentials.username} ➔ Lanjutkan automasi`);
}

/**
 * Logout dari sesi aktif
 */
export async function performLogout(page: Page) {
  try {
    await safeNavigate(page, `${BASE_URL}/api/auth/signout`, undefined, 'A', {
      waitUntil: 'domcontentloaded',
      timeoutMs: 10000
    });
    const signoutBtn = page.locator('button[type="submit"]:has-text("Sign out")');
    if (await signoutBtn.isVisible()) {
      await signoutBtn.click();
      await page.waitForURL((url) => url.pathname.includes('/login'), { timeout: 10000 }).catch(() => {});
    }
  } catch {
    // Ignore error saat signout
  }
}
