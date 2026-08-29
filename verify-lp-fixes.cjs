const { chromium } = require('playwright');
const jwt = require('jsonwebtoken');
const TOKEN = jwt.sign({ id: '948bf34b-b3d6-4a8b-a6a8-2c34f2fb1b8b', email: 'dkhadikar@gmail.com' }, 'abdplcwersthjacb12344', { expiresIn: '1h' });

const TESTS = [
  { label: 'Zepto (&#x27; hex entity)',      url: 'https://www.zeptonow.com' },
  { label: 'Squarespace (&mdash; named)',     url: 'https://squarespace.com' },
  { label: 'YouTube video (oEmbed)',          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
  { label: 'YouTube short URL (oEmbed)',      url: 'https://youtu.be/dQw4w9WgXcQ' },
  { label: 'Razorpay (baseline ok)',          url: 'https://razorpay.com' },
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
  const hasEntities = ok && b.title && (b.title.includes('&') && b.title.includes(';') || b.title.includes('&#'));
  const flag = !ok ? '❌' : hasEntities ? '⚠️ ENTITIES' : (!b.title || !b.image) ? '⚠️ NO-DATA' : '✅';
  console.log(`[${result.status} ${flag}] ${label} (${ms}ms)`);
  if (ok) {
    console.log(`  title:  ${b.title ? b.title : 'NULL'}`);
    console.log(`  image:  ${b.image ? 'YES' : 'NULL'}`);
    console.log(`  domain: ${b.domain}`);
    if (hasEntities) console.log(`  *** UNESCAPED ENTITIES DETECTED ***`);
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

  for (const { label, url } of TESTS) {
    await test(page, label, url);
  }

  await browser.close();
  console.log('\nDONE');
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
