const { chromium } = require('playwright');
const jwt = require('jsonwebtoken');
const SS = 'C:/Networking/screenshots';
const TOKEN = jwt.sign({ id: '948bf34b-b3d6-4a8b-a6a8-2c34f2fb1b8b', email: 'dkhadikar@gmail.com' }, 'abdplcwersthjacb12344', { expiresIn: '1h' });

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(25000);

  await page.goto('https://buildyournetwork.online', { waitUntil: 'domcontentloaded' });
  await page.evaluate(t => localStorage.setItem('byn_token', t), TOKEN);
  await page.goto('https://buildyournetwork.online/circles', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const accept = await page.$('button:has-text("Accept")');
  if (accept) { await accept.click(); await page.waitForTimeout(300); }

  const allBtn = await page.$('button:has-text("All")');
  if (allBtn) { await allBtn.click(); await page.waitForTimeout(1500); }

  await page.screenshot({ path: SS + '/shadow-01-feed.png' });

  const card = await page.$('.circle-post');
  if (card) {
    const shadow = await card.evaluate(el => window.getComputedStyle(el).boxShadow);
    console.log('BOX_SHADOW=' + shadow);
    console.log('HAS_SHADOW=' + (shadow !== 'none'));
    await card.screenshot({ path: SS + '/shadow-02-card.png' });
    console.log('SCREENSHOT: card closeup');
  } else {
    console.log('NO CARD FOUND');
  }

  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
