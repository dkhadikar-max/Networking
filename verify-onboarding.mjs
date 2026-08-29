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
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); } catch { resolve(raw); }
      });
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
      if (lbl && lbl.toLowerCase().includes('cookie')) {
        d.style.display = 'none';
        d.style.visibility = 'hidden';
      }
    });
  });
}

async function shot(page, name) {
  const p = path.join(SS_DIR, `onboarding-${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  console.log(`  📸 ${name}: ${p}`);
  return p;
}

async function main() {
  // 1. Create test account
  const ts = Date.now();
  const email = `testob${ts}@byn.test`;
  const pass = 'Test1234!';
  console.log(`\n[1] Creating test account: ${email}`);
  const signup = await post(`${SITE}/api/signup`, { name: 'OB Tester', email, password: pass, age_confirmed: true });

  if (!signup.token) {
    console.error('Signup failed:', JSON.stringify(signup));
    process.exit(1);
  }
  const token = signup.token;
  console.log(`  ✅ Got token: ${token.slice(0, 20)}...`);

  // 2. Launch browser
  console.log('\n[2] Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); // iPhone 14 size
  const page = await ctx.newPage();

  try {
    // 3. Inject token into site
    console.log('\n[3] Injecting auth token...');
    await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.evaluate((t) => localStorage.setItem('byn_token', t), token);
    console.log('  ✅ Token injected');

    // 4. Navigate to onboarding
    console.log('\n[4] Navigating to /onboarding...');
    await page.goto(`${SITE}/onboarding`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);

    // Dismiss cookie consent if present
    const cookieBtn = page.locator('[role="dialog"][aria-label*="Cookie"] button, [role="dialog"][aria-label*="cookie"] button').filter({ hasText: /accept|ok|got it|agree|allow/i }).first();
    if (await cookieBtn.count() > 0) {
      await cookieBtn.click({ force: true });
      console.log('  ✅ Dismissed cookie consent');
      await page.waitForTimeout(500);
    } else {
      // Try force-hiding via JS
      await page.evaluate(() => {
        const dialogs = document.querySelectorAll('[role="dialog"]');
        dialogs.forEach(function(d) { var lbl = d.getAttribute('aria-label'); if (lbl && lbl.toLowerCase().includes('cookie')) { d.style.display = 'none'; } });
      });
    }
    await shot(page, '1-arrival');

    // Check header elements
    const headerText = await page.locator('header').textContent().catch(() => null);
    console.log(`  Header text: ${headerText?.trim().slice(0, 80)}`);

    // Check for progress bars
    const progressBars = await page.locator('div[style*="height: 3px"], div[style*="height:3px"]').count();
    console.log(`  Progress bar segments found: ${progressBars}`);

    // Check for NetworkBackground canvas
    const canvas = await page.locator('canvas').count();
    console.log(`  Canvas elements: ${canvas}`);

    // Check step heading
    const h2 = await page.locator('h2').first().textContent().catch(() => null);
    console.log(`  Step heading: ${h2}`);

    // 5. Stage 1 — Acquisition source
    console.log('\n[5] Stage 1: Acquisition source...');
    // Look for source option cards
    const sourceCards = await page.locator('button').filter({ hasText: /twitter|linkedin|google|friend|event|other/i }).count();
    console.log(`  Source cards found: ${sourceCards}`);

    // Click the first source card
    const firstCard = page.locator('button').filter({ hasText: /twitter|linkedin|google|friend|event|other/i }).first();
    if (await firstCard.count() > 0) {
      await firstCard.click();
      await page.waitForTimeout(500);
      await shot(page, '2-source-selected');
      console.log('  ✅ Clicked source card');
    } else {
      // Try any button that might be a source
      const allBtns = await page.locator('div[role="button"], button').all();
      console.log(`  Total clickable elements: ${allBtns.length}`);
      await shot(page, '2-source-stage');
    }

    // Click continue/next
    await dismissCookies(page);
    const nextBtn = page.locator('button').filter({ hasText: /next|continue|→/i }).first();
    if (await nextBtn.count() > 0) {
      await nextBtn.click();
      console.log('  ✅ Clicked Continue');
      // Wait for stage transition (API call + framer-motion exit/enter)
      await page.waitForTimeout(2500);
    }
    await shot(page, '3-after-source-next');

    // 6. Stage 2 — Intent
    console.log('\n[6] Stage 2: Intent selector...');
    const intentH2 = await page.locator('h2').first().textContent().catch(() => null);
    console.log(`  Stage heading: ${intentH2}`);
    await shot(page, '4-intent-stage');

    // Click first intent card (motion.button elements without explicit type)
    const intentCards = await page.locator('button').filter({ hasText: /Networking|Opportunity|Startup|Co-founder|Hiring|Client|Mentor|Learn|Community|Investment/i }).all();
    console.log(`  Intent buttons: ${intentCards.length}`);
    if (intentCards.length > 0) {
      await intentCards[0].click();
      await page.waitForTimeout(400);
      await shot(page, '5-intent-selected');
    }

    // Click next
    await dismissCookies(page);
    const intentNext = page.locator('button').filter({ hasText: /next|continue|→/i }).first();
    if (await intentNext.count() > 0) {
      await intentNext.click();
      console.log('  ✅ Clicked Continue on intent stage');
      await page.waitForTimeout(2500);
    }
    await shot(page, '6-after-intent-next');

    // 7. Stage 3 — Profile completion
    console.log('\n[7] Stage 3: Profile completion...');
    const profileH2 = await page.locator('h2').first().textContent().catch(() => null);
    console.log(`  Stage heading: ${profileH2}`);
    await shot(page, '7-profile-stage');

    // Fill in headline
    const headlineInput = page.locator('input[placeholder*="Founder"], input[placeholder*="headline"]').first();
    if (await headlineInput.count() > 0) {
      await headlineInput.fill('Founder @ BYN Test');
      console.log('  ✅ Filled headline');
    }

    // Fill location
    const locationInput = page.locator('input[placeholder*="Mumbai"], input[placeholder*="location"]').first();
    if (await locationInput.count() > 0) {
      await locationInput.fill('Mumbai');
      console.log('  ✅ Filled location');
    }

    // Select an interest tag
    const interestBtn = page.locator('button').filter({ hasText: /startups|saas|ai/i }).first();
    if (await interestBtn.count() > 0) {
      await interestBtn.click();
      console.log('  ✅ Clicked interest tag');
    }

    await shot(page, '8-profile-filled');

    // Submit profile
    await dismissCookies(page);
    const finishBtn = page.locator('button[type="submit"]').first();
    if (await finishBtn.count() > 0) {
      await finishBtn.click();
      await page.waitForTimeout(2000);
      console.log('  ✅ Submitted profile');
    }
    await shot(page, '9-after-profile-submit');

    // 8. Stage 4 — Suggested connections / completion
    console.log('\n[8] Stage 4: Completion...');
    const completeH2 = await page.locator('h2').first().textContent().catch(() => null);
    console.log(`  Stage heading: ${completeH2}`);
    await shot(page, '10-completion-stage');

    // Check for "You're in" text
    const bodyText = await page.locator('body').textContent();
    const hasYoureIn = bodyText.includes("You're in") || bodyText.includes("You’re in");
    console.log(`  "You're in" header: ${hasYoureIn ? '✅' : '❌'}`);

    // Check for WhatsApp share button
    const waBtn = await page.locator('a[href*="wa.me"]').count();
    console.log(`  WhatsApp share button: ${waBtn > 0 ? '✅' : '❌'}`);

    // Check amber CTA (Go to my feed)
    const feedBtn = await page.locator('button').filter({ hasText: /feed|go/i }).count();
    console.log(`  Feed CTA button: ${feedBtn > 0 ? '✅' : '❌'}`);

    console.log('\n[9] Visual checks...');
    // Check brand colors in page source
    const pageSource = await page.content();
    const hasAmberCTA = pageSource.includes('#F4A259');
    const hasPrimaryGreen = pageSource.includes('#157A6E');
    const hasGlassHeader = pageSource.includes('blur');
    console.log(`  Amber CTA color (#F4A259): ${hasAmberCTA ? '✅' : '❌'}`);
    console.log(`  Primary green (#157A6E): ${hasPrimaryGreen ? '✅' : '❌'}`);
    console.log(`  Blur/glass header: ${hasGlassHeader ? '✅' : '❌'}`);

    console.log('\n✅ Onboarding verification complete. Screenshots saved to:', SS_DIR);

  } catch (err) {
    console.error('\n❌ Error during verification:', err.message);
    await shot(page, 'error-state');
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
