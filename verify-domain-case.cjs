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

  await (await page.$('button:has-text("+ Post")')).click();
  await page.waitForTimeout(1000);

  await (await page.$('textarea')).fill('Testing domain casing');
  await (await page.$('button[class*="tag"]') || await page.$('.compose-tag-btn')).click();
  await page.waitForTimeout(200);

  const linkInput = await page.$('input[placeholder*="http"]') || await page.$('.compose-link-input');
  await linkInput.fill('https://github.com/vercel/next.js');
  await (await page.$('button:has-text("Preview")')).click();
  await page.waitForTimeout(5000);

  await page.screenshot({ path: SS + '/domain-case-github.png' });

  const domainEl = await page.$('.link-preview-domain');
  const domainText = domainEl ? await domainEl.innerText() : 'NOT FOUND';
  const domainStyle = domainEl ? await domainEl.evaluate(el => window.getComputedStyle(el).textTransform) : 'N/A';
  console.log('DOMAIN_TEXT=' + domainText);
  console.log('TEXT_TRANSFORM=' + domainStyle);
  console.log('IS_UPPERCASE=' + (domainText === domainText.toUpperCase() && domainText.length > 0));

  // Also test YouTube
  const closeCard = await page.$('.link-preview-close') || await page.$('button[aria-label="Remove link"]');
  if (closeCard) {
    await closeCard.click();
    await page.waitForTimeout(300);
    const li2 = await page.$('input[placeholder*="http"]') || await page.$('.compose-link-input');
    await li2.fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await (await page.$('button:has-text("Preview")')).click();
    await page.waitForTimeout(5000);
    await page.screenshot({ path: SS + '/domain-case-youtube.png' });
    const ytDomain = await page.$eval('.link-preview-domain', el => el.innerText).catch(() => 'NULL');
    console.log('YOUTUBE_DOMAIN=' + ytDomain);
  }

  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
