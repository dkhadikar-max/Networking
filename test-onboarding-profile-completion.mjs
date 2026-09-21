// Regression test for the two onboarding/profile-completion bugs found by
// the read-only investigation and fixed alongside this script:
//
//  BUG 1 — /api/onboarding/profile accepted an empty/near-empty submission
//          and set onboarding_stage='complete' unconditionally, even though
//          profileGuard (Connect/Swipe/Circles) requires profile_score>=70.
//          A user could "finish" onboarding and then immediately get
//          blocked with 403 PROFILE_INCOMPLETE on their first real action.
//          Fix: onboarding only completes once profile_score reaches the
//          SAME threshold (PROFILE_COMPLETION_THRESHOLD=70) profileGuard
//          already enforces — one definition of "complete", not two.
//
//  BUG 2 — GET /api/onboarding/stage read onboarding_stage straight off
//          req.userData, which on a warm 30s auth-cache hit is the narrow
//          cached slice that never carries onboarding_stage — so it could
//          report 'acquisition' for a user who was actually 'complete' in
//          the DB. Fix: same _cached-guard fresh-fetch pattern already used
//          by the onboarding POST handlers.
//
// Standalone throwaway script (repo convention — see test-registration-flow.mjs).
// Requires a local server on http://localhost:3000 and .env's Supabase
// service-role credentials. Disposable test accounts are cleaned up at the end.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import ws from 'ws';
import bcrypt from 'bcryptjs';
const uuidv4 = () => crypto.randomUUID();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }, realtime: { transport: ws },
});
const BASE = 'http://localhost:3000';

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}  ${detail ?? ''}`); }
}

async function post(path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  let json = null; try { json = await res.json(); } catch (_) {}
  return { status: res.status, body: json };
}
async function get(path, token) {
  const res = await fetch(`${BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  let json = null; try { json = await res.json(); } catch (_) {}
  return { status: res.status, body: json };
}

const cleanupIds = [];

async function directlyIssueMagicLink(userId) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  await supabase.from('users').update({
    magic_link_token_hash: tokenHash,
    magic_link_expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    magic_link_used_at: null,
  }).eq('id', userId);
  return rawToken;
}

async function createSecondaryVerifiedUser() {
  const id = uuidv4();
  const email = `byn-obcomplete-viewer-${Date.now()}@example.com`;
  const password = 'ViewerPass123!';
  await supabase.from('users').insert({
    id, email, password: await bcrypt.hash(password, 12), name: 'OB Completion Viewer',
    // profileGuard recomputes calcProfileScore live from these fields (it
    // does NOT trust the seeded profile_score column below) — photos>=4 and
    // interests>=3 are needed to actually clear 70, not just claim to.
    bio: 'viewer account for the onboarding completion regression suite',
    photos: [
      'https://res.cloudinary.com/demo/image/upload/sample.jpg',
      'https://res.cloudinary.com/demo/image/upload/sample2.jpg',
      'https://res.cloudinary.com/demo/image/upload/sample3.jpg',
      'https://res.cloudinary.com/demo/image/upload/sample4.jpg',
    ],
    instagram: '', linkedin: '', website: '',
    location: 'Bengaluru', lat: 12.9716, lng: 77.5946, remote: false,
    skills: [], interests: ['testing', 'networking', 'startups'],
    currently_exploring: '', working_on: '', interested_in: '',
    intent: 'explore-network', role: 'user', premium: false,
    trust_score: 50, profile_score: 80, is_profile_complete: true,
    verification: { status: 'none', confidence: 0 },
    banned: false, created_at: new Date().toISOString(),
    consent_given_at: new Date().toISOString(), consent_version: 'v1.0',
    do_not_sell: false, email_verified: true, deleted_at: null,
    onboarding_stage: 'complete', password_set: true,
  });
  cleanupIds.push(id);
  const login = await post('/api/login', { email, password });
  return { token: login.body.token, id };
}

async function dbRow(id, cols = '*') {
  const { data } = await supabase.from('users').select(cols).eq('id', id).maybeSingle();
  return data;
}

(async () => {
  const viewer = await createSecondaryVerifiedUser();

  console.log('=== 1-2. Fresh account: name+email -> magic link -> verify -> acquisition -> intent -> profile stage ===');
  const stamp = Date.now();
  const email = `byn-obcomplete-${stamp}@example.com`;
  const r1 = await post('/api/auth/magic-link/request', { email, name: 'OB Completion Test', age_confirmed: true });
  check('registration succeeds', r1.status === 200, JSON.stringify(r1.body));
  const { data: created } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
  if (!created) { console.error('FATAL: account not created'); process.exit(1); }
  cleanupIds.push(created.id);

  const rawToken = await directlyIssueMagicLink(created.id);
  const verifyRes = await post('/api/auth/magic-link/verify', { token: rawToken });
  const sessionToken = verifyRes.body?.token;
  check('email verify succeeds', verifyRes.status === 200 && !!sessionToken, JSON.stringify(verifyRes.body));

  const acqRes = await post('/api/onboarding/acquisition', { source: 'Google Search' }, sessionToken);
  check('acquisition step succeeds', acqRes.status === 200, JSON.stringify(acqRes.body));
  const intentRes = await post('/api/onboarding/intent', { intents: ['Networking'] }, sessionToken);
  check('intent step succeeds', intentRes.status === 200, JSON.stringify(intentRes.body));

  console.log('\n=== 3. Submit an empty profile — MUST NOT complete onboarding ===');
  const emptyRes = await post('/api/onboarding/profile', {}, sessionToken);
  check('empty submission returns 403 PROFILE_INCOMPLETE',
    emptyRes.status === 403 && emptyRes.body?.code === 'PROFILE_INCOMPLETE', JSON.stringify(emptyRes.body));
  check('403 body includes profile_score and required_score',
    typeof emptyRes.body?.profile_score === 'number' && emptyRes.body?.required_score === 70,
    JSON.stringify(emptyRes.body));
  check('403 body includes a checklist of missing items',
    Array.isArray(emptyRes.body?.checklist) && emptyRes.body.checklist.length > 0,
    JSON.stringify(emptyRes.body?.checklist));
  const afterEmpty = await dbRow(created.id, 'onboarding_stage,profile_score');
  check('DB: onboarding_stage did NOT become complete', afterEmpty?.onboarding_stage === 'profile', JSON.stringify(afterEmpty));

  console.log('\n=== 4. Enough data to reach >=70 (bio + location + 3 interests) but NO PHOTO — MUST NOT complete (audit A13: a photo is part of "complete") ===');
  const profileBody = {
    bio: 'Building a fintech startup, exploring new markets across India.',
    location: 'Mumbai',
    interests: ['AI/ML', 'Startups', 'SaaS'],
  };
  const noPhotoRes = await post('/api/onboarding/profile', profileBody, sessionToken);
  check('score >= 70 without a photo returns 403 PROFILE_INCOMPLETE with photo_required',
    noPhotoRes.status === 403 && noPhotoRes.body?.code === 'PROFILE_INCOMPLETE' && noPhotoRes.body?.photo_required === true,
    JSON.stringify(noPhotoRes.body));
  const afterNoPhoto = await dbRow(created.id, 'onboarding_stage,is_profile_complete');
  check('DB: still onboarding_stage=profile and is_profile_complete=false',
    afterNoPhoto?.onboarding_stage === 'profile' && afterNoPhoto?.is_profile_complete === false, JSON.stringify(afterNoPhoto));

  console.log('\n=== 5. Add a photo (set directly: the upload endpoint needs Cloudinary or the disk), resubmit ===');
  await supabase.from('users').update({ photos: ['https://example.com/onboarding-test-photo.jpg'] }).eq('id', created.id);
  const fullRes = await post('/api/onboarding/profile', profileBody, sessionToken);
  check('qualifying submission returns 200 stage=complete',
    fullRes.status === 200 && fullRes.body?.stage === 'complete', JSON.stringify(fullRes.body));
  check('qualifying submission profile_score >= 70',
    (fullRes.body?.profile_score ?? 0) >= 70, JSON.stringify(fullRes.body));
  const afterFull = await dbRow(created.id, 'onboarding_stage,profile_score,is_profile_complete,name,bio,location,interests');
  check('DB: onboarding_stage=complete', afterFull?.onboarding_stage === 'complete', JSON.stringify(afterFull));
  check('DB: profile_score >= 70', (afterFull?.profile_score ?? 0) >= 70, JSON.stringify(afterFull));
  check('DB: is_profile_complete=true', afterFull?.is_profile_complete === true, JSON.stringify(afterFull));

  console.log('\n=== 6. GET /api/onboarding/stage repeatedly with a warm auth cache — must consistently return complete ===');
  // The 30s auth-cache was already warmed by the requests above (all used
  // the same sessionToken/user within the TTL window) — this is the exact
  // condition BUG 2 reproduced under.
  for (let i = 1; i <= 3; i++) {
    const stageRes = await get('/api/onboarding/stage', sessionToken);
    check(`GET /api/onboarding/stage call #${i} returns 'complete' (not stale 'acquisition')`,
      stageRes.status === 200 && stageRes.body?.stage === 'complete', JSON.stringify(stageRes.body));
  }

  console.log('\n=== 7. Connect/Swipe after completion — must NOT receive PROFILE_INCOMPLETE ===');
  const connectRes = await post('/api/connect', { userId: viewer.id }, sessionToken);
  check('POST /api/connect does not return PROFILE_INCOMPLETE',
    connectRes.body?.code !== 'PROFILE_INCOMPLETE', JSON.stringify(connectRes.body));
  const swipeRes = await post('/api/swipe', { targetId: viewer.id, direction: 'right' }, sessionToken);
  check('POST /api/swipe does not return PROFILE_INCOMPLETE',
    swipeRes.body?.code !== 'PROFILE_INCOMPLETE', JSON.stringify(swipeRes.body));

  console.log('\n=== 8. Existing (already-complete, already-qualifying) users remain unaffected ===');
  const viewerStage = await get('/api/onboarding/stage', viewer.token);
  check('an existing complete user still gets stage=complete from GET /api/onboarding/stage',
    viewerStage.status === 200 && viewerStage.body?.stage === 'complete', JSON.stringify(viewerStage.body));
  const viewerConnect = await post('/api/connect', { userId: created.id }, viewer.token);
  check('an existing qualifying user is not blocked by profileGuard',
    viewerConnect.body?.code !== 'PROFILE_INCOMPLETE', JSON.stringify(viewerConnect.body));

  console.log('\n=== 9. No new unnamed account can be created (unchanged from 86e0054/749dea0) ===');
  const noNameEmail = `byn-obcomplete-noname-${stamp}@example.com`;
  const noNameRes = await post('/api/auth/magic-link/request', { email: noNameEmail, age_confirmed: true });
  check('missing name still rejected with 400', noNameRes.status === 400, JSON.stringify(noNameRes.body));
  const { data: noNameRow } = await supabase.from('users').select('id').eq('email', noNameEmail).maybeSingle();
  check('no account created when name is missing', !noNameRow, JSON.stringify(noNameRow));

  console.log('\n=== Cleanup ===');
  await supabase.from('users').delete().in('id', cleanupIds);
  console.log(`Deleted ${cleanupIds.length} disposable test accounts`);

  console.log(`\n=== RESULTS: ${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
})().catch(async e => {
  console.error('SCRIPT ERROR', e);
  if (cleanupIds.length) await supabase.from('users').delete().in('id', cleanupIds).catch(() => {});
  process.exit(1);
});
