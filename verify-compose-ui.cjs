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
  await page.waitForTimeout(1500);

  // Dismiss cookie banner
  const accept = await page.$('button:has-text("Accept")');
  if (accept) { await accept.click(); await page.waitForTimeout(300); }

  // Screenshot the Circles feed first
  await page.screenshot({ path: SS + '/compose-00-circles-feed.png', fullPage: false });
  console.log('SCREENSHOT: circles feed');

  // Find and click compose / post button
  const postBtn = await page.$('button:has-text("+ Post")') || await page.$('[class*="compose"]') || await page.$('button:has-text("Post")');
  if (!postBtn) {
    // Try floating action button
    const fab = await page.$('button[class*="fab"]') || await page.$('button[aria-label*="post"]') || await page.$('button[aria-label*="Post"]');
    if (!fab) {
      console.log('POST_BUTTON_NOT_FOUND — dumping all buttons:');
      const btns = await page.$$eval('button', els => els.map(el => ({ text: el.textContent?.trim().slice(0,40), cls: el.className })));
      console.log(JSON.stringify(btns, null, 2));
      await page.screenshot({ path: SS + '/compose-00-no-button.png' });
      await browser.close();
      return;
    }
    await fab.click();
  } else {
    await postBtn.click();
  }
  await page.waitForTimeout(1000);
  await page.screenshot({ path: SS + '/compose-01-open.png', fullPage: false });
  console.log('SCREENSHOT: compose open');

  // Log what DOM is visible in compose
  const composeDom = await page.evaluate(() => {
    const modal = document.querySelector('[class*="compose"]') || document.querySelector('[role="dialog"]');
    return modal ? modal.innerHTML.slice(0, 2000) : 'NO COMPOSE MODAL FOUND';
  });
  console.log('COMPOSE_DOM_SNIPPET:', composeDom.slice(0, 500));

  // Fill text
  const textarea = await page.$('textarea') || await page.$('[contenteditable="true"]');
  if (textarea) {
    await textarea.fill('Checking out this awesome project!');
    await page.waitForTimeout(300);
  }

  // Pick first tag if available
  const tagBtn = await page.$('[class*="tag-btn"]') || await page.$('[class*="compose-tag"]') || await page.$('button[class*="tag"]');
  if (tagBtn) { await tagBtn.click(); await page.waitForTimeout(200); }

  await page.screenshot({ path: SS + '/compose-02-text-entered.png', fullPage: false });
  console.log('SCREENSHOT: text entered');

  // Look for link input
  const linkInput = await page.$('input[placeholder*="http"]') || await page.$('input[type="url"]') || await page.$('[class*="link-input"]') || await page.$('input[placeholder*="link"]') || await page.$('input[placeholder*="Link"]') || await page.$('input[placeholder*="URL"]');
  console.log('LINK_INPUT_FOUND=' + !!linkInput);

  if (linkInput) {
    await linkInput.fill('https://github.com/vercel/next.js');
    await page.screenshot({ path: SS + '/compose-03-link-typed.png', fullPage: false });
    console.log('SCREENSHOT: link typed');

    // Find fetch/preview button
    const fetchBtn = await page.$('button:has-text("Preview")') || await page.$('button:has-text("Fetch")') || await page.$('button:has-text("Add")') || await page.$('[class*="link-fetch"]') || await page.$('[class*="fetch-btn"]');
    console.log('FETCH_BTN_FOUND=' + !!fetchBtn);

    if (fetchBtn) {
      await fetchBtn.click();
    } else {
      // Try pressing Enter in the link input
      await linkInput.press('Enter');
    }

    await page.waitForTimeout(5000);
    await page.screenshot({ path: SS + '/compose-04-preview-fetched.png', fullPage: false });
    console.log('SCREENSHOT: after preview fetch');

    // Check for preview card
    const previewCard = await page.$('[class*="link-preview"]') || await page.$('[class*="preview-card"]') || await page.$('[class*="preview"]');
    const previewImg  = await page.$('[class*="link-preview"] img') || await page.$('[class*="preview"] img');
    const previewTitle = await page.$('[class*="preview-title"]') || await page.$('[class*="link-preview"] h3') || await page.$('[class*="link-preview"] strong');
    const previewDomain = await page.$('[class*="preview-domain"]') || await page.$('[class*="domain"]');

    console.log('PREVIEW_CARD=' + !!previewCard);
    console.log('PREVIEW_IMG=' + !!previewImg);
    console.log('PREVIEW_TITLE=' + (previewTitle ? await previewTitle.innerText() : 'NULL'));
    console.log('PREVIEW_DOMAIN=' + (previewDomain ? await previewDomain.innerText() : 'NULL'));

    if (previewCard) {
      const box = await previewCard.boundingBox();
      console.log('PREVIEW_CARD_BOX=' + JSON.stringify(box));
      // Crop screenshot to just the compose area
    }
  } else {
    // Dump all inputs
    const inputs = await page.$$eval('input', els => els.map(el => ({ type: el.type, placeholder: el.placeholder, cls: el.className })));
    console.log('ALL_INPUTS:', JSON.stringify(inputs));
  }

  // Also test with a YouTube URL
  if (linkInput) {
    const clearBtn = await page.$('[class*="clear"]') || await page.$('button[aria-label="Remove link"]');
    if (clearBtn) await clearBtn.click();
    await page.waitForTimeout(300);

    // Re-find or reuse
    const li2 = await page.$('input[placeholder*="http"]') || await page.$('input[type="url"]') || await page.$('[class*="link-input"]');
    if (li2) {
      await li2.fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      const fb2 = await page.$('button:has-text("Preview")') || await page.$('button:has-text("Fetch")') || await page.$('button:has-text("Add")') || await page.$('[class*="fetch-btn"]');
      if (fb2) { await fb2.click(); } else { await li2.press('Enter'); }
      await page.waitForTimeout(5000);
      await page.screenshot({ path: SS + '/compose-05-youtube-preview.png', fullPage: false });
      console.log('SCREENSHOT: YouTube preview');
      const ytTitle = await page.$eval('[class*="preview-title"]', el => el.innerText).catch(() => null) || await page.$eval('[class*="link-preview"]', el => el.textContent?.slice(0,100)).catch(() => 'NULL');
      console.log('YOUTUBE_TITLE=' + ytTitle);
    }
  }

  await browser.close();
  console.log('\nDONE');
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
