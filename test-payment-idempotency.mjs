// Regression test for audit finding A5:
//
//   /api/payments/verify and /api/payments/webhook both processed a paid
//   payment as: read the payment (status not 'paid') -> grantOrExtendPremium
//   (read premium_expires_at, then write it) -> mark the payment 'paid'.
//   Those are separate database round trips with NO lock or atomic claim
//   between them, so concurrent verify + webhook (or two verifies, or two
//   webhook deliveries) could all observe "not yet paid" and each grant — one
//   payment, several entitlements. Separately, grantOrExtendPremium never
//   checked its write's error, so a failed premium write was followed by the
//   payment being marked 'paid' anyway: entitlement lost permanently.
//
// Invariant enforced here: ONE successful payment/order -> ONE premium
// entitlement grant, no matter how many verify/webhook calls arrive or how
// they interleave — and a failure while applying the entitlement can never
// leave the payment permanently marked paid without it.
//
// How it runs (nothing can touch production):
//   * a REAL PostgreSQL server (embedded-postgres, multi-connection) holds
//     minimal `users` + `payments` tables (+ test-only triggers that log every
//     premium write and every write that sets status='paid');
//   * migrations/022_*.sql is applied to it VERBATIM when present;
//   * the REAL, UNMODIFIED server.js runs against a tiny PostgREST-compatible
//     translator in front of that Postgres (SUPABASE_URL points at it), with an
//     empty working dir (no .env), whitelisted env and FAKE Razorpay secrets;
//   * the translator adds per-request latency (real Supabase round trips are
//     tens of ms) so concurrent requests genuinely interleave;
//   * `resend` is stubbed by a -r preload that records confirmation emails.
//
// Requires (test-only, not project dependencies):
//   npm install --no-save embedded-postgres pg
//
// Standalone script (repo convention); exit code = number of failed checks.

import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';

let EmbeddedPostgres, pg;
try { EmbeddedPostgres = (await import('embedded-postgres')).default; pg = (await import('pg')).default; }
catch { console.error('This test needs: npm install --no-save embedded-postgres pg'); process.exit(2); }

const here = path.dirname(fileURLToPath(import.meta.url));
const SERVER_JS = path.join(here, 'server.js');
const JWT_SECRET = 'test-only-jwt-secret';
const RZ_SECRET = 'test-only-razorpay-key-secret';
const WH_SECRET = 'test-only-razorpay-webhook-secret';
const LATENCY_MS = Number(process.env.A5_LATENCY_MS || 25);      // simulated Supabase round-trip
const MIGRATION = fs.readdirSync(path.join(here, 'migrations')).filter(f => /^022_.*\.sql$/.test(f)).map(f => path.join(here, 'migrations', f))[0];

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}  ${String(detail ?? '').slice(0, 260)}`); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise((resolve, reject) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); }); s.on('error', reject); });

// ── Real Postgres ────────────────────────────────────────────────────────────
const SCHEMA = `
CREATE TABLE users (
  id text PRIMARY KEY, email text, password text, name text, bio text, headline text, photos jsonb DEFAULT '[]', instagram text DEFAULT '', linkedin text DEFAULT '',
  website text DEFAULT '', location text DEFAULT '', lat numeric, lng numeric, remote boolean DEFAULT false, skills jsonb DEFAULT '[]', interests jsonb DEFAULT '[]',
  currently_exploring text DEFAULT '', working_on text DEFAULT '', interested_in text DEFAULT '', intent text DEFAULT 'explore-network', role text DEFAULT 'user',
  premium boolean DEFAULT false, premium_expires_at timestamptz, premium_plan text, premium_since timestamptz, trust_score int DEFAULT 10, profile_score int DEFAULT 30,
  is_profile_complete boolean DEFAULT false, verification jsonb DEFAULT '{"status":"none","confidence":0}', banned boolean DEFAULT false, deleted_at timestamptz,
  email_verified boolean DEFAULT true, onboarding_stage text DEFAULT 'complete', password_set boolean DEFAULT true, password_changed_at timestamptz, last_active timestamptz,
  created_at timestamptz DEFAULT now());
CREATE TABLE payments (
  id text PRIMARY KEY, user_id text NOT NULL, razorpay_order_id text NOT NULL, razorpay_payment_id text, plan text NOT NULL, currency text NOT NULL, amount int NOT NULL,
  status text NOT NULL DEFAULT 'created', created_at timestamptz NOT NULL DEFAULT now());
-- Test-only instrumentation: uniform, database-level truth for BOTH the old and the new implementation.
CREATE TABLE grant_log (id serial PRIMARY KEY, user_id text, old_expiry timestamptz, new_expiry timestamptz);
CREATE TABLE paid_log  (id serial PRIMARY KEY, order_id text, old_status text);
CREATE FUNCTION log_grant() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN INSERT INTO grant_log(user_id, old_expiry, new_expiry) VALUES (NEW.id, OLD.premium_expires_at, NEW.premium_expires_at); RETURN NEW; END $$;
CREATE TRIGGER users_grant_log AFTER UPDATE ON users FOR EACH ROW WHEN (NEW.premium_expires_at IS DISTINCT FROM OLD.premium_expires_at) EXECUTE FUNCTION log_grant();
CREATE FUNCTION log_paid() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN INSERT INTO paid_log(order_id, old_status) VALUES (NEW.id, OLD.status); RETURN NEW; END $$;
CREATE TRIGGER payments_paid_log AFTER UPDATE ON payments FOR EACH ROW WHEN (NEW.status = 'paid') EXECUTE FUNCTION log_paid();
`;
const FAULT_ON = `CREATE FUNCTION fail_user_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure while applying entitlement' USING ERRCODE = 'P0001'; END $$;
CREATE TRIGGER users_fault BEFORE UPDATE OF premium_expires_at ON users FOR EACH ROW WHEN (NEW.id = 'fail_user') EXECUTE FUNCTION fail_user_update();`;
const FAULT_OFF = `DROP TRIGGER users_fault ON users; DROP FUNCTION fail_user_update();`;

// ── PostgREST-compatible translator over the real Postgres ───────────────────
const NON_FILTER = new Set(['select', 'order', 'limit', 'offset', 'columns', 'on_conflict']);
let pool; const colTypes = {};
async function loadColTypes() {
  const r = await pool.query(`SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('users','payments')`);
  for (const row of r.rows) (colTypes[row.table_name] ||= {})[row.column_name] = row.data_type;
}
const requestLog = [];
function buildWhere(table, params, args) {
  const clauses = []; let unsupported = false;
  for (const [k, v] of params) {
    if (NON_FILTER.has(k)) continue;
    const m = /^(eq|neq|is)\.(.*)$/.exec(v);
    if (!m || !colTypes[table]?.[k]) { unsupported = true; continue; }
    if (m[1] === 'is') clauses.push(m[2] === 'null' ? `"${k}" IS NULL` : `"${k}"::text = '${m[2].replace(/'/g, "''")}'`);
    else { args.push(m[2]); clauses.push(`"${k}"::text ${m[1] === 'eq' ? '=' : '<>'} $${args.length}`); }
  }
  return { where: clauses.length ? 'WHERE ' + clauses.join(' AND ') : '', unsupported };
}
const pgErrorToPostgrest = e => ({ status: e.code === '42883' ? 404 : 400, body: { code: e.code === '42883' ? 'PGRST202' : e.code, message: e.message, details: e.detail ?? null, hint: e.hint ?? null } });

const translator = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', async () => {
    const url = new URL(req.url, 'http://mock');
    const p = url.pathname.replace(/^\/rest\/v1\//, '');
    const raw = Buffer.concat(chunks).toString('utf8');
    let body = null; try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
    const wantObject = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    const send = (status, payload, extra = {}) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...extra }); res.end(payload === undefined ? undefined : JSON.stringify(payload)); };
    const objectOr406 = list => list.length === 1 ? send(200, list[0]) : send(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: null, hint: null });
    requestLog.push({ method: req.method, path: p });
    await sleep(LATENCY_MS);     // one simulated network round trip per request
    try {
      if (p.startsWith('rpc/')) {
        const fn = p.slice(4);
        if (!/^[a-z_]+$/.test(fn)) return send(404, { code: 'PGRST202', message: `Could not find the function ${fn}` });
        const keys = Object.keys(body || {}); const args = keys.map(k => body[k]);
        const r = await pool.query(`SELECT ${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) AS r`, args);
        return send(200, r.rows[0].r);
      }
      if (!colTypes[p]) {
        return req.method === 'GET' || req.method === 'HEAD' ? send(200, [], { 'Content-Range': '*/0' }) : (res.writeHead(req.method === 'POST' ? 201 : 204), res.end());
      }
      if (req.method === 'GET' || req.method === 'HEAD') {
        const args = []; const { where, unsupported } = buildWhere(p, url.searchParams, args);
        const rows = unsupported ? [] : (await pool.query(`SELECT to_jsonb(t) AS r FROM ${p} t ${where}`, args)).rows.map(r => r.r);
        if (wantObject) return objectOr406(rows);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Range': `*/${rows.length}` });
        return res.end(req.method === 'HEAD' ? undefined : JSON.stringify(rows));
      }
      if (req.method === 'PATCH' && body && typeof body === 'object') {
        const args = []; const sets = [];
        for (const [k, v] of Object.entries(body)) {
          if (!colTypes[p][k]) continue;
          args.push(colTypes[p][k] === 'jsonb' ? JSON.stringify(v) : v); sets.push(`"${k}" = $${args.length}${colTypes[p][k] === 'jsonb' ? '::jsonb' : ''}`);
        }
        const { where, unsupported } = buildWhere(p, url.searchParams, args);
        const rows = (!unsupported && sets.length) ? (await pool.query(`UPDATE ${p} SET ${sets.join(', ')} ${where} RETURNING to_jsonb(${p}) AS r`, args)).rows.map(r => r.r) : [];
        if (/return=representation/.test(req.headers.prefer || '')) return wantObject ? objectOr406(rows) : send(200, rows, { 'Content-Range': `*/${rows.length}` });
        return send(204, undefined, { 'Content-Range': `*/${rows.length}` });
      }
      res.writeHead(req.method === 'POST' ? 201 : 204, { 'Content-Range': '*/0' }); res.end();
    } catch (e) {
      const { status, body: eb } = pgErrorToPostgrest(e);   // e.g. an injected failure inside the entitlement transaction
      send(status, eb);
    }
  });
});

// ── helpers over the real DB ─────────────────────────────────────────────────
const PLAN = { monthly: { days: 30, amount: 24900 }, quarterly: { days: 90, amount: 59900 } };
let seq = 0;
async function mkUser(id, over = {}) {
  await pool.query(`INSERT INTO users (id, email, name, premium, premium_expires_at, premium_plan) VALUES ($1, $2, 'Test User', $3, $4, $5)`,
    [id, `${id}@example.test`, over.premium ?? false, over.expiry ?? null, over.premium_plan ?? null]);
}
async function mkOrder(userId, plan) {
  const id = `order_${++seq}_${userId}`;
  await pool.query(`INSERT INTO payments (id, user_id, razorpay_order_id, plan, currency, amount) VALUES ($1,$2,$1,$3,'INR',$4)`, [id, userId, plan, PLAN[plan].amount]);
  return id;
}
const q1 = async (sql, args) => (await pool.query(sql, args)).rows[0];
const userRow = id => q1('SELECT * FROM users WHERE id=$1', [id]);
const orderRow = id => q1('SELECT * FROM payments WHERE id=$1', [id]);
const grantCount = async id => Number((await q1('SELECT count(*) c FROM grant_log WHERE user_id=$1', [id])).c);
const paidWrites = async oid => Number((await q1('SELECT count(*) c FROM paid_log WHERE order_id=$1', [oid])).c);
const daysFrom = (iso, from = Date.now()) => iso ? (new Date(iso).getTime() - from) / 864e5 : null;
const approx = (v, n, tol = 0.5) => v !== null && Math.abs(v - n) < tol;

async function main() {
  const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a5-pg-'));
  const pgPort = await freePort();
  const epg = new EmbeddedPostgres({ databaseDir: dbDir, user: 'postgres', password: 'pw', port: pgPort, persistent: false, onLog: () => {}, onError: () => {} });
  await epg.initialise(); await epg.start(); await epg.createDatabase('byn');
  pool = new pg.Pool({ host: '127.0.0.1', port: pgPort, user: 'postgres', password: 'pw', database: 'byn', max: 40 });
  await pool.query(SCHEMA);
  let migrationApplied = false;
  if (MIGRATION) { await pool.query(fs.readFileSync(MIGRATION, 'utf8')); migrationApplied = true; }
  await loadColTypes();
  console.log(`=== real Postgres up; migration 022 ${migrationApplied ? 'APPLIED (' + path.basename(MIGRATION) + ')' : 'NOT PRESENT (running against the current code path)'}; simulated DB latency ${LATENCY_MS}ms/request ===`);

  await new Promise(r => translator.listen(0, '127.0.0.1', r));
  const dbUrlPort = translator.address().port;
  const serverPort = await freePort();
  const BASE = `http://127.0.0.1:${serverPort}`;
  const emptyCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a5-'));

  // -r preload: stub the `resend` package so confirmation emails are recorded, never sent.
  const emailLog = path.join(emptyCwd, 'emails.log');
  const stub = path.join(emptyCwd, 'stub-resend.cjs');
  fs.writeFileSync(stub, `const Module = require('module'); const fs = require('fs'); const orig = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'resend') { return { Resend: class { constructor() { this.emails = { send: async (p) => { fs.appendFileSync(${JSON.stringify(emailLog)}, JSON.stringify({ to: p.to, subject: p.subject }) + '\\n'); return { data: { id: 'stub' }, error: null }; } }; } } }; }
  return orig.apply(this, arguments);
};`);
  const emailsTo = to => fs.existsSync(emailLog) ? fs.readFileSync(emailLog, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(e => e.to === to).length : 0;

  const env = {
    PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, SYSTEMROOT: process.env.SYSTEMROOT,
    TEMP: os.tmpdir(), TMP: os.tmpdir(), HOME: emptyCwd, USERPROFILE: emptyCwd,
    SUPABASE_URL: `http://127.0.0.1:${dbUrlPort}`, SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key',
    JWT_SECRET, ADMIN_SECRET: 'test-only-admin-secret', PORT: String(serverPort),
    RAZORPAY_KEY_ID: 'rzp_test_local_only', RAZORPAY_KEY_SECRET: RZ_SECRET, RAZORPAY_WEBHOOK_SECRET: WH_SECRET, RESEND_API_KEY: 'test-only-resend-key',
  };
  let out = '';
  const child = spawn(process.execPath, ['-r', stub, SERVER_JS], { cwd: emptyCwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
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
  const sign = (o, p) => crypto.createHmac('sha256', RZ_SECRET).update(`${o}|${p}`).digest('hex');
  let pid = 0; const newPayId = () => `pay_test_${++pid}`;
  const verifyReq = (t, o, p, extra = {}) => api('POST', '/api/payments/verify', { token: t, body: { razorpay_order_id: o, razorpay_payment_id: p, razorpay_signature: sign(o, p), ...extra } });
  const webhookReq = (o, p) => {
    const raw = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { order_id: o, id: p } } } });
    return api('POST', '/api/payments/webhook', { raw, headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': crypto.createHmac('sha256', WH_SECRET).update(raw).digest('hex') } });
  };
  const summarize = rs => ({ requests: rs.length, http200: rs.filter(r => r.status === 200).length, alreadyProcessedReplies: rs.filter(r => r.body?.alreadyActivated).length, verifyGrantedReplies: rs.filter(r => r.body?.premium === true && !r.body?.alreadyActivated).length, other: rs.filter(r => r.status !== 200).map(r => r.status) });

  // concurrent scenario runner: records everything the spec asks for
  async function race(label, userId, plan, { verifies = 0, webhooks = 0, clientPlan, order: orderId } = {}) {
    const oid = orderId || await mkOrder(userId, plan), p = newPayId();
    const t = verifies ? await paymentToken(userId) : null;
    const before = await userRow(userId); const t0 = Date.now();
    const jobs = [];
    for (let i = 0; i < Math.max(verifies, webhooks); i++) {          // interleave so both kinds are in flight together
      if (i < verifies) jobs.push(verifyReq(t, oid, p, clientPlan ? { plan: clientPlan } : {}).then(r => ({ kind: 'verify', ...r })));
      if (i < webhooks) jobs.push(webhookReq(oid, p).then(r => ({ kind: 'webhook', ...r })));
    }
    const rs = await Promise.all(jobs);
    await sleep(300);
    const after = await userRow(userId), ord = await orderRow(oid);
    const s = summarize(rs);
    const grants = await grantCount(userId), pw = await paidWrites(oid);
    console.log(`     [${label}] requests=${s.requests} (verify ${verifies}/webhook ${webhooks}) | verify replies that granted=${s.verifyGrantedReplies}, already-processed=${s.alreadyProcessedReplies}, non-200=${JSON.stringify(s.other)} | DB premium-expiry writes=${grants}, writes setting status=paid=${pw} | final status=${ord.status}, expiry=+${daysFrom(after.premium_expires_at, t0)?.toFixed(2)}d (base ${before.premium_expires_at ? '+' + daysFrom(before.premium_expires_at, t0).toFixed(1) + 'd' : 'none'}), plan=${after.premium_plan}`);
    return { oid, p, before, after, ord, grants, pw, rs, s, t0 };
  }

  try {
    const bootDeadline = Date.now() + 60000;
    while (!/Server on port/.test(out) && exited === null && Date.now() < bootDeadline) await sleep(200);
    check('server booted (real server.js, real Postgres, fake Razorpay secrets)', /Server on port/.test(out), out.slice(-300));
    for (const id of ['once_m', 'once_q', 'c_verify', 'c_hook', 'c_mixed', 'c_plan', 'dup', 'stagger', 'fail_user', 'bal_future', 'bal_past', 'bad', 'other_a', 'other_b', 'email1', 'email2', 'bystander']) await mkUser(id);
    await pool.query(`UPDATE users SET premium = true, premium_expires_at = now() + interval '11 days', premium_plan = 'monthly' WHERE id = 'bystander'`);
    const bystanderBefore = JSON.stringify(await userRow('bystander'));
    const bystanderOrder = await mkOrder('bystander', 'quarterly');
    const bystanderOrderBefore = JSON.stringify(await orderRow(bystanderOrder));
    await pool.query('DELETE FROM grant_log');

    console.log('\n=== 1/2. single processing: monthly -> ~30d, quarterly -> ~90d ===');
    {
      const a = await race('monthly x1', 'once_m', 'monthly', { verifies: 1 });
      check('monthly: exactly one grant, ~30 days, plan monthly, status paid', a.grants === 1 && approx(daysFrom(a.after.premium_expires_at, a.t0), 30) && a.after.premium_plan === 'monthly' && a.ord.status === 'paid', JSON.stringify({ g: a.grants, e: a.after.premium_expires_at }));
      const b = await race('quarterly x1', 'once_q', 'quarterly', { webhooks: 1 });
      check('quarterly (via webhook): exactly one grant, ~90 days, plan quarterly, status paid', b.grants === 1 && approx(daysFrom(b.after.premium_expires_at, b.t0), 90) && b.after.premium_plan === 'quarterly' && b.ord.status === 'paid', JSON.stringify({ g: b.grants, e: b.after.premium_expires_at }));
    }

    console.log('\n=== 3. 10 concurrent VERIFY requests for one payment ===');
    {
      const r = await race('10 verify', 'c_verify', 'monthly', { verifies: 10 });
      check('one entitlement only (1 premium write)', r.grants === 1, `premium writes=${r.grants}`);
      check('expiry = exactly one monthly grant (~30d, not 60/300)', approx(daysFrom(r.after.premium_expires_at, r.t0), 30), `+${daysFrom(r.after.premium_expires_at, r.t0)}d`);
      check('payment marked paid exactly once (1 write setting paid)', r.ord.status === 'paid' && r.pw === 1, `paid writes=${r.pw}`);
      check('exactly 1 request granted; the other 9 were told already-processed', r.s.verifyGrantedReplies === 1 && r.s.alreadyProcessedReplies === 9 && r.s.http200 === 10, JSON.stringify(r.s));
    }

    console.log('\n=== 4. 10 concurrent WEBHOOK deliveries for one payment ===');
    {
      const r = await race('10 webhook', 'c_hook', 'quarterly', { webhooks: 10 });
      check('one entitlement only (1 premium write)', r.grants === 1, `premium writes=${r.grants}`);
      check('expiry = exactly one quarterly grant (~90d)', approx(daysFrom(r.after.premium_expires_at, r.t0), 90), `+${daysFrom(r.after.premium_expires_at, r.t0)}d`);
      check('payment marked paid exactly once', r.ord.status === 'paid' && r.pw === 1, `paid writes=${r.pw}`);
      check('all 10 deliveries answered 200 (Razorpay must never see a retry-triggering error)', r.s.http200 === 10, JSON.stringify(r.s));
    }

    console.log('\n=== 5. 5 VERIFY + 5 WEBHOOK concurrently ===');
    {
      const r = await race('5 verify + 5 webhook', 'c_mixed', 'monthly', { verifies: 5, webhooks: 5 });
      check('one entitlement only (1 premium write)', r.grants === 1, `premium writes=${r.grants}`);
      check('expiry = exactly one monthly grant (~30d)', approx(daysFrom(r.after.premium_expires_at, r.t0), 30), `+${daysFrom(r.after.premium_expires_at, r.t0)}d`);
      check('payment marked paid exactly once', r.ord.status === 'paid' && r.pw === 1, `paid writes=${r.pw}`);
      check('at most one verify reply claims to have granted', r.s.verifyGrantedReplies <= 1, JSON.stringify(r.s));
    }

    console.log('\n=== 6. duplicate requests AFTER successful processing (client retry / lost webhook response) ===');
    {
      const r = await race('first processing', 'dup', 'monthly', { verifies: 1 });
      const expiry = r.after.premium_expires_at, t = await paymentToken('dup');
      const again = [await verifyReq(t, r.oid, r.p), await webhookReq(r.oid, r.p), await verifyReq(t, r.oid, r.p, { plan: 'quarterly' }), await webhookReq(r.oid, r.p)];
      await sleep(200);
      const after = await userRow('dup');
      check('retries all answered 200 (idempotent, not an error)', again.every(x => x.status === 200), JSON.stringify(again.map(x => x.status)));
      check('no additional premium write, expiry unchanged', (await grantCount('dup')) === 1 && new Date(after.premium_expires_at).getTime() === new Date(expiry).getTime(), `writes=${await grantCount('dup')} ${expiry} -> ${after.premium_expires_at}`);
      check('payment still marked paid exactly once', (await paidWrites(r.oid)) === 1, `paid writes=${await paidWrites(r.oid)}`);
    }

    console.log('\n=== 7. client plan manipulation stays ineffective under concurrency (A4 preserved) ===');
    {
      const r = await race('monthly order, plan:"quarterly" x5 + webhook x5', 'c_plan', 'monthly', { verifies: 5, webhooks: 5, clientPlan: 'quarterly' });
      check('one entitlement, ~30 days (stored monthly plan), plan "monthly"', r.grants === 1 && approx(daysFrom(r.after.premium_expires_at, r.t0), 30) && r.after.premium_plan === 'monthly', JSON.stringify({ g: r.grants, e: daysFrom(r.after.premium_expires_at, r.t0), p: r.after.premium_plan }));
    }

    console.log('\n=== staggered overlap: verify, then webhook and verify arriving while the first is still in flight ===');
    {
      const oid = await mkOrder('stagger', 'monthly'), p = newPayId(), t = await paymentToken('stagger'), t0 = Date.now();
      const jobs = [verifyReq(t, oid, p)];
      for (const delay of [LATENCY_MS * 1, LATENCY_MS * 2, LATENCY_MS * 3, LATENCY_MS * 4]) jobs.push(sleep(delay).then(() => (delay / LATENCY_MS) % 2 ? webhookReq(oid, p) : verifyReq(t, oid, p)));
      await Promise.all(jobs); await sleep(300);
      const a = await userRow('stagger'), g = await grantCount('stagger');
      console.log(`     [staggered x5] premium-expiry writes=${g}, expiry=+${daysFrom(a.premium_expires_at, t0)?.toFixed(2)}d, paid writes=${await paidWrites(oid)}`);
      check('staggered overlaps still yield one grant of ~30 days', g === 1 && approx(daysFrom(a.premium_expires_at, t0), 30), `writes=${g} +${daysFrom(a.premium_expires_at, t0)}d`);
    }

    console.log('\n=== 8/9. rejections preserved (bad signature, wrong user, nonexistent order) — and they grant nothing ===');
    {
      const oid = await mkOrder('bad', 'monthly'), tBad = await paymentToken('bad'), tA = await paymentToken('other_a'), tB = await paymentToken('other_b');
      const badSig = await api('POST', '/api/payments/verify', { token: tBad, body: { razorpay_order_id: oid, razorpay_payment_id: 'pay_bad', razorpay_signature: 'deadbeef', plan: 'monthly' } });
      check('invalid signature -> 400 "Invalid payment signature"', badSig.status === 400 && /Invalid payment signature/.test(badSig.body?.error || ''), JSON.stringify(badSig));
      const wrongUser = await verifyReq(tA, oid, 'pay_wrong');
      check("wrong user's order -> 403 \"does not belong to you\"", wrongUser.status === 403 && /does not belong/.test(wrongUser.body?.error || ''), JSON.stringify(wrongUser));
      const ghost = await api('POST', '/api/payments/verify', { token: tB, body: { razorpay_order_id: 'order_ghost', razorpay_payment_id: 'pay_ghost', razorpay_signature: sign('order_ghost', 'pay_ghost') } });
      check('nonexistent order -> 404 "Order not found"', ghost.status === 404 && ghost.body?.error === 'Order not found', JSON.stringify(ghost));
      const badHook = await api('POST', '/api/payments/webhook', { raw: '{"event":"payment.captured"}', headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': 'nope' } });
      check('webhook with a bad signature -> 400', badHook.status === 400, JSON.stringify(badHook));
      const hookGhost = await webhookReq('order_ghost', 'pay_ghost');
      check('webhook for an unknown order -> 200 no-op (existing behavior)', hookGhost.status === 200, JSON.stringify(hookGhost));
      const u = await userRow('bad'), o = await orderRow(oid);
      check('none of the rejected/no-op requests granted anything or changed the order', u.premium === false && u.premium_expires_at === null && o.status === 'created' && o.razorpay_payment_id === null, JSON.stringify({ u: u.premium_expires_at, o: o.status }));
      // a payment id already redeemed by ANOTHER user (existing replay guard)
      const oA = await mkOrder('other_a', 'monthly'), oB = await mkOrder('other_b', 'monthly');
      const okA = await verifyReq(tA, oA, 'pay_shared');
      const replayB = await verifyReq(tB, oB, 'pay_shared');
      check("B replaying A's already-redeemed payment id -> 409 and gets nothing", okA.status === 200 && replayB.status === 409 && (await userRow('other_b')).premium === false && (await orderRow(oB)).status === 'created', JSON.stringify({ a: okA.status, b: replayB.status }));
    }

    console.log('\n=== 10. FAILED entitlement transaction must not leave the payment permanently paid ===');
    {
      const oid = await mkOrder('fail_user', 'monthly'), p = newPayId(), t = await paymentToken('fail_user');
      await pool.query(FAULT_ON);         // premium write for this user now fails inside the processing step
      const v = await verifyReq(t, oid, p), w = await webhookReq(oid, p);
      const midOrder = await orderRow(oid), midUser = await userRow('fail_user');
      console.log(`     [failure injected] verify -> HTTP ${v.status}, webhook -> HTTP ${w.status}; order status=${midOrder.status}, payment id=${midOrder.razorpay_payment_id}, premium=${midUser.premium}, expiry=${midUser.premium_expires_at}`);
      check('failed verify does NOT report success', v.status >= 500 && v.body?.ok !== true, JSON.stringify(v));
      check('failed webhook answers non-2xx so Razorpay retries it', w.status >= 500, JSON.stringify(w));
      check('payment is NOT left marked paid (status still "created", no payment id recorded)', midOrder.status === 'created' && midOrder.razorpay_payment_id === null, JSON.stringify(midOrder));
      check('user got no entitlement from the failed attempts', midUser.premium === false && midUser.premium_expires_at === null);
      await pool.query(FAULT_OFF);        // the transient fault clears
      const retry = await webhookReq(oid, p);   // Razorpay's retry
      await sleep(200);
      const okOrder = await orderRow(oid), okUser = await userRow('fail_user');
      check('after the fault clears, the retry grants the entitlement exactly once (nothing was lost)', retry.status === 200 && okOrder.status === 'paid' && (await grantCount('fail_user')) === 1 && approx(daysFrom(okUser.premium_expires_at), 30), JSON.stringify({ s: retry.status, o: okOrder.status, g: await grantCount('fail_user'), e: okUser.premium_expires_at }));
      const dupe = await verifyReq(t, oid, p);
      check('a later verify for that payment is a no-op (already processed)', dupe.status === 200 && (await grantCount('fail_user')) === 1, JSON.stringify(dupe).slice(0, 160));
    }

    console.log('\n=== 11. existing premium balance is preserved when the ONE legitimate grant is applied ===');
    {
      await pool.query(`UPDATE users SET premium = true, premium_expires_at = now() + interval '10 days', premium_plan = 'monthly' WHERE id = 'bal_future'`);
      await pool.query(`UPDATE users SET premium = true, premium_expires_at = now() - interval '5 days', premium_plan = 'monthly' WHERE id = 'bal_past'`);
      await pool.query(`DELETE FROM grant_log WHERE user_id IN ('bal_future', 'bal_past')`);   // the setup writes above are not grants
      const f = await race('unexpired balance +10d, monthly x(5+5)', 'bal_future', 'monthly', { verifies: 5, webhooks: 5 });
      check('future balance: expiry = old balance + exactly 30 days (~40d), one grant', f.grants === 1 && approx(daysFrom(f.after.premium_expires_at, f.t0), 40), `writes=${f.grants} +${daysFrom(f.after.premium_expires_at, f.t0)}d`);
      const p = await race('expired balance -5d, quarterly x(5+5)', 'bal_past', 'quarterly', { verifies: 5, webhooks: 5 });
      check('expired balance: extends from NOW (~90d), not from the stale past date, one grant', p.grants === 1 && approx(daysFrom(p.after.premium_expires_at, p.t0), 90), `writes=${p.grants} +${daysFrom(p.after.premium_expires_at, p.t0)}d`);
    }

    console.log('\n=== confirmation e-mail: only the request that actually granted sends one — never a duplicate ===');
    {
      // NOTE: only /verify has ever sent this e-mail; the webhook path never has (existing behavior, unchanged by A5).
      const e1 = emailsTo('email1@example.test');
      const single = await race('e-mail: single verify', 'email1', 'monthly', { verifies: 1 });
      await sleep(300);
      check('a single verify sends exactly one confirmation e-mail', emailsTo('email1@example.test') - e1 === 1, `emails=${emailsTo('email1@example.test') - e1}`);
      const t1 = await paymentToken('email1'); await verifyReq(t1, single.oid, single.p); await webhookReq(single.oid, single.p); await sleep(300);
      check('duplicate verify/webhook deliveries afterwards send no further e-mail', emailsTo('email1@example.test') - e1 === 1, `emails=${emailsTo('email1@example.test') - e1}`);

      const e2 = emailsTo('email2@example.test');
      const r = await race('e-mail: 6 verify + 4 webhook', 'email2', 'monthly', { verifies: 6, webhooks: 4 });
      await sleep(300);
      const sent = emailsTo('email2@example.test') - e2;
      check('racing verify+webhook: at most ONE e-mail, and only if a verify was the request that granted', sent <= 1 && sent === r.s.verifyGrantedReplies, `emails=${sent} verifyGranted=${r.s.verifyGrantedReplies}`);
    }

    console.log('\n=== 12. unrelated users / orders untouched ===');
    {
      check("bystander's premium state (row) unchanged", JSON.stringify(await userRow('bystander')) === bystanderBefore, 'row changed');
      check("bystander's pending order unchanged", JSON.stringify(await orderRow(bystanderOrder)) === bystanderOrderBefore);
      check('bystander had no premium writes at all', (await grantCount('bystander')) === 0);
    }
    check('server still healthy at the end', (await api('GET', '/api/health')).status === 200 && exited === null);
  } finally {
    const gone = new Promise(r => { if (exited !== null) r(); else child.once('exit', r); });
    child.kill(); await Promise.race([gone, sleep(5000)]);
    await new Promise(r => translator.close(r));
    try { await pool.end(); } catch {}
    try { await epg.stop(); } catch {}
    await sleep(500);
    for (const d of [emptyCwd, dbDir]) { try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch { /* temp dir only */ } }
  }

  console.log(`\n=== RESULTS: ${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('SCRIPT ERROR', e); process.exit(1); });
