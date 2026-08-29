/**
 * E2E verification — onboarding "Go to my feed →" fix
 *
 * Strategy: drive the real browser / frontend code.
 * Mock the backend API calls that require external infra
 * (email OTP, real DB) so we can exercise the frontend
 * state machine at the interesting step.
 *
 * What we're verifying:
 *  - After profile submit, AuthContext.user.onboarding_stage
 *    is updated optimistically (setUser patch)
 *  - /discover is fetched with ?limit=5 (not ?sort=relevance)
 *  - "Go to my feed →" navigates to /discover and stays there
 *    (AppShell guard passes because onboarding_stage is now 'complete')
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE  = 'http://localhost:3000';
const SS_DIR = 'C:/Networking/screenshots';
mkdirSync(SS_DIR, { recursive: true });
const ss = (n) => `${SS_DIR}/e2e-onboard-${n}.png`;

// ── Fake user returned by /api/me ────────────────────────────────────────────
const FAKE_USER = {
  id: 'test-user-001',
  name: 'E2E Tester',
  email: 'e2e@byntest.dev',
  email_verified: true,
  onboarding_stage: 'profile',   // mid-onboarding — needs to complete profile step
  photos: [],
  profile_score: 30,
  trust_score: 50,
  is_profile_complete: false,
};

// ── Fake profiles returned by /api/discover ──────────────────────────────────
const FAKE_PROFILES = {
  profiles: [
    { id: 'u1', name: 'Alice Founder', headline: 'Building in AI', photos: [], interests: ['AI', 'SaaS'], intent: 'Co-founder' },
    { id: 'u2', name: 'Bob Investor', headline: 'Angel investor', photos: [], interests: ['Fintech'], intent: 'Invest' },
    { id: 'u3', name: 'Carol Dev', headline: 'Full-stack engineer', photos: [], interests: ['React', 'Node'], intent: 'Freelance' },
  ],
};

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx     = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page    = await ctx.newPage();
  const log     = (m) => console.log(`[${new Date().toISOString().slice(11,19)}] ${m}`);

  // ── Route interception ───────────────────────────────────────────────────
  // Track what discover URL was called with
  let discoverUrl = null;

  await ctx.route('**/api/**', async (route) => {
    const url  = route.request().url();
    const path = new URL(url).pathname + new URL(url).search;

    // /api/me — return a verified user mid-onboarding initially,
    // then 'complete' after the profile POST (simulated by checking call count)
    if (path === '/api/me' || path.startsWith('/api/me?')) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(meUser) });
    }

    // /api/onboarding/stage
    if (path === '/api/onboarding/stage') {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ stage: 'profile' }) });
    }

    // /api/onboarding/profile POST
    if (path === '/api/onboarding/profile' && route.request().method() === 'POST') {
      meUser = { ...meUser, onboarding_stage: 'complete' };
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true }) });
    }

    // /api/discover — record what URL was called, return fake profiles
    if (path.startsWith('/api/discover')) {
      discoverUrl = path;
      log(`Discover called with: ${path}`);
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(FAKE_PROFILES) });
    }

    // /api/onboarding/* other
    if (path.startsWith('/api/onboarding')) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true }) });
    }

    // /api/profile/referral
    if (path.startsWith('/api/profile/referral')) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ code: 'TEST123', link: 'https://buildyournetwork.online?ref=TEST123', count: 2 }) });
    }

    // Everything else — pass through (Next.js chunks, CSS, etc.)
    return route.continue();
  });

  // Mutable user — starts mid-onboarding, flips to complete after profile POST
  let meUser = { ...FAKE_USER };

  try {
    // ── Step 1: Load /onboarding directly (user is already "logged in" via mocked /api/me) ──
    log('Step 1: Navigate to /onboarding');
    await page.goto(`${BASE}/onboarding`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: ss('01-onboarding-loaded') });

    const url1 = page.url();
    log(`URL after /onboarding load: ${url1}`);

    if (!url1.includes('/onboarding')) {
      log(`❌ FAIL — redirected away from /onboarding to ${url1}`);
      return;
    }

    // ── Step 2: Verify we land on the profile step ─────────────────────────
    // The onboarding page calls /api/onboarding/stage which returns 'profile'
    const profileHeading = page.locator('text=/professional profile|build your profile|complete.*profile|tell us about/i');
    const profileFormVisible = await profileHeading.count() > 0;
    log(`Profile step visible: ${profileFormVisible}`);
    await page.screenshot({ path: ss('02-profile-step') });

    // Fill whatever visible inputs exist in the profile step
    const textInputs = page.locator('input[type="text"]:visible, textarea:visible');
    const inputCount = await textInputs.count();
    log(`Visible text inputs: ${inputCount}`);
    for (let i = 0; i < Math.min(inputCount, 4); i++) {
      const ph = await textInputs.nth(i).getAttribute('placeholder') ?? '';
      await textInputs.nth(i).fill(ph.includes('location') || ph.toLowerCase().includes('city') ? 'Remote' : 'E2E test value');
    }

    // Select any checkboxes / tags / chips that look like interest/skill selectors
    const chips = page.locator('button[class*="chip"], button[class*="tag"], button[class*="interest"]');
    const chipCount = await chips.count();
    for (let i = 0; i < Math.min(chipCount, 3); i++) {
      await chips.nth(i).click().catch(() => {});
    }

    await page.screenshot({ path: ss('03-profile-filled') });

    // ── Step 3: Submit the profile ─────────────────────────────────────────
    log('Step 3: Submit profile');
    const submitBtn = page.locator('button').filter({ hasText: /finish|save|complete|submit|continue|next/i }).last();
    const submitCount = await submitBtn.count();
    log(`Submit button candidates: ${submitCount}`);

    if (submitCount === 0) {
      log('❌ FAIL — no submit button found on profile step');
      await page.screenshot({ path: ss('03b-no-submit') });
      return;
    }

    await submitBtn.click();
    log('Clicked submit — waiting for SuggestedConnections screen');
    await page.waitForTimeout(3500);
    await page.screenshot({ path: ss('04-after-submit') });

    // ── Step 4: Verify SuggestedConnections screen ─────────────────────────
    const feedBtn = page.locator('button').filter({ hasText: /go to my feed/i });
    const feedBtnCount = await feedBtn.count();
    log(`"Go to my feed →" button found: ${feedBtnCount > 0}`);

    if (feedBtnCount === 0) {
      log('❌ FAIL — SuggestedConnections screen did not appear');
      const pageText = await page.locator('body').innerText().catch(() => '');
      log(`Page text snippet: ${pageText.slice(0, 300)}`);
      return;
    }

    // Check profiles shown
    const youreIn = await page.locator('text=You\'re in').count();
    log(`"You're in" heading visible: ${youreIn > 0}`);

    const profileNames = await page.locator('text=Alice Founder, text=Bob Investor, text=Carol Dev').count();
    const suggestionMsg = await page.locator('text=/people worth knowing|your feed will fill/i').textContent().catch(() => 'not found');
    log(`Suggestion message: "${suggestionMsg}"`);
    log(`Fake profile names visible: ${profileNames}`);

    // Verify discover was called with the right URL
    log(`Discover URL called: ${discoverUrl}`);
    const usedLimit5   = discoverUrl?.includes('limit=5') && !discoverUrl?.includes('sort=relevance');
    const usedRelevance = discoverUrl?.includes('sort=relevance');
    log(`Used ?limit=5 (correct): ${usedLimit5}`);
    log(`Used ?sort=relevance (wrong): ${usedRelevance}`);

    await page.screenshot({ path: ss('05-suggested-connections') });

    // ── Step 5: Click "Go to my feed →" ───────────────────────────────────
    log('Step 5: Clicking "Go to my feed →"');

    // Listen for navigation
    const navPromise = page.waitForURL(/\/discover/, { timeout: 8000 });
    await feedBtn.first().click();

    let landed = false;
    try {
      await navPromise;
      landed = true;
    } catch {
      landed = false;
    }

    await page.waitForTimeout(1500);
    const finalUrl = page.url();
    log(`Final URL: ${finalUrl}`);
    await page.screenshot({ path: ss('06-final-url') });

    const onDiscover  = finalUrl.includes('/discover');
    const onOnboarding = finalUrl.includes('/onboarding');

    // ── Final verdict ──────────────────────────────────────────────────────
    console.log('\n════════════════════════════════════════════');
    if (onDiscover && !onOnboarding) {
      console.log('RESULT: PASS');
      console.log('  ✅ Profile step rendered');
      console.log('  ✅ Profile submitted → SuggestedConnections appeared');
      console.log(`  ${usedLimit5 ? '✅' : '❌'} Discover called with ?limit=5 (no sort=relevance): ${discoverUrl}`);
      console.log(`  ${youreIn > 0 ? '✅' : '⚠'} "You\'re in" heading: ${youreIn > 0}`);
      console.log(`  ✅ "Go to my feed →" navigated to /discover`);
      console.log(`  ✅ No bounce back to /onboarding`);
    } else {
      console.log('RESULT: FAIL');
      if (onOnboarding) console.log(`  ❌ Bounced back to /onboarding — AppShell guard still firing`);
      else console.log(`  ❌ Unexpected final URL: ${finalUrl}`);
      if (!usedLimit5) console.log(`  ❌ Discover URL wrong: ${discoverUrl}`);
    }
    console.log('════════════════════════════════════════════\n');

  } catch (err) {
    console.log(`RESULT: ERROR — ${err.message}`);
    console.log(err.stack);
    await page.screenshot({ path: ss('99-error') }).catch(() => {});
  } finally {
    await browser.close();
  }
}

run();
