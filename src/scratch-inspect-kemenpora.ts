import { chromium } from 'playwright';
import { performLogin } from './pages/auth.page.js';
import { StepLogger } from './utils/step-logger.js';

async function inspectKemenpora() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const logger = new StepLogger(['AUTH'], 'InspectKemenpora');

  try {
    await performLogin(
      page,
      logger,
      { username: 'exchange.kemenpora@test.kemenpora.go.id', password: '123456789', roleName: 'Kemenpora' },
      'AUTH'
    );

    const profileData = await page.evaluate(async () => {
      const sp = localStorage.getItem('safe_profile');
      const instDropdown = await fetch('/api/instantions/dropdown?pageSize=1000').then((r) => r.json()).catch(() => []);
      const kemenporaItems = (Array.isArray(instDropdown) ? instDropdown : []).filter(
        (i: any) =>
          (i.nama || '').toUpperCase().includes('PEMUDA') ||
          (i.nama || '').toUpperCase().includes('OLAHRAGA') ||
          (i.nama || '').toUpperCase().includes('KEMENPORA')
      );
      return {
        safe_profile: sp ? JSON.parse(sp) : null,
        kemenporaDropdownItems: kemenporaItems
      };
    });

    console.log('=== KEMENPORA PROFILE & DROPDOWN ===');
    console.log(JSON.stringify(profileData, null, 2));
  } finally {
    await browser.close();
  }
}

inspectKemenpora().catch(console.error);
