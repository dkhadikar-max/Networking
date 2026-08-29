const { chromium } = require('playwright');
const SS = 'C:/Networking/screenshots';

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);

  await page.goto('https://buildyournetwork.online', { waitUntil: 'networkidle', timeout: 40000 });
  await page.waitForTimeout(1500);

  // Accept cookie so it doesn't interfere
  const cookie = await page.$('button:has-text("Accept")');
  if (cookie) { await cookie.click(); await page.waitForTimeout(500); }

  // Full page screenshot
  await page.screenshot({ path: SS + '/home-full.png', fullPage: true });
  console.log('SCREENSHOT: full page');

  // Find APK mentions
  const apkEls = await page.$$eval('*', els =>
    els.filter(el => el.children.length === 0 && el.textContent?.includes('APK'))
       .map(el => ({ tag: el.tagName, text: el.textContent?.trim().slice(0, 100), cls: el.className?.slice(0, 40) }))
  );
  console.log('APK ELEMENTS:', JSON.stringify(apkEls, null, 2));

  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
