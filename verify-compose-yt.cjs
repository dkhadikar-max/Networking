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

  const postBtn = await page.$('button:has-text("+ Post")');
  if (!postBtn) { console.log('NO POST BTN'); await browser.close(); return; }
  await postBtn.click();
  await page.waitForTimeout(1200);

  const textarea = await page.$('textarea');
  if (textarea) await textarea.fill('Watch this!');

  const firstTag = await page.$('.compose-tag-btn') || await page.$('button[class*="tag"]');
  if (firstTag) await firstTag.click();
  await page.waitForTimeout(200);

  const linkInput = await page.$('input[placeholder*="http"]') || await page.$('.compose-link-input');
  if (!linkInput) { console.log('NO LINK INPUT'); await browser.close(); return; }
  await linkInput.fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

  const fetchBtn = await page.$('button:has-text("Preview")') || await page.$('.compose-link-fetch-btn');
  if (!fetchBtn) { console.log('NO FETCH BTN'); await browser.close(); return; }
  await fetchBtn.click();
  await page.waitForTimeout(6000);

  await page.screenshot({ path: SS + '/compose-05-youtube-preview.png', fullPage: false });
  console.log('SCREENSHOT: youtube preview');

  const cardText = await page.$eval('[class*="link-preview"]', el => el.textContent?.trim().slice(0, 200)).catch(() => 'NO CARD');
  console.log('CARD_TEXT=' + cardText);

  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
