const BASE       = 'https://buildyournetwork.online';
const RESEND_KEY = 're_9AM1VLsr_BQUd6xDcJmHKzbCP6GoQr5zk';
const uid        = Date.now();
const EMAIL      = `e2e_otp_${uid}@test.com`;
const PASS       = 'TestPass123';

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
  try { data = await r.json(); } catch { data = { _raw: await r.text().catch(() => '').slice(0, 300) }; }
  return { status: r.status, data };
}

async function resendGet(path) {
  const r = await fetch(`https://api.resend.com${path}`, {
    headers: { Authorization: `Bearer ${RESEND_KEY}` }
  });
  return r.json();
}

// Poll Resend until the email for `to` appears, up to `maxWaitMs`
async function waitForEmail(to, maxWaitMs = 15000) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const log = await resendGet('/emails?limit=10');
    const found = (log.data || []).find(e => e.to?.includes(to));
    if (found) return found;
    await new Promise(r => setTimeout(r, 1500));
  }
  return null;
}

// Extract 6-digit OTP from email subject "602665 is your Build Your Network verification code"
function parseOtp(subject) {
  const m = subject?.match(/^(\d{6})\s+is your/);
  return m ? m[1] : null;
}

console.log('═══════════════════════════════════════');
console.log(' BYN OTP VERIFY — END-TO-END TEST');
console.log('═══════════════════════════════════════\n');

// ── STEP 1: SIGNUP ────────────────────────────────────────────
console.log('── Step 1: Signup ───────────────────────────────────');
let r = await api('POST', '/api/signup', { name: 'OTP E2E Tester', email: EMAIL, password: PASS });
ok('Signup → 200',            r.status === 200);
ok('email_verified = false',  r.data.email_verified === false);
const token = r.data.token;
const userId = r.data.user?.id;
if (!token) { console.error('No token — aborting'); process.exit(1); }

// ── STEP 2: VERIFY GUARDS BEFORE OTP ─────────────────────────
console.log('\n── Step 2: Verify guards before OTP ────────────────');

r = await api('POST', '/api/auth/verify-otp', { code: '123456' }, token);
ok('Verify before send → 400 (no code in DB)',
   r.status === 400, r.data.error);

r = await api('POST', '/api/auth/verify-otp', {}, token);
ok('Verify with no code field → 400', r.status === 400, r.data.error);

// ── STEP 3: SEND OTP ─────────────────────────────────────────
console.log('\n── Step 3: Send OTP ─────────────────────────────────');
r = await api('POST', '/api/auth/send-otp', {}, token);
ok('send-otp → 200',          r.status === 200, JSON.stringify(r.data));
const sendTime = Date.now();

// ── STEP 4: FETCH REAL CODE FROM RESEND ──────────────────────
console.log('\n── Step 4: Fetch OTP from Resend log ────────────────');
console.log('  Waiting for email to arrive in Resend...');
const email = await waitForEmail(EMAIL);
ok('Email found in Resend',   !!email, email ? `subject: ${email.subject}` : 'timed out after 15s');

const otp = parseOtp(email?.subject);
ok('OTP parsed from subject', !!otp, `parsed: ${otp}`);
console.log(`  OTP code: ${otp}  (from subject: "${email?.subject}")`);
console.log(`  From: ${email?.from}`);
console.log(`  Delivery status: ${email?.last_event}`);

if (!otp) { console.error('Cannot continue without OTP'); process.exit(1); }

// ── STEP 5: WRONG CODE ATTEMPTS ──────────────────────────────
console.log('\n── Step 5: Wrong code rejection ────────────────────');

r = await api('POST', '/api/auth/verify-otp', { code: '000000' }, token);
ok('Wrong code → 400',        r.status === 400, r.data.error);

r = await api('POST', '/api/auth/verify-otp', { code: '   ' }, token);
ok('Whitespace code → 400',   r.status === 400, r.data.error);

// Check email_verified still false after failed attempts
r = await api('GET', '/api/me', null, token);
ok('email_verified still false after wrong attempts', r.data.email_verified === false);

// ── STEP 6: CORRECT CODE ─────────────────────────────────────
console.log('\n── Step 6: Verify with correct OTP ─────────────────');
r = await api('POST', '/api/auth/verify-otp', { code: otp }, token);
ok('Correct OTP → 200',       r.status === 200, JSON.stringify(r.data));

// ── STEP 7: STATE AFTER VERIFICATION ─────────────────────────
console.log('\n── Step 7: State after verification ────────────────');
r = await api('GET', '/api/me', null, token);
ok('/api/me returns 200',      r.status === 200);
ok('email_verified = true',    r.data.email_verified === true, `got: ${r.data.email_verified}`);
ok('OTP code cleared from DB', r.data.otp_code === undefined || r.data.otp_code === null);

// ── STEP 8: REPLAY ATTACK ────────────────────────────────────
console.log('\n── Step 8: Replay attack (same code again) ─────────');
r = await api('POST', '/api/auth/verify-otp', { code: otp }, token);
// Accept 400 (no code in DB) or 429 (rate limit exhausted) — both mean "rejected"
ok('Replayed OTP → rejected (400 or 429)', r.status === 400 || r.status === 429, r.data.error);

// ── STEP 9: LOGIN REFLECTS VERIFIED STATE ────────────────────
console.log('\n── Step 9: Login reflects verified state ────────────');
r = await api('POST', '/api/login', { email: EMAIL, password: PASS });
ok('Login → 200',             r.status === 200);
ok('email_verified = true in login response',
   r.data.email_verified === true, `got: ${r.data.email_verified}`);

// ── STEP 10: RESEND OTP STILL WORKS (device re-auth) ─────────
console.log('\n── Step 10: Resend OTP on already-verified account ──');
const sendTime2 = Date.now();
r = await api('POST', '/api/auth/send-otp', {}, token);
ok('send-otp on verified user → 200', r.status === 200);

// Poll until a new email (created after sendTime2) appears — up to 20s
let otp2 = null;
const deadline2 = Date.now() + 20000;
while (Date.now() < deadline2) {
  const batch = (await resendGet('/emails?limit=10')).data || [];
  const newEmail = batch
    .filter(e => e.to?.includes(EMAIL) && new Date(e.created_at).getTime() > sendTime2 - 5000)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
  if (newEmail) {
    otp2 = parseOtp(newEmail?.subject);
    console.log(`  Second email subject: "${newEmail?.subject}"`);
    break;
  }
  await new Promise(res => setTimeout(res, 1500));
}
ok('New OTP issued (different from first)', !!otp2 && otp2 !== otp,
   `first=${otp} second=${otp2}`);

// ── SUMMARY ──────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════');
console.log(` RESULTS: ✅ ${pass} passed  ❌ ${fail} failed`);
console.log('═══════════════════════════════════════\n');
if (fail > 0) process.exit(1);
