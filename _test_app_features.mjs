// ── BYN App Features — End-to-End Test ──────────────────────────────────────
// Tests: discover, swipe/match, connections, messaging, profile update, search
// Uses Supabase service role to bypass photo upload and set email_verified.
// ────────────────────────────────────────────────────────────────────────────

const BASE         = 'https://buildyournetwork.online';
const SUPABASE_URL = 'https://swyrdvdarlevzjubqard.supabase.co';
const SVC_KEY      = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3eXJkdmRhcmxldnpqdWJxYXJkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzk5MDMxNywiZXhwIjoyMDkzNTY2MzE3fQ.MeKUEbqQIOJQqIMljYz8skxGAoT5lLyOh51mXGsqkhU';
const ADMIN_SECRET = 'MyloveV';
const uid          = Date.now();

let pass = 0, fail = 0;
function ok(label, cond, detail = '') {
  if (cond) { console.log('  ✅', label); pass++; }
  else       { console.log('  ❌', label, detail ? `— ${detail}` : ''); fail++; }
}

async function api(method, path, body, token) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  if (body)  opts.body = JSON.stringify(body);
  const r = await fetch(BASE + path, opts);
  let data;
  try { data = await r.json(); } catch { data = {}; }
  return { status: r.status, data };
}

async function sbPatch(table, id, patch) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SVC_KEY,
      'Authorization': `Bearer ${SVC_KEY}`,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(patch),
  });
  const data = await r.json().catch(() => []);
  return Array.isArray(data) ? data[0] : data;
}

// ── Setup: create + verify + onboard user ─────────────────────────────────
async function setupUser(label, n) {
  const email = `test_app_${uid}_${n}@test.com`;
  const name  = `${label} User`;
  const pass  = 'TestPass123';

  // Signup
  const su = await api('POST', '/api/signup', { name, email, password: pass });
  if (su.status !== 200) throw new Error(`${label} signup failed: ${JSON.stringify(su.data)}`);
  const token  = su.data.token;
  const userId = su.data.user?.id;

  // Mark email verified via Supabase service role (bypass OTP for speed)
  await sbPatch('users', userId, { email_verified: true });

  // Onboarding: acquisition
  await api('POST', '/api/onboarding/acquisition', { source: 'Other' }, token);
  // Onboarding: intent
  await api('POST', '/api/onboarding/intent', { intents: ['Networking', 'Find Co-founder'] }, token);
  // Onboarding: profile (text fields only)
  await api('POST', '/api/onboarding/profile', {
    bio: `${label} tester — building cool things`,
    location: 'Mumbai, India',
    interests: ['AI/ML', 'Startups', 'SaaS', 'Fintech', 'Design'],
    headline: `${label} at BYN`,
  }, token);

  // Inject fake photos + trust fields directly so profileGuard and trustGuard pass
  await sbPatch('users', userId, {
    photos: [
      `https://picsum.photos/seed/${uid}${n}a/400/400`,
      `https://picsum.photos/seed/${uid}${n}b/400/400`,
      `https://picsum.photos/seed/${uid}${n}c/400/400`,
      `https://picsum.photos/seed/${uid}${n}d/400/400`,
    ],
    bio: `${label} tester — building cool things`,
    interests: ['AI/ML', 'Startups', 'SaaS', 'Fintech', 'Design'],
    intent: 'explore-network',
    location: 'Mumbai, India',
    profile_score: 80,
    is_profile_complete: true,
    trust_score: 50,
    onboarding_stage: 'complete',
  });

  console.log(`  ${label}: id=${userId} email=${email}`);
  return { token, userId, email, name };
}

console.log('═══════════════════════════════════════════════');
console.log(' BYN APP FEATURES — END-TO-END TEST');
console.log('═══════════════════════════════════════════════\n');

// ── Setup ──────────────────────────────────────────────────────────────────
console.log('── Setup: Creating two test users ───────────────');
let A, B;
try {
  A = await setupUser('Alpha', 1);
  B = await setupUser('Beta',  2);
} catch(e) {
  console.error('Setup failed:', e.message);
  process.exit(1);
}

// ── 1: Profile fetch ───────────────────────────────────────────────────────
console.log('\n── 1: /api/me ───────────────────────────────────');
let r = await api('GET', '/api/me', null, A.token);
ok('/api/me → 200',          r.status === 200);
ok('email_verified = true',  r.data.email_verified === true);
ok('onboarding_stage = complete', r.data.onboarding_stage === 'complete');
ok('photos present',         (r.data.photos || []).length >= 4, `got ${(r.data.photos||[]).length}`);

// ── 2: Discover ────────────────────────────────────────────────────────────
console.log('\n── 2: /api/discover ─────────────────────────────');
r = await api('GET', '/api/discover?worldwide=true', null, A.token);
ok('discover → 200',         r.status === 200, JSON.stringify(r.data).slice(0,120));
const profiles = r.data.profiles || [];
ok('returns profiles array', Array.isArray(profiles));
const seesB = profiles.some(p => p.id === B.userId);
ok('Beta appears in Alpha discover', seesB, `got ${profiles.length} profiles`);

// ── 3: Profile view ────────────────────────────────────────────────────────
console.log('\n── 3: /api/profiles/:id ─────────────────────────');
r = await api('GET', `/api/profiles/${B.userId}`, null, A.token);
ok('profile view → 200',     r.status === 200, JSON.stringify(r.data).slice(0,80));
ok('correct name',           r.data.name === B.name, `got: ${r.data.name}`);

// ── 4: Search ─────────────────────────────────────────────────────────────
console.log('\n── 4: /api/search ───────────────────────────────');
r = await api('GET', `/api/search?q=Beta+User`, null, A.token);
ok('search → 200',           r.status === 200, JSON.stringify(r.data).slice(0,120));

// ── 5: Swipe (A likes B) ──────────────────────────────────────────────────
console.log('\n── 5: Swipe Alpha → Beta ────────────────────────');
r = await api('POST', '/api/swipe', { targetId: B.userId, direction: 'right' }, A.token);
ok('swipe right → 200',      r.status === 200, JSON.stringify(r.data));
ok('no match yet',           r.data.match === false || r.data.match === undefined);

// ── 6: Liked-me (B checks who liked them) ─────────────────────────────────
console.log('\n── 6: /api/liked-me (Beta) ──────────────────────');
r = await api('GET', '/api/liked-me', null, B.token);
ok('liked-me → 200',         r.status === 200, JSON.stringify(r.data).slice(0,120));
// Free users get { premium_required: true, count, previews } — no user IDs exposed
const alphaLikedB = r.data.count > 0 ||
  (Array.isArray(r.data.profiles) && r.data.profiles.some(p => p.id === A.userId));
ok('Alpha appears in Beta liked-me', alphaLikedB,
   `count=${r.data.count} premium_required=${r.data.premium_required}`);

// ── 7: Mutual swipe → match ───────────────────────────────────────────────
console.log('\n── 7: Swipe Beta → Alpha (mutual match) ─────────');
r = await api('POST', '/api/swipe', { targetId: A.userId, direction: 'right' }, B.token);
ok('swipe right → 200',      r.status === 200, JSON.stringify(r.data));
ok('match = true',           r.data.match === true, JSON.stringify(r.data));
const connId = r.data.connection_id || r.data.connectionId;
ok('connection_id returned', !!connId, `got: ${connId}`);

// ── 8: Connections ────────────────────────────────────────────────────────
console.log('\n── 8: /api/connections ──────────────────────────');
r = await api('GET', '/api/connections', null, A.token);
ok('connections → 200',      r.status === 200);
// Response shape: [{ connection: {...}, user: {...}, ... }]
const conns = Array.isArray(r.data) ? r.data : (r.data.connections || []);
const hasConn = conns.some(c => c.user?.id === B.userId);
ok('Alpha sees Beta in connections', hasConn, `got ${conns.length} conns, users=${conns.map(c=>c.user?.id).join(',')}`);

// ── 9: Messaging ──────────────────────────────────────────────────────────
console.log('\n── 9: Messaging ─────────────────────────────────');
if (!connId) {
  console.log('  ⚠️  Skipping — no connection ID from swipe');
} else {
  // Alpha sends message
  r = await api('POST', `/api/messages/${connId}`, { text: 'Hey Beta, great to connect!' }, A.token);
  ok('send message → 200',     r.status === 200, JSON.stringify(r.data).slice(0,80));

  // Beta reads messages
  r = await api('GET', `/api/messages/${connId}`, null, B.token);
  ok('get messages → 200',     r.status === 200);
  const msgs = r.data.messages || r.data || [];
  ok('message received',       Array.isArray(msgs) && msgs.some(m => m.text === 'Hey Beta, great to connect!'),
     `got ${Array.isArray(msgs)?msgs.length:'?'} msgs`);

  // Beta replies
  r = await api('POST', `/api/messages/${connId}`, { text: 'Hi Alpha! Let\'s build something.' }, B.token);
  ok('Beta reply → 200',       r.status === 200);

  // Conversation starters
  r = await api('GET', `/api/conversation-starters/${connId}`, null, A.token);
  ok('conversation-starters → 200 or 403', r.status === 200 || r.status === 403);
}

// ── 10: Profile update ────────────────────────────────────────────────────
console.log('\n── 10: PUT /api/me ──────────────────────────────');
r = await api('PUT', '/api/me', {
  bio: 'Updated bio — testing BYN app features',
  location: 'Bangalore, India',
  skills: ['React', 'Node.js', 'PostgreSQL'],
}, A.token);
ok('profile update → 200',   r.status === 200, JSON.stringify(r.data).slice(0,120));

r = await api('GET', '/api/me', null, A.token);
ok('updated bio persisted',  r.data.bio === 'Updated bio — testing BYN app features',
   `got: ${r.data.bio}`);

// ── 11: Public stats ──────────────────────────────────────────────────────
console.log('\n── 11: /api/stats/public ────────────────────────');
r = await api('GET', '/api/stats/public', null, null);
ok('public stats → 200',     r.status === 200, JSON.stringify(r.data));
ok('users count > 0',        (r.data.users || 0) > 0, `users=${r.data.users}`);

// ── 12: Cleanup (via Supabase service role) ───────────────────────────────
console.log('\n── Cleanup: deleting test users ─────────────────');
async function sbDelete(table, userId) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${userId}`, {
    method: 'DELETE',
    headers: { 'apikey': SVC_KEY, 'Authorization': `Bearer ${SVC_KEY}` },
  });
  return r.status;
}
async function deleteUser(uid) {
  // cascade order matters due to FK constraints
  for (const tbl of ['swipes','connections','messages','priority_msgs','user_intents','user_acquisition','works','blocks','reviews']) {
    await fetch(`${SUPABASE_URL}/rest/v1/${tbl}?or=(from_user.eq.${uid},to_user.eq.${uid},user_id.eq.${uid},user1.eq.${uid},user2.eq.${uid},sender_id.eq.${uid},reviewer_id.eq.${uid},reviewed_id.eq.${uid})`, {
      method: 'DELETE',
      headers: { 'apikey': SVC_KEY, 'Authorization': `Bearer ${SVC_KEY}` },
    }).catch(() => {});
  }
  return sbDelete('users', uid);
}
const stA = await deleteUser(A.userId);
const stB = await deleteUser(B.userId);
ok('Alpha deleted', stA === 200 || stA === 204, `status=${stA}`);
ok('Beta deleted',  stB === 200 || stB === 204, `status=${stB}`);

// ── Summary ───────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════');
console.log(` RESULTS: ✅ ${pass} passed  ❌ ${fail} failed`);
console.log('═══════════════════════════════════════════════\n');
if (fail > 0) process.exit(1);
