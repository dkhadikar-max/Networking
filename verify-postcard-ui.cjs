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

  // Switch to All mode
  const allBtn = await page.$('button:has-text("All")');
  if (allBtn) { await allBtn.click(); await page.waitForTimeout(1500); }

  let postCount = await page.$$eval('.circle-post', els => els.length).catch(() => 0);
  console.log('INITIAL_POST_COUNT=' + postCount);

  if (postCount === 0) {
    console.log('Feed empty — creating a test post with link preview...');

    await (await page.$('button:has-text("+ Post")')).click();
    await page.waitForTimeout(1000);

    await (await page.$('textarea')).fill('Just shipped the new Circles feed — For You, Near Me, and All modes with smart ranking and link previews!');

    const firstTag = await page.$('.compose-tag-btn') || await page.$('button[class*="compose-tag"]');
    if (firstTag) { await firstTag.click(); await page.waitForTimeout(200); }

    const linkInput = await page.$('input[placeholder*="http"]') || await page.$('.compose-link-input');
    if (linkInput) {
      await linkInput.fill('https://github.com/vercel/next.js');
      const fetchBtn = await page.$('button:has-text("Preview")') || await page.$('.compose-link-fetch-btn');
      if (fetchBtn) { await fetchBtn.click(); await page.waitForTimeout(5000); }
      await page.screenshot({ path: SS + '/postcard-00-compose.png' });
    }

    const postBtn = await page.$('.compose-post-btn');
    if (postBtn) {
      await postBtn.click();
      // Wait for sheet to close and feed to reload
      await page.waitForSelector('.compose-post-btn', { state: 'detached', timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(3000);
    }
  }

  // Screenshot the feed
  await page.screenshot({ path: SS + '/postcard-01-feed.png', fullPage: false });
  console.log('SCREENSHOT: feed');

  postCount = await page.$$eval('.circle-post', els => els.length).catch(() => 0);
  console.log('POST_COUNT=' + postCount);

  const card = await page.$('.circle-post');
  if (!card) {
    console.log('STILL NO CARD — checking DOM...');
    const body = await page.content();
    console.log('PAGE_BODY_SNIPPET:', body.slice(0, 2000));
    await browser.close();
    return;
  }

  // Screenshot card in isolation
  await card.screenshot({ path: SS + '/postcard-02-card-closeup.png' });
  console.log('SCREENSHOT: card closeup');

  // Measure card structure
  const box = await card.boundingBox();
  console.log('CARD_BOX=' + JSON.stringify(box));

  const checks = {
    avatar:    '.circle-post-avatar',
    name:      '.circle-post-name',
    meta:      '.circle-post-meta',
    time:      '.circle-post-time',
    body:      '.circle-post-body',
    tags:      '.circle-post-tags',
    preview:   '.link-preview',
    actions:   '.circle-post-actions',
    likeBtn:   '.circle-like-btn',
    collabBtn: '.circle-collab-btn',
    editBtn:   '.circle-post-action-btn',
  };

  for (const [key, sel] of Object.entries(checks)) {
    const el = await card.$(sel);
    const text = el ? (await el.innerText().catch(() => '')).trim().slice(0, 60) : null;
    console.log(`${key}: ${el ? '✅' : '❌'}${text ? ' — "' + text + '"' : ''}`);
  }

  // Computed styles on key elements
  const cardStyle = await card.evaluate(el => {
    const s = window.getComputedStyle(el);
    return { bg: s.background, radius: s.borderRadius, shadow: s.boxShadow, padding: s.padding };
  });
  console.log('CARD_STYLES=' + JSON.stringify(cardStyle));

  // Check like button state and count
  const likeBtn = await card.$('.circle-like-btn');
  if (likeBtn) {
    const likeText = await likeBtn.innerText();
    const likeStyle = await likeBtn.evaluate(el => {
      const s = window.getComputedStyle(el);
      return { color: s.color, bg: s.background };
    });
    console.log('LIKE_BTN_TEXT=' + likeText.trim());
    console.log('LIKE_BTN_STYLE=' + JSON.stringify(likeStyle));
  }

  // Check preview domain casing
  const domainEl = await card.$('.link-preview-domain');
  if (domainEl) {
    const domainText = await domainEl.innerText();
    const domainCss = await domainEl.evaluate(el => window.getComputedStyle(el).textTransform);
    console.log('DOMAIN_TEXT=' + domainText);
    console.log('DOMAIN_TRANSFORM=' + domainCss);
  }

  // Scroll and screenshot
  await page.evaluate(() => window.scrollBy(0, 300));
  await page.waitForTimeout(400);
  await page.screenshot({ path: SS + '/postcard-03-feed-scrolled.png' });
  console.log('SCREENSHOT: feed scrolled');

  await browser.close();
  console.log('\nDONE');
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
