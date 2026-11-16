import { chromium } from 'playwright';
import { performLogin } from './pages/auth.page.js';
import { safeNavigate } from './utils/page-error-guard.js';
import { StepLogger } from './utils/step-logger.js';

async function inspectRegistrasiData() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const dummyLogger = new StepLogger(['AUTH', 'C'], 'InspectReg');

  try {
    await performLogin(
      page,
      dummyLogger,
      { username: 'exchange@test.kemendagri.go.id', password: '123456789', roleName: 'Walidata Kemendagri' },
      'C'
    );

    await safeNavigate(page, 'https://fe-staging.data.go.id/registrasi/data', dummyLogger, 'C');
    await page.waitForTimeout(3000);

    const rows = await page.locator('tbody tr').evaluateAll((trs) =>
      trs.map((tr) => ({
        text: tr.innerText.replace(/\s+/g, ' ').trim(),
        buttons: Array.from(tr.querySelectorAll('button')).map((b) => ({
          id: b.id,
          title: b.title || b.getAttribute('aria-label'),
          text: b.innerText.trim()
        }))
      }))
    );

    console.log('Total baris di /registrasi/data:', rows.length);
    console.log('Baris pertama:', JSON.stringify(rows[0], null, 2));

    // Cek juga apakah ada link atau tombol ke form baru
    const allButtons = await page.locator('button, a[href*="dataset-form"]').evaluateAll((els) =>
      els.map((e) => ({
        tag: e.tagName,
        id: e.id,
        title: e.getAttribute('title'),
        href: e.getAttribute('href'),
        text: (e as HTMLElement).innerText.trim()
      }))
    );
    console.log('Buttons & links related to dataset-form:', allButtons.filter(b => (b.href && b.href.includes('dataset-form')) || (b.title && b.title.includes('Registrasi'))));

  } catch (err) {
    console.error('Error in inspectRegistrasiData:', err);
  } finally {
    await browser.close();
  }
}

inspectRegistrasiData();

