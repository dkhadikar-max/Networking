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

  const body = await page.$('.circle-post-body');
  if (!body) { console.log('NO BODY ELEMENT'); await browser.close(); return; }

  const styles = await body.evaluate(el => {
    const cs = window.getComputedStyle(el);
    return {
      color:           cs.color,
      backgroundColor: cs.backgroundColor,
      fontWeight:      cs.fontWeight,
      fontSize:        cs.fontSize,
      // Walk up the DOM and collect colors
      parents: (() => {
        const chain = [];
        let cur = el.parentElement;
        for (let i = 0; i < 8 && cur; i++) {
          const s = window.getComputedStyle(cur);
          chain.push({ tag: cur.tagName, cls: cur.className.slice(0,60), color: s.color, bg: s.backgroundColor });
          cur = cur.parentElement;
        }
        return chain;
      })(),
    };
  });

  console.log('BODY_COLOR=' + styles.color);
  console.log('BODY_BG=' + styles.backgroundColor);
  console.log('BODY_FONT_WEIGHT=' + styles.fontWeight);
  console.log('BODY_FONT_SIZE=' + styles.fontSize);
  console.log('\nPARENT COLOR CHAIN:');
  styles.parents.forEach(p => console.log(`  ${p.tag}.${p.cls} → color:${p.color} bg:${p.bg}`));

  // Screenshot with highlighted body text element
  await page.evaluate(() => {
    const el = document.querySelector('.circle-post-body');
    if (el) el.style.outline = '2px solid blue';
  });
  await page.screenshot({ path: SS + '/textcolor-01-highlighted.png' });
  console.log('\nSCREENSHOT: body highlighted');

  // Remove highlight and take clean screenshot
  await page.evaluate(() => {
    const el = document.querySelector('.circle-post-body');
    if (el) el.style.outline = '';
  });
  await page.screenshot({ path: SS + '/textcolor-02-clean.png' });
  console.log('SCREENSHOT: clean');

  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
