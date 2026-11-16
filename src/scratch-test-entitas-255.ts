import { chromium } from 'playwright';
import { performLogin } from './pages/auth.page.js';
import { safeNavigate } from './utils/page-error-guard.js';
import { StepLogger } from './utils/step-logger.js';

async function testEntitas255() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const dummyLogger = new StepLogger(['AUTH', 'C'], 'TestEntitas255');

  const text255 =
    'Entitas data agregat kependudukan yang memuat seluruh parameter identitas penduduk nasional, status keterpaduan sosial ekonomi, data kemiskinan ekstrem, serta riwayat bantuan secara periodik dan terstandarisasi untuk kebutuhan integrasi antar instansi RI.';

  console.log(`Panjang teks uji entitas definisi: ${text255.length} karakter`);

  try {
    // 1. Login Walidata Kemendagri
    await performLogin(
      page,
      dummyLogger,
      { username: 'exchange@test.kemendagri.go.id', password: '123456789', roleName: 'Walidata Kemendagri' },
      'C'
    );

    // 2. Akses antrean registrasi data
    await safeNavigate(page, 'https://fe-staging.data.go.id/registrasi/data', dummyLogger, 'C');
    await page.waitForTimeout(2000);

    // 3. Buka form registrasi
    const regBtn = page.locator('#button-registrasi-data-registrasikan-0, button[title="Registrasikan Data"]').first();
    await regBtn.waitFor({ state: 'visible', timeout: 15000 });
    await regBtn.click();
    await page.waitForTimeout(3000);

    console.log(`URL Form Registrasi: ${page.url()}`);

    // Step 1: Lanjut ke Step 2
    const nextBtn1 = page.locator('#button-dataset-next-step, button:has-text("Lanjut Langkah 2"), button:has-text("Lanjut")').first();
    if (await nextBtn1.isVisible({ timeout: 5000 }).catch(() => false)) {
      await nextBtn1.click({ force: true });
      await page.waitForTimeout(2000);
    }

    console.log(`URL Step 2: ${page.url()}`);

    // Step 2: Buka Modal Tambah Entitas
    const addEntitasBtn = page.locator('#button-dataset-step2-tambah-entitas, button:has-text("Tambah Entitas")').first();
    await addEntitasBtn.waitFor({ state: 'visible', timeout: 10000 });
    await addEntitasBtn.click({ force: true });
    await page.waitForTimeout(1500);

    const dialog = page.locator('[role="dialog"]').first();
    await dialog.waitFor({ state: 'visible', timeout: 5000 });
    console.log('Modal Tambah Entitas berhasil terbuka.');

    // Cek atribut input & textarea
    const entName = dialog.locator('input').first();
    await entName.fill('Entitas Uji 255 Karakter');

    const entDesc = dialog.locator('textarea').first();
    const maxlength = await entDesc.getAttribute('maxlength').catch(() => null);
    console.log(`Atribut maxlength pada textarea definisi entitas: ${maxlength || 'tidak ada (unlimited)'}`);

    // Isi dengan 255 karakter
    await entDesc.fill(text255);
    await page.waitForTimeout(500);

    const filledValue = await entDesc.inputValue();
    console.log(`Jumlah karakter terisi di textarea: ${filledValue.length} karakter`);
    console.log(`Nilai terisi sama persis: ${filledValue === text255}`);

    // Cek apakah ada pesan error validasi sebelum simpan
    const errorTextBefore = await dialog.locator('.text-red-500, .text-destructive, [role="alert"]').allInnerTexts().catch(() => []);
    console.log('Error validasi sebelum simpan:', errorTextBefore);

    // Klik tombol Simpan / Tambah Entitas
    const saveBtn = dialog.locator('button:has-text("Tambah"), button:has-text("Simpan")').first();
    await saveBtn.click({ force: true });
    await page.waitForTimeout(2000);

    // Cek apakah modal tertutup atau masih ada error
    const isDialogStillOpen = await dialog.isVisible().catch(() => false);
    console.log(`Modal masih terbuka setelah simpan? ${isDialogStillOpen}`);

    if (isDialogStillOpen) {
      const errorTextAfter = await dialog.locator('.text-red-500, .text-destructive, [role="alert"]').allInnerTexts().catch(() => []);
      console.log('Error validasi setelah klik simpan:', errorTextAfter);
    } else {
      console.log('✅ BERHASIL! Modal entitas tertutup tanpa error, entitas dengan 255 karakter sukses disimpan.');
    }

    // Cek apakah entitas muncul di tabel Step 2
    const step2Body = await page.locator('main, form, table').innerText().catch(() => '');
    const isEntityInTable = step2Body.includes('Entitas Uji 255 Karakter');
    console.log(`Entitas muncul di tabel Step 2? ${isEntityInTable}`);

    // Cek tombol Lanjut Langkah 3
    const nextBtn2 = page.locator('#button-dataset-next-step, button:has-text("Lanjut Langkah 3"), button:has-text("Lanjut")').first();
    if (await nextBtn2.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nextBtn2.click({ force: true });
      await page.waitForTimeout(2000);
      console.log(`URL setelah Lanjut Langkah 3: ${page.url()}`);
      console.log('✅ Form berhasil maju ke Step 3 (Kamus Data) tanpa kendala!');
    }

  } catch (err) {
    console.error('Error saat uji entitas 255 karakter:', err);
  } finally {
    await browser.close();
  }
}

testEntitas255();

