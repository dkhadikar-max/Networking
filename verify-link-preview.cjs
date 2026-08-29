const { chromium } = require('playwright');
const jwt = require('jsonwebtoken');
const SS = 'C:/Networking/screenshots';
const TOKEN = jwt.sign({ id: '948bf34b-b3d6-4a8b-a6a8-2c34f2fb1b8b', email: 'dkhadikar@gmail.com' }, 'abdplcwersthjacb12344', { expiresIn: '1h' });

const TEST_URLS = [
  { label: 'GitHub repo',        url: 'https://github.com/vercel/next.js' },
  { label: 'Product Hunt',       url: 'https://www.producthunt.com' },
  { label: 'Medium article',     url: 'https://medium.com' },
  { label: 'YouTube video',      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
  { label: 'LinkedIn public',    url: 'https://www.linkedin.com/in/satyanadella' },
  { label: 'Twitter/X profile',  url: 'https://x.com/elonmusk' },
  { label: 'Substack',           url: 'https://substack.com' },
  { label: 'HN post',            url: 'https://news.ycombinator.com' },
  { label: 'Dev.to article',     url: 'https://dev.to' },
  { label: 'Invalid URL',        url: 'not-a-url' },
  { label: 'Non-HTML (image)',   url: 'https://via.placeholder.com/300.png' },
];

async function testPreview(page, token, label, url) {
  const result = await page.evaluate(async ({ token, url }) => {
    const r = await fetch('/api/circles/link-preview', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    let body;
    try { body = await r.json(); } catch { body = { error: 'non-JSON response (status ' + r.status + ')' }; }
    return { status: r.status, body };
  }, { token, url });

  const ok = result.status === 200;
  const b = result.body;
  console.log(`[${result.status}] ${label}`);
  if (ok) {
    console.log(`  title:  ${b.title ? b.title.slice(0, 70) : 'NULL'}`);
    console.log(`  desc:   ${b.description ? b.description.slice(0, 70) : 'NULL'}`);
    console.log(`  image:  ${b.image ? 'YES (' + b.image.slice(0, 60) + ')' : 'NO'}`);
    console.log(`  domain: ${b.domain}`);
  } else {
    console.log(`  error:  ${b.error}`);
  }
  return { label, url, status: result.status, ok, title: b.title, image: !!b.image, domain: b.domain, error: b.error };
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);

  await page.goto('https://buildyournetwork.online', { waitUntil: 'domcontentloaded' });
  await page.evaluate(t => localStorage.setItem('byn_token', t), TOKEN);
  await page.goto('https://buildyournetwork.online/circles', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Dismiss cookie banner
  const accept = await page.$('button:has-text("Accept")');
  if (accept) { await accept.click(); await page.waitForTimeout(300); }

  console.log('=== API TESTS ===');
  const results = [];
  for (const { label, url } of TEST_URLS) {
    const r = await testPreview(page, TOKEN, label, url);
    results.push(r);
  }

  // Cache test — same URL twice, second should be instant
  console.log('\n=== CACHE TEST ===');
  const t0 = Date.now();
  await testPreview(page, TOKEN, 'GitHub (cached)', 'https://github.com/vercel/next.js');
  console.log(`  cache round-trip: ${Date.now() - t0}ms (should be <200ms if cached)`);

  // UI test — open compose, attach a link, screenshot the card
  console.log('\n=== COMPOSE UI TEST ===');
  const postBtn = await page.$('button:has-text("+ Post")');
  if (postBtn) {
    await postBtn.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: SS + '/lp-01-compose-open.png' });

    // Type text + pick a tag so the form is valid
    await page.fill('.compose-textarea', 'Testing link preview in Circles post');
    await page.click('.compose-tag-btn:first-child');

    // Enter a GitHub URL and fetch preview
    const linkInput = await page.$('.compose-link-input');
    if (linkInput) {
      await linkInput.fill('https://github.com/vercel/next.js');
      await page.click('.compose-link-fetch-btn');
      await page.waitForTimeout(4000); // give fetch time
      await page.screenshot({ path: SS + '/lp-02-preview-fetched.png' });

      const previewCard = await page.$('.link-preview');
      const imgEl      = await page.$('.link-preview-img');
      const titleEl    = await page.$('.link-preview-title');
      const domainEl   = await page.$('.link-preview-domain');
      console.log('PREVIEW_CARD_VISIBLE=' + !!previewCard);
      console.log('IMAGE_VISIBLE=' + !!imgEl);
      console.log('TITLE=' + (titleEl ? await titleEl.innerText() : 'NULL'));
      console.log('DOMAIN=' + (domainEl ? await domainEl.innerText() : 'NULL'));
    }

    // Close compose
    await page.keyboard.press('Escape');
  }

  // Summary
  const passed  = results.filter(r => r.ok).length;
  const blocked = results.filter(r => !r.ok && r.status === 502).length;
  const invalid = results.filter(r => !r.ok && r.status === 400).length;
  console.log(`\n=== SUMMARY ===`);
  console.log(`Passed: ${passed}/${TEST_URLS.length}  Blocked/502: ${blocked}  Invalid/400: ${invalid}`);
  results.filter(r => r.ok && !r.title).forEach(r => console.log(`⚠️  No title: ${r.label}`));
  results.filter(r => r.ok && !r.image).forEach(r => console.log(`⚠️  No image: ${r.label}`));

  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
