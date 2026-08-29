const { chromium } = require('playwright');
const jwt = require('jsonwebtoken');
const SS = 'C:/Networking/screenshots';
const TOKEN = jwt.sign({ id: '948bf34b-b3d6-4a8b-a6a8-2c34f2fb1b8b', email: 'dkhadikar@gmail.com' }, 'abdplcwersthjacb12344', { expiresIn: '1h' });

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(40000);

  await page.goto('https://buildyournetwork.online', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.evaluate(t => localStorage.setItem('byn_token', t), TOKEN);
  await page.goto('https://buildyournetwork.online/circles', { waitUntil: 'networkidle', timeout: 40000 });
  await page.waitForTimeout(2500);

  // Switch to All so post is visible
  const allBtn = await page.$('button:has-text("All")');
  if (allBtn) { await allBtn.click(); await page.waitForTimeout(1500); }

  const result = await page.evaluate(() => {
    const body = document.querySelector('.circle-post-body');
    if (!body) return { error: 'no .circle-post-body found' };
    const cs = window.getComputedStyle(body);

    // Walk parents collecting color
    const chain = [];
    let cur = body;
    while (cur && cur !== document.body) {
      const s = window.getComputedStyle(cur);
      chain.push(`${cur.tagName}.${[...cur.classList].join('.')} color=${s.color}`);
      cur = cur.parentElement;
    }

    return {
      color: cs.color,
      cssText: cs.cssText.slice(0, 300),
      chain,
    };
  });

  console.log('BODY_COMPUTED_COLOR=' + result.color);
  console.log('ERROR=' + (result.error || 'none'));
  console.log('\nPARENT CHAIN:');
  (result.chain || []).forEach(l => console.log(' ', l));

  // Screenshot the card zoomed in — full resolution
  const card = await page.$('.circle-post');
  if (card) {
    await card.screenshot({ path: SS + '/textcolor-card.png' });
    console.log('\nSCREENSHOT: card');
  }

  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
