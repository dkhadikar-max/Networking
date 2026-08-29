const { chromium } = require('playwright');
const jwt = require('jsonwebtoken');
const SCREENSHOTS = 'C:/Networking/screenshots';
const TOKEN = jwt.sign({ id: '948bf34b-b3d6-4a8b-a6a8-2c34f2fb1b8b', email: 'dkhadikar@gmail.com' }, 'abdplcwersthjacb12344', { expiresIn: '1h' });

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);

  await page.goto('https://buildyournetwork.online', { waitUntil: 'domcontentloaded' });
  await page.evaluate(t => localStorage.setItem('byn_token', t), TOKEN);
  await page.goto('https://buildyournetwork.online/circles', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Screenshot: Circles page normal state
  await page.screenshot({ path: SCREENSHOTS + '/notif-audit-01-page.png' });

  // Click bell
  const bell = await page.$('.notif-bell-btn');
  if (bell) {
    await bell.click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: SCREENSHOTS + '/notif-audit-02-panel-open.png' });

    // Check z-index and position of overlay + panel
    const overlayStyles = await page.$eval('.notif-overlay', el => {
      const s = window.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return { position: s.position, zIndex: s.zIndex, top: r.top, left: r.left, width: r.width, height: r.height };
    }).catch(() => null);
    const panelStyles = await page.$eval('.notif-panel', el => {
      const s = window.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return { position: s.position, bottom: r.bottom, top: r.top, height: r.height, width: r.width };
    }).catch(() => null);
    const headerStyles = await page.$eval('.circles-header', el => {
      const s = window.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return { zIndex: s.zIndex, top: r.top, height: r.height };
    }).catch(() => null);

    console.log('OVERLAY:', JSON.stringify(overlayStyles));
    console.log('PANEL:', JSON.stringify(panelStyles));
    console.log('HEADER:', JSON.stringify(headerStyles));

    // Full page screenshot to see real overflow
    await page.screenshot({ path: SCREENSHOTS + '/notif-audit-03-full.png', fullPage: true });
  } else {
    console.log('BELL_NOT_FOUND');
  }

  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
