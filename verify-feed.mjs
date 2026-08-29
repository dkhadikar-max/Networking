import { chromium } from 'file:///C:/Users/dell/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE = 'https://buildyournetwork.online';
const SS_DIR = path.join(__dirname, 'screenshots');
if (!fs.existsSync(SS_DIR)) fs.mkdirSync(SS_DIR, { recursive: true });

function post(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request({ hostname: u.hostname, path: u.pathname, port: u.port || undefined, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (res) => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve(raw); } });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function dismissCookies(page) {
  await page.evaluate(function() {
    document.querySelectorAll('[role="dialog"]').forEach(function(d) {
      var lbl = d.getAttribute('aria-label');
      if (lbl && lbl.toLowerCase().includes('cookie')) { d.style.display = 'none'; }
    });
  });
}

async function shot(page, name) {
  const p = path.join(SS_DIR, `feed-${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  console.log(`  📸 ${name}: ${p}`);
  return p;
}

async function main() {
  // Create a test account that has completed onboarding
  const ts = Date.now();
  const email = `feedtest${ts}@byn.test`;
  console.log(`\n[1] Creating account: ${email}`);
  const signup = await post(`${SITE}/api/signup`, { name: 'Feed Tester', email, password: 'Test1234!', age_confirmed: true });
  if (!signup.token) { console.error('Signup failed:', signup); process.exit(1); }
  const token = signup.token;
  console.log('  ✅ Got token');

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

  try {
    // Inject token
    await page.goto(SITE, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => localStorage.setItem('byn_token', t), token);

    // Navigate directly to the discover/feed page
    console.log('\n[2] Navigating to /discover...');
    await page.goto(`${SITE}/discover`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    await dismissCookies(page);
    await shot(page, '1-discover-landing');

    const heading = await page.locator('h1, h2').first().textContent().catch(() => null);
    console.log(`  Page heading: ${heading}`);

    const url = page.url();
    console.log(`  Current URL: ${url}`);

    // Check for swipe cards or empty state
    const cards = await page.locator('[class*="card"], [class*="swipe"]').count();
    console.log(`  Card elements: ${cards}`);

    // Scroll down a bit and screenshot
    await page.evaluate(() => window.scrollBy(0, 200));
    await page.waitForTimeout(500);
    await shot(page, '2-discover-scrolled');

    // Now test the "Go to my feed" button by running through onboarding
    console.log('\n[3] Testing "Go to my feed" button from onboarding completion...');
    const email2 = `feedtest2${ts}@byn.test`;
    const signup2 = await post(`${SITE}/api/signup`, { name: 'Feed Tester 2', email: email2, password: 'Test1234!', age_confirmed: true });
    if (!signup2.token) { console.error('Signup2 failed:', signup2); process.exit(1); }

    await page.evaluate((t) => localStorage.setItem('byn_token', t), signup2.token);
    await page.goto(`${SITE}/onboarding`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);
    await dismissCookies(page);

    // Stage 1: pick source
    const srcCard = page.locator('button').filter({ hasText: /linkedin|twitter|instagram|whatsapp|friend|google|community|youtube|other/i }).first();
    if (await srcCard.count()) { await srcCard.click(); await page.waitForTimeout(300); }
    await dismissCookies(page);
    const continueBtn = page.locator('button').filter({ hasText: /continue/i }).first();
    if (await continueBtn.count()) { await continueBtn.click(); await page.waitForTimeout(2500); }

    // Stage 2: pick intent
    await dismissCookies(page);
    const intentCard = page.locator('button').filter({ hasText: /Networking|Hiring|Community/i }).first();
    if (await intentCard.count()) { await intentCard.click(); await page.waitForTimeout(300); }
    await dismissCookies(page);
    const intentContinue = page.locator('button').filter({ hasText: /continue/i }).first();
    if (await intentContinue.count()) { await intentContinue.click(); await page.waitForTimeout(2500); }

    // Stage 3: submit profile
    await dismissCookies(page);
    const submitBtn = page.locator('button[type="submit"]').first();
    if (await submitBtn.count()) { await submitBtn.click(); await page.waitForTimeout(3000); }

    // Stage 4: completion — click "Go to my feed"
    await dismissCookies(page);
    await shot(page, '3-completion-before-feed-click');
    const feedBtn = page.locator('button').filter({ hasText: /feed/i }).first();
    console.log(`  "Go to my feed" button found: ${await feedBtn.count() > 0 ? '✅' : '❌'}`);

    if (await feedBtn.count() > 0) {
      await feedBtn.click();
      await page.waitForTimeout(3000);
      const afterUrl = page.url();
      console.log(`  After click URL: ${afterUrl}`);
      await dismissCookies(page);
      await shot(page, '4-after-feed-click');

      const landed = afterUrl.includes('/discover') || afterUrl.includes('/feed') || afterUrl.includes('/app');
      console.log(`  Landed on feed/discover: ${landed ? '✅' : '⚠️  ' + afterUrl}`);
    }

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    await shot(page, 'error');
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
