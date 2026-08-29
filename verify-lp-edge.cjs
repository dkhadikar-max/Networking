const { chromium } = require('playwright');
const jwt = require('jsonwebtoken');
const TOKEN = jwt.sign({ id: '948bf34b-b3d6-4a8b-a6a8-2c34f2fb1b8b', email: 'dkhadikar@gmail.com' }, 'abdplcwersthjacb12344', { expiresIn: '1h' });

const URLS = [
  // Plain / no og: tags
  { label: 'Plain HTML site (example.com)',  url: 'https://example.com' },
  { label: 'Carrd personal site',            url: 'https://carrd.co' },
  { label: 'Super.so (Notion sites)',        url: 'https://super.so' },
  // URL variations
  { label: 'HTTP (not HTTPS)',               url: 'http://example.com' },
  { label: 'URL with path',                  url: 'https://github.com/vercel/next.js/blob/canary/readme.md' },
  { label: 'URL with query params',          url: 'https://www.google.com/search?q=startup+networking' },
  // Indian startup / product sites
  { label: 'Razorpay',                       url: 'https://razorpay.com' },
  { label: 'Zepto',                          url: 'https://www.zeptonow.com' },
  { label: 'AngelList / Wellfound',          url: 'https://wellfound.com' },
  // Slow / heavy sites
  { label: 'Wikipedia article',             url: 'https://en.wikipedia.org/wiki/Startup_ecosystem' },
  // Sites with HTML entities in titles
  { label: 'Squarespace (has &mdash;)',      url: 'https://squarespace.com' },
  // Portfolio builders
  { label: 'Read.cv',                        url: 'https://read.cv' },
];

async function test(page, label, url) {
  const t0 = Date.now();
  const result = await page.evaluate(async ({ token, url }) => {
    const r = await fetch('/api/circles/link-preview', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    let body;
    try { body = await r.json(); } catch { body = { error: 'non-JSON (' + r.status + ')' }; }
    return { status: r.status, body };
  }, { token: TOKEN, url });

  const ms = Date.now() - t0;
  const ok = result.status === 200;
  const b = result.body;
  const flag = !ok ? '❌' : (!b.title || !b.image) ? '⚠️' : '✅';
  console.log(`[${result.status} ${flag}] ${label} (${ms}ms)`);
  if (ok) {
    console.log(`  title:  ${b.title ? b.title.slice(0, 80) : 'NULL'}`);
    console.log(`  image:  ${b.image ? 'YES' : 'NULL'}`);
    console.log(`  domain: ${b.domain}`);
  } else {
    console.log(`  error:  ${b.error}`);
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(25000);

  await page.goto('https://buildyournetwork.online', { waitUntil: 'domcontentloaded' });
  await page.evaluate(t => localStorage.setItem('byn_token', t), TOKEN);
  await page.goto('https://buildyournetwork.online/circles', { waitUntil: 'networkidle' });

  for (const { label, url } of URLS) {
    await test(page, label, url);
  }

  // Check HTML entity decoding specifically
  console.log('\n=== HTML ENTITY DECODE CHECK ===');
  const squarespaceResult = await page.evaluate(async ({ token }) => {
    const r = await fetch('/api/circles/link-preview', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://squarespace.com' })
    });
    const b = await r.json();
    return b.title;
  }, { token: TOKEN });
  const hasEntities = squarespaceResult && (squarespaceResult.includes('&') || squarespaceResult.includes('&#'));
  console.log(`Title: "${squarespaceResult}"`);
  console.log(`Has unescaped entities: ${hasEntities}`);

  await browser.close();
  console.log('\nDONE');
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
