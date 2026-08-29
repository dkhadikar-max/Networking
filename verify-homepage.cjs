const { chromium } = require('playwright');
const SS = 'C:/Networking/screenshots';

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);

  await page.goto('https://buildyournetwork.online', { waitUntil: 'networkidle', timeout: 40000 });
  await page.waitForTimeout(1500);

  await page.screenshot({ path: SS + '/home-00-top.png', fullPage: false });
  console.log('SCREENSHOT: top');

  await page.evaluate(() => window.scrollBy(0, 844));
  await page.waitForTimeout(500);
  await page.screenshot({ path: SS + '/home-01-scroll1.png', fullPage: false });

  await page.evaluate(() => window.scrollBy(0, 844));
  await page.waitForTimeout(500);
  await page.screenshot({ path: SS + '/home-02-scroll2.png', fullPage: false });

  await page.evaluate(() => window.scrollBy(0, 844));
  await page.waitForTimeout(500);
  await page.screenshot({ path: SS + '/home-03-scroll3.png', fullPage: false });

  await page.evaluate(() => window.scrollBy(0, 844));
  await page.waitForTimeout(500);
  await page.screenshot({ path: SS + '/home-04-scroll4.png', fullPage: false });

  await page.evaluate(() => window.scrollBy(0, 1500));
  await page.waitForTimeout(500);
  await page.screenshot({ path: SS + '/home-05-bottom.png', fullPage: false });

  // Dump all visible text with dashes
  const textWithDashes = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const results = [];
    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent.trim();
      if (text.includes('-') && text.length > 1 && !text.includes('px') && !text.includes('%')) {
        results.push(text.slice(0, 100));
      }
    }
    return [...new Set(results)];
  });
  console.log('\nVISIBLE TEXT WITH DASHES:');
  textWithDashes.forEach(t => console.log(' ', JSON.stringify(t)));

  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
