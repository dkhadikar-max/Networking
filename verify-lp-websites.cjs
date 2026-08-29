const { chromium } = require('playwright');
const jwt = require('jsonwebtoken');
const TOKEN = jwt.sign({ id: '948bf34b-b3d6-4a8b-a6a8-2c34f2fb1b8b', email: 'dkhadikar@gmail.com' }, 'abdplcwersthjacb12344', { expiresIn: '1h' });

const URLS = [
  { label: 'Vercel (SaaS)',         url: 'https://vercel.com' },
  { label: 'Stripe (SaaS)',         url: 'https://stripe.com' },
  { label: 'Notion (product)',      url: 'https://notion.so' },
  { label: 'Linear (product)',      url: 'https://linear.app' },
  { label: 'Y Combinator',         url: 'https://ycombinator.com' },
  { label: 'Indie Hackers',        url: 'https://indiehackers.com' },
  { label: 'BYN itself',           url: 'https://buildyournetwork.online' },
  { label: 'WordPress blog',       url: 'https://wordpress.com' },
  { label: 'Webflow site',         url: 'https://webflow.com' },
  { label: 'Beehiiv newsletter',   url: 'https://beehiiv.com' },
  { label: 'Framer site',          url: 'https://framer.com' },
  { label: 'Squarespace',          url: 'https://squarespace.com' },
];

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);

  await page.goto('https://buildyournetwork.online', { waitUntil: 'domcontentloaded' });
  await page.evaluate(t => localStorage.setItem('byn_token', t), TOKEN);
  await page.goto('https://buildyournetwork.online/circles', { waitUntil: 'networkidle' });

  let pass = 0, noTitle = 0, noImage = 0, fail = 0;

  for (const { label, url } of URLS) {
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

    const ok = result.status === 200;
    const b = result.body;
    if (ok) {
      const hasTitle = !!b.title;
      const hasImg = !!b.image;
      const flag = (!hasTitle || !hasImg) ? ' ⚠️' : ' ✅';
      console.log(`[200${flag}] ${label}`);
      console.log(`  title:  ${b.title ? b.title.slice(0, 70) : 'NULL'}`);
      console.log(`  image:  ${b.image ? b.image.slice(0, 70) : 'NULL'}`);
      console.log(`  domain: ${b.domain}`);
      pass++;
      if (!hasTitle) noTitle++;
      if (!hasImg) noImage++;
    } else {
      console.log(`[${result.status} ❌] ${label} — ${b.error}`);
      fail++;
    }
  }

  console.log(`\nSUMMARY: ${pass} ok (${noTitle} no-title, ${noImage} no-image), ${fail} failed`);
  await browser.close();
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
