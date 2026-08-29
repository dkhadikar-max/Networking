const { chromium } = require('playwright');
const jwt = require('jsonwebtoken');
const SS = 'C:/Networking/screenshots';
const MY_ID = '948bf34b-b3d6-4a8b-a6a8-2c34f2fb1b8b';
const TOKEN = jwt.sign({ id: MY_ID, email: 'dkhadikar@gmail.com' }, 'abdplcwersthjacb12344', { expiresIn: '1h' });

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);

  // Fresh context — no cookie consent stored — so banner will appear
  await page.goto('https://buildyournetwork.online', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.evaluate(t => localStorage.setItem('byn_token', t), TOKEN);
  await page.goto('https://buildyournetwork.online/chat', { waitUntil: 'networkidle', timeout: 40000 });
  await page.waitForTimeout(1500);

  // Check cookie banner z-index before opening modal
  const bannerZ = await page.evaluate(() => {
    const banner = document.querySelector('[role="dialog"][aria-label="Cookie consent"]');
    if (!banner) return null;
    return { zIndex: window.getComputedStyle(banner).zIndex, visible: banner.offsetParent !== null };
  });
  console.log('BANNER_Z_INDEX=' + bannerZ?.zIndex + ' (expect ~150)');
  console.log('BANNER_VISIBLE=' + bannerZ?.visible);

  // Screenshot with banner visible and NO modal
  await page.screenshot({ path: SS + '/cookie-00-banner-only.png' });
  console.log('SCREENSHOT: banner only');

  // Open priority inbox — banner should be BEHIND the modal overlay
  const boltBtn = await page.$('button[title="Priority messages"]');
  if (boltBtn) {
    await boltBtn.click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: SS + '/cookie-01-modal-over-banner.png' });
    console.log('SCREENSHOT: modal open — banner should be behind');

    // Check stacking: modal overlay z vs banner z
    const zValues = await page.evaluate(() => {
      const banner  = document.querySelector('[role="dialog"][aria-label="Cookie consent"]');
      const overlay = [...document.querySelectorAll('div')].find(el =>
        window.getComputedStyle(el).position === 'fixed' &&
        parseInt(window.getComputedStyle(el).zIndex) >= 200 &&
        el !== banner
      );
      return {
        bannerZ:  banner  ? window.getComputedStyle(banner).zIndex  : null,
        overlayZ: overlay ? window.getComputedStyle(overlay).zIndex : null,
      };
    });
    console.log('BANNER_Z='  + zValues.bannerZ);
    console.log('OVERLAY_Z=' + zValues.overlayZ);
    console.log('MODAL_ABOVE_BANNER=' + (parseInt(zValues.overlayZ) > parseInt(zValues.bannerZ)));

    // Close modal
    const closeBtn = await page.$('button:has-text("✕")');
    if (closeBtn) { await closeBtn.click(); await page.waitForTimeout(400); }
  }

  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
