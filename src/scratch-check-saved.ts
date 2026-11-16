import { chromium } from 'playwright';
import { performLogin } from './pages/auth.page.js';
import { safeNavigate } from './utils/page-error-guard.js';
import { StepLogger } from './utils/step-logger.js';

async function checkSavedEntitiesAndKamus() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const logger = new StepLogger(['AUTH', 'C'], 'CheckSaved');

  try {
    await performLogin(
      page,
      logger,
      { username: 'exchange.kemenpora@test.kemenpora.go.id', password: '123456789', roleName: 'Walidata Kemenpora' },
      'AUTH'
    );

    // Buka /registrasi/data
    await safeNavigate(page, 'https://fe-staging.data.go.id/registrasi/data', logger, 'C');
    await page.waitForTimeout(3000);

    // Cek baris-baris dataset
    const rows = await page.locator('tbody tr').evaluateAll(trs =>
      trs.map(tr => ({
        text: (tr as HTMLElement).innerText.replace(/\s+/g, ' ').trim(),
        buttons: Array.from(tr.querySelectorAll('button, a')).map(b => ({
          text: (b as HTMLElement).innerText.trim(),
          id: b.id,
          href: b.getAttribute('href')
        }))
      }))
    );
    console.log('Datasets in /registrasi/data:', JSON.stringify(rows.slice(0, 3), null, 2));

    // Buka baris pertama
    const viewBtn = page.locator('tbody tr').first().locator('button, a').first();
    console.log('Clicking first button on row...');

    // Also let's check /dataset (katalog)
    await safeNavigate(page, 'https://fe-staging.data.go.id/dataset', logger, 'C');
    await page.waitForTimeout(3000);
    const catalogCards = await page.locator('main').innerText();
    console.log('Catalog preview:', catalogCards.slice(0, 500));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

checkSavedEntitiesAndKamus();

