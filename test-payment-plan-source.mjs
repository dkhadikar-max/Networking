// Regression test for audit finding A4:
//
//   POST /api/payments/verify took `plan` from the REQUEST BODY
//   (`const { …, plan } = req.body` -> PLANS[plan].days and premium_plan:plan)
//   instead of from the server-side payment/order record. The HMAC signature
//   only covers `order_id|payment_id`, not the plan, so a user who paid for a
//   MONTHLY order could call verify with plan:"quarterly" and receive 90 days
//   (and, in the other direction, a quarterly buyer who omitted/changed the
//   plan got 30). The webhook path already used the stored plan
//   (PLANS[payRec.plan]), so the two verification paths disagreed about the
//   same payment.
//
// Invariant enforced here: the entitlement for a payment is derived ONLY from
// the plan persisted on that payment/order row — by /verify and by the webhook
// alike; a client-supplied plan can never change it.
//
// Boots the REAL, UNMODIFIED server.js against a local fake PostgREST endpoint
// (in-memory users + payments), empty working directory (no .env), whitelisted
// env with FAKE local-only Razorpay secrets. Nothing here can reach Razorpay
// or production. Out of scope by design: A5 (verify/webhook race atomicity) —
// requests here are sequential. Standalone script (repo convention); exit
// code = failed checks.

import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';

const here = path.dirname(fileURLToPath(import.meta.url));
const SERVER_JS = path.join(here, 'server.js');
const JWT_SECRET = 'test-only-jwt-secret';
const RZ_SECRET = 'test-only-razorpay-key-secret';
const WH_SECRET = 'test-only-razorpay-webhook-secret';

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}  ${String(detail ?? '').slice(0, 200)}`); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Fake database ────────────────────────────────────────────────────────────
const mkUser = id => ({
  id, email: `${id}@example.test`, password: 'x', name: 'Test User', bio: 'a bio', photos: [], interests: [],
  intent: 'explore-network', role: 'user', premium: false, premium_expires_at: null, premium_plan: null,
  premium_since: null, trust_score: 10, profile_score: 30, banned: false, deleted_at: null, email_verified: true,
  onboarding_stage: 'complete', password_set: true, password_changed_at: null, last_active: null,
  created_at: '2026-01-01T00:00:00.000Z',
});
const USER_IDS = ['m_m', 'm_q', 'q_q', 'q_m', 'omit_m', 'omit_q', 'junk', 'wh_m', 'wh_q', 'vf_m', 'vf_q', 'replay', 'other_a', 'other_b', 'bystander'];
const tables = { users: USER_IDS.map(mkUser), payments: [] };

const PLAN_PRICE = { monthly: 24900, quarterly: 59900 };
let seq = 0;
function addOrder(userId, plan, status = 'created') {
  const id = `order_${++seq}_${userId}`;
  tables.payments.push({ id, user_id: userId, razorpay_order_id: id, razorpay_payment_id: null, plan, currency: 'INR', amount: PLAN_PRICE[plan], status, created_at: '2026-09-19T00:00:00.000Z' });
  return id;
}
const user = id => tables.users.find(u => u.id === id);
const order = id => tables.payments.find(p => p.id === id);

const NON_FILTER = new Set(['select', 'order', 'limit', 'offset', 'columns', 'on_conflict']);
function parseFilters(params) {
  const conds = []; let unsupported = false;
  for (const [k, v] of params) {
    if (NON_FILTER.has(k)) continue;
    const m = /^(eq|neq|is)\.(.*)$/.exec(v);
    if (!m) { unsupported = true; continue; }
    conds.push([k, m[1], m[2]]);
  }
  return { conds, unsupported };
}
const rowMatches = (row, conds) => conds.every(([k, op, val]) => {
  const cur = row[k];
  if (op === 'eq')  return String(cur) === val;
  if (op === 'neq') return String(cur) !== val;
  return val === 'null' ? cur == null : String(cur) === val;
});

const mock = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    const url = new URL(req.url, 'http://mock');
    const table = url.pathname.replace(/^\/rest\/v1\//, '');
    const raw = Buffer.concat(chunks).toString('utf8');
    let body = null; try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
    const wantObject = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    const json = (status, payload, extra = {}) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...extra }); res.end(payload === undefined ? undefined : JSON.stringify(payload)); };
    const objectOr406 = list => list.length === 1 ? json(200, list[0]) : json(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: null, hint: null });

    if (req.method === 'GET' || req.method === 'HEAD') {
      let list = [];
      if (tables[table]) {
        const { conds, unsupported } = parseFilters(url.searchParams);
        list = unsupported ? [] : tables[table].filter(r => rowMatches(r, conds)).map(r => structuredClone(r));
      }
      if (wantObject) return objectOr406(list);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Range': `*/${list.length}` });
      return res.end(req.method === 'HEAD' ? undefined : JSON.stringify(list));
    }
    if (req.method === 'PATCH' && tables[table] && body && typeof body === 'object') {
      const { conds, unsupported } = parseFilters(url.searchParams);
      const hit = unsupported ? [] : tables[table].filter(r => rowMatches(r, conds));
      hit.forEach(r => Object.assign(r, body));
      if (/return=representation/.test(req.headers.prefer || '')) {
        return wantObject ? objectOr406(hit.map(r => structuredClone(r))) : json(200, hit.map(r => structuredClone(r)), { 'Content-Range': `*/${hit.length}` });
      }
      return json(204, undefined, { 'Content-Range': `*/${hit.length}` });
    }
    // process_payment_entitlement() — a JS mirror of migrations/022 (atomic in-process: no awaits between
    // the check and the writes). The real SQL, and its behavior under concurrency and failure, is tested
    // on a real Postgres in test-payment-entitlement-sql.mjs and test-payment-idempotency.mjs; this fake
    // only lets the A4 (plan source-of-truth) assertions run against the server's new RPC-based path.
    if (req.method === 'POST' && table === 'rpc/process_payment_entitlement') {
      const a = body || {};
      const pay = tables.payments.find(p => p.id === a.p_order_id);
      if (!pay) return json(200, { outcome: 'not_found' });
      if (pay.status === 'paid') return json(200, { outcome: 'already_processed', user_id: pay.user_id });
      if (pay.plan !== a.p_plan) return json(400, { code: '22023', message: 'plan does not match stored order plan' });
      const u = tables.users.find(x => x.id === pay.user_id);
      if (!u) return json(400, { code: 'P0002', message: 'user not found' });
      const cur = u.premium_expires_at ? new Date(u.premium_expires_at).getTime() : 0;
      const expires = new Date(Math.max(cur, Date.now()) + a.p_days * 864e5).toISOString();
      Object.assign(pay, { status: 'paid', razorpay_payment_id: a.p_payment_id });
      Object.assign(u, { premium: true, premium_expires_at: expires, premium_plan: pay.plan, premium_since: new Date().toISOString() });
      return json(200, { outcome: 'granted', user_id: u.id, plan: pay.plan, expires_at: expires });
    }
    res.writeHead(req.method === 'POST' ? 201 : 204, { 'Content-Range': '*/0' });
    res.end();
  });
});

const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer();
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  s.on('error', reject);
});

const daysLeft = iso => iso ? (new Date(iso).getTime() - Date.now()) / 864e5 : null;
const isDays = (iso, n) => { const d = daysLeft(iso); return d !== null && Math.abs(d - n) < 1; };

async function main() {
  await new Promise(r => mock.listen(0, '127.0.0.1', r));
  const mockPort = mock.address().port;
  const serverPort = await freePort();
  const BASE = `http://127.0.0.1:${serverPort}`;
  const emptyCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a4-'));

  const env = {
    PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, SYSTEMROOT: process.env.SYSTEMROOT,
    TEMP: os.tmpdir(), TMP: os.tmpdir(), HOME: emptyCwd, USERPROFILE: emptyCwd,
    SUPABASE_URL: `http://127.0.0.1:${mockPort}`, SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key',
    JWT_SECRET, ADMIN_SECRET: 'test-only-admin-secret', PORT: String(serverPort),
    RAZORPAY_KEY_ID: 'rzp_test_local_only', RAZORPAY_KEY_SECRET: RZ_SECRET, RAZORPAY_WEBHOOK_SECRET: WH_SECRET,
  };

  console.log('=== Booting the real server.js against a local fake DB (fake Razorpay secrets, no production access) ===');
  let out = '';
  const child = spawn(process.execPath, [SERVER_JS], { cwd: emptyCwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { out += d; });
  let exited = null; child.on('exit', code => { exited = code; });

  const api = async (method, p, { token, body, raw, headers = {} } = {}) => {
    const h = { ...headers };
    if (body !== undefined && raw === undefined) h['Content-Type'] = 'application/json';
    if (token) h.Authorization = `Bearer ${token}`;
    const res = await fetch(BASE + p, { method, headers: h, body: raw !== undefined ? raw : (body !== undefined ? JSON.stringify(body) : undefined) });
    let j = null; try { j = await res.json(); } catch {}
    return { status: res.status, body: j };
  };
  const loginToken = id => jwt.sign({ id, email: `${id}@example.test`, name: 'Test User' }, JWT_SECRET, { expiresIn: '1h' });
  const paymentToken = async id => (await api('POST', '/api/payments/session', { token: loginToken(id) })).body?.payment_token;
  const sign = (orderId, payId) => crypto.createHmac('sha256', RZ_SECRET).update(`${orderId}|${payId}`).digest('hex');
  let pid = 0; const newPayId = () => `pay_test_${++pid}`;

  // The real client (upgrade/page.tsx) posts { ...razorpayResponse, plan }; `plan` may be absent/tampered here.
  async function verify(userId, orderId, payId, extra = {}) {
    const t = await paymentToken(userId);
    return api('POST', '/api/payments/verify', { token: t, body: { razorpay_order_id: orderId, razorpay_payment_id: payId, razorpay_signature: sign(orderId, payId), ...extra } });
  }
  async function webhook(orderId, payId) {
    const raw = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { order_id: orderId, id: payId } } } });
    const sig = crypto.createHmac('sha256', WH_SECRET).update(raw).digest('hex');
    return api('POST', '/api/payments/webhook', { raw, headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': sig } });
  }

  try {
    const bootDeadline = Date.now() + 60000;
    while (!/Server on port/.test(out) && exited === null && Date.now() < bootDeadline) await sleep(200);
    check('server booted (real server.js, fake DB, fake Razorpay secrets)', /Server on port/.test(out), out.slice(-300));

    // Snapshots for the "nothing unrelated changed" checks
    const bystanderOrder = addOrder('bystander', 'quarterly');
    const bystanderBefore = structuredClone(user('bystander'));
    const bystanderOrderBefore = structuredClone(order(bystanderOrder));

    console.log('\n=== 1. monthly payment + monthly request -> monthly entitlement ===');
    {
      const o = addOrder('m_m', 'monthly'), p = newPayId();
      const r = await verify('m_m', o, p, { plan: 'monthly' });
      check('200 ok', r.status === 200 && r.body?.ok === true, JSON.stringify(r));
      check('premium for ~30 days', isDays(user('m_m').premium_expires_at, 30), `days=${daysLeft(user('m_m').premium_expires_at)}`);
      check('users.premium_plan = "monthly"', user('m_m').premium_plan === 'monthly', user('m_m').premium_plan);
      check('payment row marked paid with the payment id', order(o).status === 'paid' && order(o).razorpay_payment_id === p, JSON.stringify(order(o)));
      check('premium flag set', user('m_m').premium === true);
    }

    console.log('\n=== 2. monthly payment + MANIPULATED quarterly request -> monthly entitlement ===');
    {
      const o = addOrder('m_q', 'monthly'), p = newPayId();
      const r = await verify('m_q', o, p, { plan: 'quarterly' });
      check('request accepted (client plan ignored, not rewarded)', r.status === 200, JSON.stringify(r));
      check('premium for ~30 days, NOT 90', isDays(user('m_q').premium_expires_at, 30), `days=${daysLeft(user('m_q').premium_expires_at)}`);
      check('users.premium_plan = "monthly" (not the claimed "quarterly")', user('m_q').premium_plan === 'monthly', user('m_q').premium_plan);
      check('stored order plan is untouched', order(o).plan === 'monthly', order(o).plan);
    }

    console.log('\n=== 3. quarterly payment + quarterly request -> quarterly entitlement ===');
    {
      const o = addOrder('q_q', 'quarterly'), p = newPayId();
      const r = await verify('q_q', o, p, { plan: 'quarterly' });
      check('200 ok', r.status === 200 && r.body?.ok === true, JSON.stringify(r));
      check('premium for ~90 days', isDays(user('q_q').premium_expires_at, 90), `days=${daysLeft(user('q_q').premium_expires_at)}`);
      check('users.premium_plan = "quarterly"', user('q_q').premium_plan === 'quarterly', user('q_q').premium_plan);
    }

    console.log('\n=== 4. quarterly payment + MANIPULATED monthly request -> quarterly entitlement (no downgrade either) ===');
    {
      const o = addOrder('q_m', 'quarterly'), p = newPayId();
      const r = await verify('q_m', o, p, { plan: 'monthly' });
      check('request accepted', r.status === 200, JSON.stringify(r));
      check('premium for ~90 days, NOT 30', isDays(user('q_m').premium_expires_at, 90), `days=${daysLeft(user('q_m').premium_expires_at)}`);
      check('users.premium_plan = "quarterly"', user('q_m').premium_plan === 'quarterly', user('q_m').premium_plan);
    }

    console.log('\n=== 5. client omits (or garbles) plan -> server derives it from the payment record ===');
    {
      const om = addOrder('omit_m', 'monthly'), oq = addOrder('omit_q', 'quarterly'), oj = addOrder('junk', 'monthly');
      const r1 = await verify('omit_m', om, newPayId());                       // no plan field at all
      const r2 = await verify('omit_q', oq, newPayId());                       // no plan field at all — quarterly buyer
      const r3 = await verify('junk', oj, newPayId(), { plan: 'lifetime-forever' });   // unknown plan string
      check('monthly order, plan omitted -> 200', r1.status === 200, JSON.stringify(r1));
      check('monthly order, plan omitted -> ~30 days, premium_plan "monthly"', isDays(user('omit_m').premium_expires_at, 30) && user('omit_m').premium_plan === 'monthly', `days=${daysLeft(user('omit_m').premium_expires_at)} plan=${user('omit_m').premium_plan}`);
      check('quarterly order, plan omitted -> 200', r2.status === 200, JSON.stringify(r2));
      check('quarterly order, plan omitted -> ~90 days, premium_plan "quarterly"  (was: silently 30)', isDays(user('omit_q').premium_expires_at, 90) && user('omit_q').premium_plan === 'quarterly', `days=${daysLeft(user('omit_q').premium_expires_at)} plan=${user('omit_q').premium_plan}`);
      check('unknown client plan string -> 200, stored order plan wins (~30 days)', r3.status === 200 && isDays(user('junk').premium_expires_at, 30), JSON.stringify(r3));
      check('unknown client plan string is NOT written to users.premium_plan', user('junk').premium_plan === 'monthly', user('junk').premium_plan);
    }

    console.log('\n=== 6. webhook and direct verification derive the SAME plan from the same persisted data ===');
    {
      // same persisted plan, two different paths (one of them with a manipulated body)
      const owm = addOrder('wh_m', 'monthly'), owq = addOrder('wh_q', 'quarterly');
      const ovm = addOrder('vf_m', 'monthly'), ovq = addOrder('vf_q', 'quarterly');
      const w1 = await webhook(owm, newPayId()), w2 = await webhook(owq, newPayId());
      const v1 = await verify('vf_m', ovm, newPayId(), { plan: 'quarterly' });   // manipulated
      const v2 = await verify('vf_q', ovq, newPayId(), { plan: 'monthly' });     // manipulated
      check('webhooks accepted (200)', w1.status === 200 && w2.status === 200, JSON.stringify([w1, w2]));
      check('verifies accepted (200)', v1.status === 200 && v2.status === 200, JSON.stringify([v1, v2]));
      check('monthly order: webhook days == verify days (~30)', isDays(user('wh_m').premium_expires_at, 30) && isDays(user('vf_m').premium_expires_at, 30), `wh=${daysLeft(user('wh_m').premium_expires_at)} vf=${daysLeft(user('vf_m').premium_expires_at)}`);
      check('quarterly order: webhook days == verify days (~90)', isDays(user('wh_q').premium_expires_at, 90) && isDays(user('vf_q').premium_expires_at, 90), `wh=${daysLeft(user('wh_q').premium_expires_at)} vf=${daysLeft(user('vf_q').premium_expires_at)}`);
      check('premium_plan agrees across both paths (monthly)', user('wh_m').premium_plan === 'monthly' && user('vf_m').premium_plan === 'monthly', `${user('wh_m').premium_plan}/${user('vf_m').premium_plan}`);
      check('premium_plan agrees across both paths (quarterly)', user('wh_q').premium_plan === 'quarterly' && user('vf_q').premium_plan === 'quarterly', `${user('wh_q').premium_plan}/${user('vf_q').premium_plan}`);
    }

    console.log('\n=== 7. replaying the same valid payment does not change the plan/entitlement ===');
    {
      const o = addOrder('replay', 'monthly'), p = newPayId();
      const first = await verify('replay', o, p, { plan: 'monthly' });
      const expiryAfterFirst = user('replay').premium_expires_at, planAfterFirst = user('replay').premium_plan;
      const again = await verify('replay', o, p, { plan: 'quarterly' });     // replay + manipulated plan
      const whAgain = await webhook(o, p);                                    // and the webhook for the same payment
      check('first verify 200', first.status === 200, JSON.stringify(first));
      check('replayed verify (with manipulated plan) -> 200 alreadyActivated', again.status === 200 && again.body?.alreadyActivated === true, JSON.stringify(again).slice(0, 200));
      check('expiry unchanged after replay', user('replay').premium_expires_at === expiryAfterFirst, `${expiryAfterFirst} -> ${user('replay').premium_expires_at}`);
      check('premium_plan unchanged after replay', user('replay').premium_plan === planAfterFirst && planAfterFirst === 'monthly', user('replay').premium_plan);
      check('webhook replay for the same payment: accepted, entitlement unchanged', whAgain.status === 200 && user('replay').premium_expires_at === expiryAfterFirst, `${whAgain.status} ${user('replay').premium_expires_at}`);
    }

    console.log('\n=== 8. invalid / nonexistent payments: existing rejection behavior preserved ===');
    {
      const t = await paymentToken('other_a');
      const nonexistent = await api('POST', '/api/payments/verify', { token: t, body: { razorpay_order_id: 'order_does_not_exist', razorpay_payment_id: 'pay_x', razorpay_signature: sign('order_does_not_exist', 'pay_x'), plan: 'quarterly' } });
      check('nonexistent order (valid signature) -> 404 "Order not found"', nonexistent.status === 404 && nonexistent.body?.error === 'Order not found', JSON.stringify(nonexistent));

      const oA = addOrder('other_a', 'monthly');
      const badSig = await api('POST', '/api/payments/verify', { token: t, body: { razorpay_order_id: oA, razorpay_payment_id: 'pay_y', razorpay_signature: 'deadbeef', plan: 'quarterly' } });
      check('bad signature -> 400 "Invalid payment signature"', badSig.status === 400 && /Invalid payment signature/.test(badSig.body?.error || ''), JSON.stringify(badSig));

      const missing = await api('POST', '/api/payments/verify', { token: t, body: { razorpay_order_id: oA, plan: 'quarterly' } });
      check('missing payment fields -> 400', missing.status === 400 && /Missing payment fields/.test(missing.body?.error || ''), JSON.stringify(missing));

      const tB = await paymentToken('other_b');
      const notMine = await api('POST', '/api/payments/verify', { token: tB, body: { razorpay_order_id: oA, razorpay_payment_id: 'pay_z', razorpay_signature: sign(oA, 'pay_z'), plan: 'monthly' } });
      check("someone else's order -> 403 \"does not belong to you\"", notMine.status === 403 && /does not belong/.test(notMine.body?.error || ''), JSON.stringify(notMine));

      const regularToken = await api('POST', '/api/payments/verify', { token: loginToken('other_a'), body: { razorpay_order_id: oA, razorpay_payment_id: 'pay_w', razorpay_signature: sign(oA, 'pay_w') } });
      check('non-payment-scoped token -> 403', regularToken.status === 403, JSON.stringify(regularToken));
      const noAuth = await api('POST', '/api/payments/verify', { body: { razorpay_order_id: oA, razorpay_payment_id: 'pay_w', razorpay_signature: sign(oA, 'pay_w') } });
      check('no token -> 401', noAuth.status === 401, JSON.stringify(noAuth));

      // payment id already redeemed by a DIFFERENT user (existing replay guard)
      const oB = addOrder('other_b', 'monthly');
      const redeemedByA = await verify('other_a', oA, 'pay_shared', {});
      const replayByB = await api('POST', '/api/payments/verify', { token: tB, body: { razorpay_order_id: oB, razorpay_payment_id: 'pay_shared', razorpay_signature: sign(oB, 'pay_shared'), plan: 'quarterly' } });
      check('setup: A redeems pay_shared legitimately', redeemedByA.status === 200, JSON.stringify(redeemedByA));
      check("B replaying A's payment id -> 409 (existing guard) and B gets nothing", replayByB.status === 409 && user('other_b').premium === false && order(oB).status === 'created', JSON.stringify(replayByB));

      const badWh = await api('POST', '/api/payments/webhook', { raw: '{"event":"payment.captured"}', headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': 'nope' } });
      check('webhook with a bad signature -> 400 (existing behavior)', badWh.status === 400, JSON.stringify(badWh));
      check('failed/invalid attempts granted nothing to other_b', user('other_b').premium === false && user('other_b').premium_expires_at === null);
    }

    console.log('\n=== 9. no unrelated user/account modification ===');
    {
      const sameBystander = JSON.stringify({ ...user('bystander'), last_active: null }) === JSON.stringify({ ...bystanderBefore, last_active: null });
      check('bystander user row untouched', sameBystander, JSON.stringify(user('bystander')));
      check('bystander payment row untouched', JSON.stringify(order(bystanderOrder)) === JSON.stringify(bystanderOrderBefore), JSON.stringify(order(bystanderOrder)));
      // each verify only ever writes premium fields (+ last_active) on the payer, never anything else
      const untouched = ['m_m', 'm_q', 'q_q', 'q_m'].every(id => { const u = user(id); return u.role === 'user' && u.banned === false && u.email === `${id}@example.test` && u.onboarding_stage === 'complete' && u.name === 'Test User'; });
      check('payers: only premium fields changed (role/ban/email/onboarding untouched)', untouched);
      check('unrelated pending order (bystander) still "created", no payment id', order(bystanderOrder).status === 'created' && order(bystanderOrder).razorpay_payment_id === null);
    }

    check('server still healthy at the end', (await api('GET', '/api/health')).status === 200 && exited === null);
  } finally {
    const gone = new Promise(r => { if (exited !== null) r(); else child.once('exit', r); });
    child.kill();
    await Promise.race([gone, sleep(5000)]);
    await new Promise(r => mock.close(r));
    try { fs.rmSync(emptyCwd, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch { /* empty temp dir */ }
  }

  console.log(`\n=== RESULTS: ${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('SCRIPT ERROR', e); process.exit(1); });
