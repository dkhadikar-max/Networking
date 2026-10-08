// Server-level test (Part B of the payments spec): the Razorpay webhook handles refunds and disputes.
//
//   Before: the webhook handled only payment.captured. A refund or a chargeback fell through to
//   200 { ok: true } with no action and no log, so the buyer kept the premium they had been refunded for.
//   Now (migrations/027 + server.js): refund.* / payment.dispute.* events are recorded in an append-only
//   ledger (idempotent on x-razorpay-event-id) and applied atomically - a FULL refund or a LOST dispute
//   removes exactly the days that payment contributed; a partial refund and an opened dispute are
//   record-only; a deleted account's refund is record-only; the logic itself is proven in
//   test-payment-reversal-sql.mjs, this file proves it is wired correctly through the real server.
//
// Covered here: signature check unchanged; unrelated events and malformed payloads are acknowledged
// without side effects; full refund / partial refund / dispute opened-then-lost end to end; duplicate
// delivery (with and without the event-id header); the auth cache is invalidated (the user sees the
// free tier on the very next request); refund-before-capture (out of order) + /verify answering 409 for a
// refunded payment instead of the premium success screen; a replayed capture cannot re-grant; a mid-
// transaction failure answers 5xx, rolls the ledger row back, and the redelivery then applies; the
// read-only admin view.
//
// How it runs (nothing can touch production): the REAL server.js (or $SERVER_JS) against a
// PostgREST-compatible translator (now also forwarding /rpc/*) over a REAL PostgreSQL
// (embedded-postgres, UTF-8) with migrations 022, 026 and 027 applied VERBATIM; empty cwd (no .env),
// whitelisted env, FAKE Razorpay secrets.
// Requires (test-only): npm install --no-save embedded-postgres pg
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
const SERVER_JS = process.env.SERVER_JS ? path.resolve(process.env.SERVER_JS) : path.join(here, 'server.js');
const JWT_SECRET = 'test-only-jwt-secret';

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}  ${String(detail ?? '').slice(0, 300)}`); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise((resolve, reject) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); }); s.on('error', reject); });
async function waitFor(fn, ms = 15000, step = 250) { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) return v; await sleep(step); } }

const DDL = `
CREATE TABLE users (
  id text PRIMARY KEY, email text, password text, name text NOT NULL DEFAULT '', bio text, headline text, photos jsonb DEFAULT '[]', instagram text DEFAULT '', linkedin text DEFAULT '',
  website text DEFAULT '', location text DEFAULT '', lat numeric, lng numeric, remote boolean DEFAULT false, skills jsonb DEFAULT '[]', interests jsonb DEFAULT '[]',
  currently_exploring text DEFAULT '', working_on text DEFAULT '', interested_in text DEFAULT '', intent text, role text DEFAULT 'user',
  premium boolean DEFAULT false, premium_expires_at timestamptz, premium_plan text, premium_since timestamptz, trust_score int DEFAULT 10, profile_score int DEFAULT 30,
  is_profile_complete boolean DEFAULT false, verification jsonb DEFAULT '{"status":"none","confidence":0}', banned boolean DEFAULT false, deleted_at timestamptz,
  email_verified boolean, onboarding_stage text, password_set boolean DEFAULT true, password_changed_at timestamptz, push_token text,
  last_active timestamptz, created_at timestamptz DEFAULT now(),
  reply_count int DEFAULT 0, avg_reply_minutes int DEFAULT 0, response_rate int DEFAULT 100);
CREATE TABLE swipes (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, from_user text NOT NULL, to_user text NOT NULL, direction text NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE blocks (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, from_user text NOT NULL, to_user text NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE connections (id text PRIMARY KEY, user1 text NOT NULL, user2 text NOT NULL, created_at timestamptz DEFAULT now(), expires_at timestamptz, first_response_deadline timestamptz,
  user1_responded boolean DEFAULT false, user2_responded boolean DEFAULT false, active boolean DEFAULT false, status text, user1_last_read_at timestamptz, user2_last_read_at timestamptz);
CREATE TABLE messages (id text PRIMARY KEY, connection_id text NOT NULL, sender_id text NOT NULL, text text, created_at timestamptz DEFAULT now());
`;

// ---- PostgREST-compatible translator over the real Postgres (select= lists, and(...) inside or(...)) ----
let pool;
class PgLike extends Error { constructor(status, code, message) { super(message); this.status = status; this.pgCode = code; } }
const NON_FILTER = new Set(['select', 'order', 'limit', 'offset', 'columns', 'on_conflict']);
async function tableCols(table) {
  const r = await pool.query(`SELECT column_name, udt_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`, [table]);
  return r.rows.length ? new Map(r.rows.map(x => [x.column_name, x.udt_name])) : null;
}
function cond(table, cols, args, col, notFlag, op, val) {
  if (!cols.has(col)) throw new PgLike(400, '42703', `column ${table}.${col} does not exist`);
  const udt = cols.get(col); const q = `"${col}"`; let sql;
  if (op === 'is') sql = `${q} IS ${val === 'null' ? 'NULL' : val === 'true' ? 'TRUE' : 'FALSE'}`;
  else if (op === 'in') { args.push(val.replace(/^\(|\)$/g, '').split(',').map(s => s.replace(/^"|"$/g, ''))); sql = `${q} = ANY($${args.length}::${udt}[])`; }
  else if (['eq', 'neq', 'gt', 'gte', 'lt', 'lte'].includes(op)) { args.push(val); sql = `${q} ${{ eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }[op]} $${args.length}::${udt}`; }
  else throw new PgLike(400, 'PGRST100', `unsupported operator ${op}`);
  return notFlag ? `NOT (${sql})` : sql;
}
function splitTop(s) { const out = []; let depth = 0, cur = ''; for (const ch of s) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch; } if (cur) out.push(cur); return out; }
function orItem(table, cols, args, item) {
  const g = /^and\((.*)\)$/.exec(item);
  if (g) return '(' + splitTop(g[1]).map(c => orItem(table, cols, args, c)).join(' AND ') + ')';
  const m = /^([a-z_0-9]+)\.(not\.)?([a-z]+)\.(.*)$/.exec(item); if (!m) throw new PgLike(400, 'PGRST100', `bad or() condition ${item}`);
  return cond(table, cols, args, m[1], !!m[2], m[3], m[4]);
}
function where(table, cols, params, args) {
  const parts = [];
  for (const [k, v] of params) {
    if (NON_FILTER.has(k)) continue;
    if (k === 'or') { parts.push('(' + splitTop(v.replace(/^\(|\)$/g, '')).map(c => orItem(table, cols, args, c)).join(' OR ') + ')'); continue; }
    const m = /^(not\.)?([a-z]+)\.(.*)$/.exec(v); if (!m) throw new PgLike(400, 'PGRST100', `bad filter ${k}=${v}`);
    parts.push(cond(table, cols, args, k, !!m[1], m[2], m[3]));
  }
  return parts.length ? 'WHERE ' + parts.join(' AND ') : '';
}
function orderBy(cols, params) {
  const o = params.get('order'); if (!o) return '';
  return 'ORDER BY ' + o.split(',').map(s => { const [c, d] = s.split('.'); if (!cols.has(c)) throw new PgLike(400, '42703', `column ${c} does not exist`); return `"${c}" ${d === 'desc' ? 'DESC' : 'ASC'}`; }).join(', ');
}
function pick(row, selectParam, cols, table) {
  if (!selectParam || selectParam === '*' || selectParam.includes('(')) return row;
  const out = {}; for (const c of selectParam.split(',').map(s => s.trim()).filter(Boolean)) { if (!cols.has(c)) throw new PgLike(400, '42703', `column ${table}.${c} does not exist`); out[c] = row[c]; }
  return out;
}
const translator = http.createServer((req, res) => {
  const chunks = []; req.on('data', c => chunks.push(c));
  req.on('end', async () => {
    const url = new URL(req.url, 'http://mock'); const table = url.pathname.replace(/^\/rest\/v1\//, '');
    const raw = Buffer.concat(chunks).toString('utf8'); let body = null; try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
    const wantObject = (req.headers.accept || '').includes('vnd.pgrst.object+json'); const prefer = req.headers.prefer || '';
    const send = (status, payload, extra = {}) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...extra }); res.end(payload === undefined ? undefined : JSON.stringify(payload)); };
    const objectOr406 = list => list.length === 1 ? send(200, list[0]) : send(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: null, hint: null });
    try {
      if (table.startsWith('rpc/')) {
        const fn = table.slice(4);
        if (!/^[a-z_]+$/.test(fn)) return send(404, { code: 'PGRST202', message: `Could not find the function ${fn}`, details: null, hint: null });
        const keys = Object.keys(body || {});
        const args = keys.map(k => (body[k] !== null && typeof body[k] === 'object') ? JSON.stringify(body[k]) : body[k]);
        const rr = await pool.query(`SELECT ${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) AS r`, args);
        return send(200, rr.rows[0].r);
      }
      const cols = await tableCols(table);
      if (!cols) return req.method === 'GET' || req.method === 'HEAD' ? send(200, [], { 'Content-Range': '*/0' }) : (res.writeHead(req.method === 'POST' ? 201 : 204), res.end());
      const knownCols = payload => { for (const c of Object.keys(payload)) if (!cols.has(c)) throw new PgLike(400, 'PGRST204', `Could not find the '${c}' column of '${table}' in the schema cache`); };
      const cast = (c, v) => cols.get(c) === 'jsonb' ? JSON.stringify(v) : v;
      if (req.method === 'GET' || req.method === 'HEAD') {
        const args = []; const w = where(table, cols, url.searchParams, args); const ob = orderBy(cols, url.searchParams); const lim = url.searchParams.get('limit') ? `LIMIT ${parseInt(url.searchParams.get('limit'), 10)}` : '';
        const off = url.searchParams.get('offset') ? ` OFFSET ${parseInt(url.searchParams.get('offset'), 10)}` : '';
        const rows = (await pool.query(`SELECT to_jsonb(t) AS r FROM "${table}" t ${w} ${ob} ${lim}${off}`, args)).rows.map(r => pick(r.r, url.searchParams.get('select'), cols, table));
        let range = `*/${rows.length}`;
        if (/count=exact/.test(prefer)) range = `*/${Number((await pool.query(`SELECT count(*) c FROM "${table}" t ${w}`, args)).rows[0].c)}`;
        if (wantObject) return objectOr406(rows);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Range': range }); return res.end(req.method === 'HEAD' ? undefined : JSON.stringify(rows));
      }
      if (req.method === 'POST' && body && typeof body === 'object') {
        const list = Array.isArray(body) ? body : [body]; list.forEach(knownCols);
        const keys = Object.keys(list[0]); const args = []; const values = list.map(row => `(${keys.map(k => { args.push(cast(k, row[k])); return `$${args.length}${cols.get(k) === 'jsonb' ? '::jsonb' : ''}`; }).join(',')})`).join(',');
        const rows = (await pool.query(`INSERT INTO "${table}" (${keys.map(k => `"${k}"`).join(',')}) VALUES ${values} RETURNING to_jsonb("${table}") AS r`, args)).rows.map(r => r.r);
        return /return=representation/.test(prefer) ? send(201, rows) : send(201, undefined);
      }
      if (req.method === 'PATCH' && body && typeof body === 'object') {
        knownCols(body); const args = []; const sets = Object.entries(body).map(([k, v]) => { args.push(cast(k, v)); return `"${k}" = $${args.length}${cols.get(k) === 'jsonb' ? '::jsonb' : ''}`; });
        const rows = (await pool.query(`UPDATE "${table}" SET ${sets.join(', ')} ${where(table, cols, url.searchParams, args)} RETURNING to_jsonb("${table}") AS r`, args)).rows.map(r => r.r);
        if (/return=representation/.test(prefer)) return wantObject ? objectOr406(rows) : send(200, rows, { 'Content-Range': `*/${rows.length}` });
        return send(204, undefined, { 'Content-Range': `*/${rows.length}` });
      }
      if (req.method === 'DELETE') { const args = []; await pool.query(`DELETE FROM "${table}" ${where(table, cols, url.searchParams, args)}`, args); return send(204); }
      res.writeHead(204); res.end();
    } catch (e) {
      if (e instanceof PgLike) return send(e.status, { code: e.pgCode, message: e.message, details: null, hint: null });
      send(400, { code: e.code || 'XX000', message: e.message, details: e.detail ?? null, hint: e.hint ?? null });
    }
  });
});

async function main() {
  const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-liv-pg-'));
  const pgPort = await freePort();
  const epg = new EmbeddedPostgres({ databaseDir: dbDir, user: 'postgres', password: 'pw', port: pgPort, persistent: false, initdbFlags: ['--encoding=UTF8'], onLog: () => {}, onError: () => {} });
  await epg.initialise(); await epg.start(); await epg.createDatabase('byn');
  pool = new pg.Pool({ host: '127.0.0.1', port: pgPort, user: 'postgres', password: 'pw', database: 'byn', max: 10 });
  const q = (sql, args) => pool.query(sql, args); const one = async (sql, args) => (await q(sql, args)).rows[0];
  await q(DDL);
  await q(`CREATE TABLE payments (id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE, razorpay_order_id text NOT NULL, razorpay_payment_id text,
    plan text NOT NULL, currency text NOT NULL DEFAULT 'INR', amount int NOT NULL, status text NOT NULL DEFAULT 'created', created_at timestamptz NOT NULL DEFAULT now())`);
  for (const n of ['022', '026', '027']) {
    const f = fs.readdirSync(path.join(here, 'migrations')).filter(x => new RegExp('^' + n + '_.*\\.sql$').test(x))[0];
    if (f) await q(fs.readFileSync(path.join(here, 'migrations', f), 'utf8'));
  }

  const shared = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-liv-shared-'));
  const stub = path.join(shared, 'stub-resend.cjs');
  fs.writeFileSync(stub, `const Module = require('module'); const orig = Module._load;
Module._load = function (request) { if (request === 'resend') { return { Resend: class { constructor() { this.emails = { send: async () => ({ data: { id: 'stub' }, error: null }) }; } } }; } return orig.apply(this, arguments); };`);
  await new Promise(r => translator.listen(0, '127.0.0.1', r)); const dbPort = translator.address().port;
  const port = await freePort(); const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-liv-'));
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, SYSTEMROOT: process.env.SYSTEMROOT, TEMP: os.tmpdir(), TMP: os.tmpdir(), HOME: cwd, USERPROFILE: cwd,
    SUPABASE_URL: `http://127.0.0.1:${dbPort}`, SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key', JWT_SECRET, ADMIN_SECRET: 'test-only-admin-secret', PORT: String(port), RESEND_API_KEY: 'test-only-resend-key', RAZORPAY_WEBHOOK_SECRET: 'whsec_test_secret', RAZORPAY_KEY_ID: 'rzp_test_fake', RAZORPAY_KEY_SECRET: 'rzp_secret_fake' };
  let out = ''; const child = spawn(process.execPath, ['-r', stub, SERVER_JS], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  let exited = null; child.on('exit', c => { exited = c; });
  await waitFor(() => /Server on port/.test(out) || exited !== null, 60000, 200);
  const base = `http://127.0.0.1:${port}`;
  const tok = id => jwt.sign({ id, email: `${id}@example.test`, name: 'T' }, JWT_SECRET, { expiresIn: '1h' });
  let ipN = 0;
  const call = async (method, p, as, body) => { const r = await fetch(base + p, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(as ? { Authorization: `Bearer ${tok(as)}` } : {}), 'X-Forwarded-For': `10.25.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: body !== undefined ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch {} return { status: r.status, body: j }; };

  const uuid = () => crypto.randomUUID();
  const mkUser = async (name, o = {}) => {
    const id = uuid();
    await q(`INSERT INTO users (id,email,name,photos,premium,email_verified,onboarding_stage,banned,deleted_at,role,premium_expires_at) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11)`,
      [id, `${id}@example.test`, name, JSON.stringify(o.photos ?? [`https://img.test/${name.replace(/\s/g, '')}.jpg`]), o.premium ?? false, ('verified' in o ? o.verified : true), ('stage' in o ? o.stage : 'complete'), o.banned ?? false, o.deleted_at ?? null, o.role ?? 'user', o.expires ?? null]);
    return id;
  };
  const swipe = (from, to, direction = 'right') => q(`INSERT INTO swipes (from_user,to_user,direction) VALUES ($1,$2,$3)`, [from, to, direction]);
  const block = (from, to) => q(`INSERT INTO blocks (from_user,to_user) VALUES ($1,$2)`, [from, to]);
  const rows = async (sql, args) => Number((await one(sql, args)).c);
  const swipeRows = (from, to) => rows(`SELECT count(*) c FROM swipes WHERE from_user=$1 AND to_user=$2`, [from, to]);
  const blockRows = (from, to) => rows(`SELECT count(*) c FROM blocks WHERE from_user=$1 AND to_user=$2`, [from, to]);

  try {
    check('server booted', /Server on port/.test(out) && exited === null, out.slice(-300));
    const WH = 'whsec_test_secret', KEY_SECRET = 'rzp_secret_fake';
    const day = 24 * 3600 * 1000, DAYS = d => new Date(Date.now() + d * day).toISOString();
    const daysLeft = iso => iso ? (new Date(iso).getTime() - Date.now()) / day : null;
    const approx = (v, n, tol = 0.05) => v !== null && Math.abs(v - n) < tol;
    let evN = 0, hipN = 0;
    const hook = async (evt, o = {}) => {
      const raw = JSON.stringify(evt);
      const headers = { 'Content-Type': 'application/json', 'x-razorpay-signature': o.sig ?? crypto.createHmac('sha256', WH).update(raw).digest('hex'), 'X-Forwarded-For': `10.27.${Math.floor(++hipN / 250)}.${hipN % 250 + 1}` };
      if (o.eventId !== null) headers['x-razorpay-event-id'] = o.eventId ?? ('evt_' + (++evN));
      const r = await fetch(base + '/api/payments/webhook', { method: 'POST', headers, body: raw });
      let j = null; try { j = await r.json(); } catch {}
      return { status: r.status, body: j };
    };
    const refundEvt = (payId, id, amount, status = 'processed') => ({ event: 'refund.' + status, payload: { refund: { entity: { id, entity: 'refund', payment_id: payId, amount, currency: 'INR', status } } } });
    const disputeEvt = (type, payId, id, amount = 24900) => ({ event: 'payment.dispute.' + type, payload: { dispute: { entity: { id, entity: 'dispute', payment_id: payId, amount, currency: 'INR', status: type } } } });
    const captureEvt = (orderId, payId) => ({ event: 'payment.captured', payload: { payment: { entity: { id: payId, order_id: orderId, status: 'captured' } } } });
    const mkOrder = async (uid, plan = 'monthly') => {
      const id = 'order_' + crypto.randomUUID().slice(0, 12);
      await q(`INSERT INTO payments (id,user_id,razorpay_order_id,plan,currency,amount) VALUES ($1,$2,$1,$3,'INR',$4)`, [id, uid, plan, plan === 'monthly' ? 24900 : 59900]);
      return id;
    };
    const payRow = id => one(`SELECT * FROM payments WHERE id=$1`, [id]);
    const userRow = id => one(`SELECT premium, premium_expires_at, deleted_at FROM users WHERE id=$1`, [id]);
    const evCount = async (where = 'true') => Number((await one(`SELECT count(*) c FROM payment_events WHERE ${where}`)).c);
    // A bought-and-captured monthly payment, through the real webhook.
    const buy = async (name, o = {}) => {
      const uid = await mkUser(name, { expires: o.expiryDays != null ? DAYS(o.expiryDays) : null, premium: o.expiryDays != null });
      const order = await mkOrder(uid); const payId = 'pay_' + order;
      const r = await hook(captureEvt(order, payId));
      return { uid, order, payId, status: r.status };
    };

    // ---------- basics ----------
    console.log('\n=== webhook basics (unchanged behavior + safe handling of everything else) ===');
    let r = await hook(refundEvt('pay_x', 'rfnd_x', 100), { sig: 'deadbeef' });
    check('a bad signature -> 400 and nothing is recorded', r.status === 400 && (await evCount()) === 0, JSON.stringify(r));
    r = await hook({ event: 'payment.authorized', payload: { payment: { entity: { id: 'pay_a' } } } });
    check('an unrelated event (payment.authorized) -> 200, not ledgered', r.status === 200 && (await evCount()) === 0, JSON.stringify(r));
    r = await hook({ event: 'refund.processed', payload: { refund: { entity: { id: 'rfnd_np', amount: 5 } } } });
    check('a refund payload with no payment_id -> 200 (a retry cannot fix it), nothing recorded, a warning is logged', r.status === 200 && (await evCount()) === 0 && /no entity \/ payment_id/.test(out), JSON.stringify(r));

    // ---------- capture then full refund ----------
    console.log('\n=== capture, then a FULL refund ===');
    const t1 = await buy('Buyer One');
    check('payment.captured still grants (regression): 200, paid, granted_days 30, premium true', t1.status === 200 && (await payRow(t1.order)).status === 'paid' && (await payRow(t1.order)).granted_days === 30 && (await userRow(t1.uid)).premium === true, JSON.stringify(await payRow(t1.order)));
    const liker = await mkUser('Liker One'); await q(`INSERT INTO swipes (from_user,to_user,direction) VALUES ($1,$2,'right')`, [liker, t1.uid]);
    r = await call('GET', '/api/liked-me', t1.uid);
    check('setup: while premium, the buyer sees the liked-me list (and the auth cache is now warm as premium)', r.status === 200 && r.body?.premium_required === false, JSON.stringify(r.body));
    r = await hook(refundEvt(t1.payId, 'rfnd_1', 24900), { eventId: 'evt_full_1' });
    let p = await payRow(t1.order);
    check('refund.processed (full): 200; payment refunded; refunded_amount = paid amount', r.status === 200 && p.status === 'refunded' && p.refunded_amount === 24900, JSON.stringify([r, p]));
    check('...the 30 days it added are removed: premium false, entitlement_reversed_days 30', (await userRow(t1.uid)).premium === false && p.entitlement_reversed_days === 30, JSON.stringify(await userRow(t1.uid)));
    check('...ledger: one row, outcome applied', (await evCount("event_id='evt_full_1' AND outcome='applied'")) === 1, '');
    r = await call('GET', '/api/liked-me', t1.uid);
    check('...and the auth cache was invalidated: the very next request already sees the free tier', r.status === 200 && r.body?.premium_required === true, JSON.stringify(r.body));
    r = await hook(refundEvt(t1.payId, 'rfnd_1', 24900), { eventId: 'evt_full_1' });
    check('the SAME event delivered again -> 200, still exactly one ledger row, nothing changes', r.status === 200 && (await evCount("event_id='evt_full_1'")) === 1 && (await payRow(t1.order)).entitlement_reversed_days === 30, JSON.stringify(r));
    r = await hook(captureEvt(t1.order, t1.payId));
    check('a replayed payment.captured after the refund cannot re-grant (status refunded, premium still false)', r.status === 200 && (await payRow(t1.order)).status === 'refunded' && (await userRow(t1.uid)).premium === false, JSON.stringify(await userRow(t1.uid)));

    console.log('\n=== duplicate delivery without the event-id header (hash of the signed body) ===');
    const t2 = await buy('Buyer Two', { expiryDays: 60 });          // ~90d
    const evt2 = refundEvt(t2.payId, 'rfnd_2', 24900);
    await hook(evt2, { eventId: null }); await hook(evt2, { eventId: null });
    check('identical body twice, no header -> one ledger row keyed by the body hash, 30 days subtracted once (~60d remain)', (await evCount("event_id LIKE 'body-sha256:%'")) === 1 && approx(daysLeft((await userRow(t2.uid)).premium_expires_at), 60), JSON.stringify([await evCount("event_id LIKE 'body-sha256:%'"), (await userRow(t2.uid)).premium_expires_at]));

    console.log('\n=== partial refund: record only ===');
    const t3 = await buy('Buyer Three', { expiryDays: 60 });
    const before3 = await userRow(t3.uid);
    r = await hook(refundEvt(t3.payId, 'rfnd_3', 10000));
    p = await payRow(t3.order);
    check('partial refund: 200, status partially_refunded, refunded_amount 10000, entitlement untouched', r.status === 200 && p.status === 'partially_refunded' && p.refunded_amount === 10000 && String((await userRow(t3.uid)).premium_expires_at) === String(before3.premium_expires_at), JSON.stringify(p));

    console.log('\n=== dispute: opened changes nothing, lost reverses ===');
    const t4 = await buy('Buyer Four', { expiryDays: 60 });
    const before4 = await userRow(t4.uid);
    r = await hook(disputeEvt('created', t4.payId, 'disp_4'));
    check('dispute opened: 200, status disputed, entitlement NOT removed', r.status === 200 && (await payRow(t4.order)).status === 'disputed' && String((await userRow(t4.uid)).premium_expires_at) === String(before4.premium_expires_at), JSON.stringify(await payRow(t4.order)));
    r = await hook(disputeEvt('lost', t4.payId, 'disp_4'));
    check('dispute lost: status chargeback_lost and exactly 30 days removed (~60d remain)', r.status === 200 && (await payRow(t4.order)).status === 'chargeback_lost' && approx(daysLeft((await userRow(t4.uid)).premium_expires_at), 60), JSON.stringify(await userRow(t4.uid)));
    const t5 = await buy('Buyer Five', { expiryDays: 60 });
    await hook(disputeEvt('created', t5.payId, 'disp_5')); await hook(disputeEvt('won', t5.payId, 'disp_5'));
    check('dispute won: back to paid, entitlement intact', (await payRow(t5.order)).status === 'paid' && approx(daysLeft((await userRow(t5.uid)).premium_expires_at), 90), JSON.stringify(await payRow(t5.order)));

    console.log('\n=== unknown payment / deleted account ===');
    r = await hook(refundEvt('pay_unknown_zzz', 'rfnd_u', 100));
    check('unknown payment id -> 200, ledgered as unmatched, nothing else touched', r.status === 200 && (await evCount("razorpay_payment_id='pay_unknown_zzz' AND outcome='unmatched'")) === 1, JSON.stringify(r));
    const t6 = await buy('Buyer Six', { expiryDays: 60 });
    await q(`UPDATE users SET deleted_at = now() WHERE id=$1`, [t6.uid]);
    const before6 = await userRow(t6.uid);
    r = await hook(refundEvt(t6.payId, 'rfnd_6', 24900));
    check('refund after the account was deleted: payment refunded + ledgered, entitlement fields NOT modified', r.status === 200 && (await payRow(t6.order)).status === 'refunded' && String((await userRow(t6.uid)).premium_expires_at) === String(before6.premium_expires_at) && (await userRow(t6.uid)).premium === before6.premium, JSON.stringify(await userRow(t6.uid)));

    // ---------- out of order ----------
    console.log('\n=== out of order: the refund arrives BEFORE the capture ===');
    const uLate = await mkUser('Late Capture'); const oLate = await mkOrder(uLate); const pLate = 'pay_' + oLate;
    r = await hook(refundEvt(pLate, 'rfnd_late', 24900));
    check('the early refund is acknowledged (200) and ledgered as unmatched', r.status === 200 && (await evCount(`razorpay_payment_id='${pLate}' AND outcome='unmatched'`)) === 1, JSON.stringify(r));
    const verify = (uid, order, payId) => fetch(base + '/api/payments/verify', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt.sign({ id: uid, scope: 'payment' }, JWT_SECRET, { expiresIn: '15m' })}`, 'X-Forwarded-For': `10.28.0.${++hipN % 250 + 1}` },
      body: JSON.stringify({ razorpay_order_id: order, razorpay_payment_id: payId, razorpay_signature: crypto.createHmac('sha256', KEY_SECRET).update(order + '|' + payId).digest('hex') }) }).then(async x => ({ status: x.status, body: await x.json().catch(() => null) }));
    r = await verify(uLate, oLate, pLate);
    check('the buyer\'s /verify for that refunded payment -> 409, NOT the premium success screen', r.status === 409 && r.body?.ok !== true, JSON.stringify(r));
    check('...nothing was granted; the payment is marked refunded', (await userRow(uLate)).premium === false && (await userRow(uLate)).premium_expires_at === null && (await payRow(oLate)).status === 'refunded', JSON.stringify(await payRow(oLate)));
    r = await hook(captureEvt(oLate, pLate));
    check('the late payment.captured webhook then grants nothing either', r.status === 200 && (await userRow(uLate)).premium === false, JSON.stringify(await userRow(uLate)));
    r = await verify(uLate, oLate, pLate);
    check('and a second /verify (payment row now exists) is still 409, not "alreadyActivated"', r.status === 409 && r.body?.alreadyActivated !== true, JSON.stringify(r));
    const okBuy = await buy('Verify Regression Buyer');
    r = await verify(okBuy.uid, okBuy.order, okBuy.payId);
    check('control: /verify for a normally paid payment is still a success (alreadyActivated)', r.status === 200 && r.body?.ok === true, JSON.stringify(r));

    // ---------- failure -> 5xx, rollback, redelivery applies ----------
    console.log('\n=== a failure inside the transaction answers 5xx and the redelivery then applies ===');
    const tf = await buy('Buyer Fail', { expiryDays: 60 });
    const beforeF = await userRow(tf.uid);
    await q(`CREATE FUNCTION fail_user_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure applying the reversal' USING ERRCODE = 'P0001'; END $$`);
    await q(`CREATE TRIGGER users_fault BEFORE UPDATE ON users FOR EACH ROW WHEN (OLD.id = '${tf.uid}') EXECUTE FUNCTION fail_user_update()`);
    r = await hook(refundEvt(tf.payId, 'rfnd_f', 24900), { eventId: 'evt_fail' });
    check('webhook answers 500 (so Razorpay redelivers)', r.status === 500, JSON.stringify(r));
    check('...nothing was applied: payment still paid, user untouched, and NO ledger row (rolled back)', (await payRow(tf.order)).status === 'paid' && String((await userRow(tf.uid)).premium_expires_at) === String(beforeF.premium_expires_at) && (await evCount("event_id='evt_fail'")) === 0, JSON.stringify(await payRow(tf.order)));
    check('...the real error is logged, and not leaked in the response', /process_payment_reversal failed[\s\S]*injected failure/.test(out) && !/injected failure/.test(JSON.stringify(r.body)), JSON.stringify(r.body));
    await q(`DROP TRIGGER users_fault ON users`); await q(`DROP FUNCTION fail_user_update()`);
    r = await hook(refundEvt(tf.payId, 'rfnd_f', 24900), { eventId: 'evt_fail' });
    check('the redelivery of the same event applies normally (200, refunded, ~60d remain)', r.status === 200 && (await payRow(tf.order)).status === 'refunded' && approx(daysLeft((await userRow(tf.uid)).premium_expires_at), 60), JSON.stringify(r));

    // ---------- admin view ----------
    console.log('\n=== read-only admin view ===');
    const admin = await mkUser('Pay Admin', { role: 'admin' }); const plain = await mkUser('Plain User');
    r = await call('GET', '/api/admin/payments', admin);
    check('admin: 200 with payments and ledger events', r.status === 200 && Array.isArray(r.body?.payments) && Array.isArray(r.body?.events) && r.body.payments.length >= 8 && r.body.events.length >= 8, JSON.stringify([r.status, r.body?.payments?.length, r.body?.events?.length]));
    check('...rows expose status / refunded_amount / reversal state, and the ledger outcome', r.body.payments.some(x => x.status === 'refunded' && x.refunded_amount === 24900 && x.entitlement_reversed_days === 30) && r.body.events.some(x => x.outcome === 'applied') && r.body.events.some(x => x.outcome === 'unmatched'), '');
    check('...the ledger view does not include the raw payload', r.body.events.every(x => !('payload' in x)), '');
    r = await call('GET', '/api/admin/payments', plain);
    check('a non-admin gets 403', r.status === 403, JSON.stringify(r));
    r = await call('GET', '/api/admin/payments');
    check('no token gets 401', r.status === 401, JSON.stringify(r));

  } finally {
    const gone = new Promise(res => { if (exited !== null) res(); else child.once('exit', res); }); child.kill(); await Promise.race([gone, sleep(5000)]);
    try { await pool.end(); } catch {}
    await new Promise(r => translator.close(r));
    try { await epg.stop(); } catch {}
    await sleep(500);
    for (const d of [dbDir, shared, cwd]) { try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch { /* temp only */ } }
  }
  console.log(`\n=== RESULTS: ${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
