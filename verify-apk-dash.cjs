const { chromium } = require('playwright');
const SS = 'C:/Networking/screenshots';

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);

  await page.goto('https://buildyournetwork.online', { waitUntil: 'networkidle', timeout: 40000 });
  await page.waitForTimeout(2000);

  const cookie = await page.$('button:has-text("Accept")');
  if (cookie) { await cookie.click(); await page.waitForTimeout(500); }

  // Screenshot hero section
  await page.screenshot({ path: SS + '/apk-dash-00-hero.png' });
  console.log('SCREENSHOT: hero');

  // Check for APK anywhere on page
  const apkText = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const hits = [];
    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent.includes('APK')) hits.push(node.textContent.trim().slice(0, 80));
    }
    return hits;
  });
  console.log('APK_HITS=' + apkText.length + ' (expect 0)');
  if (apkText.length) apkText.forEach(t => console.log('  APK_TEXT:', JSON.stringify(t)));

  // Check CTA buttons for em-dash
  const ctaButtons = await page.$$eval('a.btn-primary, a.download-btn', els =>
    els.map(el => el.textContent?.trim())
  );
  console.log('CTA_BUTTONS:', JSON.stringify(ctaButtons));
  const hasEmDash = ctaButtons.some(t => t && t.includes('—'));
  console.log('CTA_HAS_EMDASH=' + hasEmDash + ' (expect false)');

  // Scroll to download section and screenshot
  await page.evaluate(() => document.querySelector('#download')?.scrollIntoView());
  await page.waitForTimeout(800);
  await page.screenshot({ path: SS + '/apk-dash-01-download.png' });
  console.log('SCREENSHOT: download section');

  // Scroll to footer and screenshot
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(600);
  await page.screenshot({ path: SS + '/apk-dash-02-footer.png' });
  console.log('SCREENSHOT: footer');

  // Check footer for APK link
  const footerApk = await page.$('footer a[href*="android"]');
  console.log('FOOTER_APK_LINK=' + !!footerApk + ' (expect false)');

  // Check mobile nav for APK (open menu)
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  const menuBtn = await page.$('button[aria-label="Menu"]');
  if (menuBtn) {
    await menuBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: SS + '/apk-dash-03-mobilenav.png' });
    console.log('SCREENSHOT: mobile nav');
    const navApk = await page.$('.nav-links a[href*="android"]');
    console.log('NAV_APK_LINK=' + !!navApk + ' (expect false)');
    const navLinks = await page.$$eval('.nav-links a', els => els.map(el => el.textContent?.trim()));
    console.log('NAV_LINKS:', JSON.stringify(navLinks));
  }

  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
