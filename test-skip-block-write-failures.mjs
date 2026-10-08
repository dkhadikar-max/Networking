// Regression test: POST /api/skip and POST /api/block must never report success for a write that failed.
//
// Both routes used to ignore the {error} supabase-js RETURNS (it does not throw):
//   /api/skip   a failed swipes lookup or insert still answered { ok: true } - the client showed the
//               profile as skipped, nothing was stored, and the same profile came back in Discover.
//   /api/block  a failed blocks insert, or a failed connection / message / swipe teardown, still
//               answered { ok: true } - the user was told they were protected while the blocked
//               person could still message them.
//
// Now: any failed lookup/write -> 500 { error: 'Internal server error' } with the real error logged
// and not leaked. Two intentional tolerances, pinned below: a 23505 on the swipe/block insert is a
// concurrent duplicate and is still ok, and block is idempotent so a retry after a partial failure
// finishes the teardown.
//
// How it runs (nothing can touch production): the REAL server.js (or $SERVER_JS) against a
// PostgREST-compatible translator over a REAL PostgreSQL (embedded-postgres); faults are injected in
// the translator (per method + table), empty cwd (no .env), whitelisted env.
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
let faultOn = null, faultCode = 'XX000';
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
      if (faultOn && faultOn(req.method, table)) return send(500, { code: faultCode, message: 'injected fault', details: null, hint: null });
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

  const shared = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-liv-shared-'));
  const stub = path.join(shared, 'stub-resend.cjs');
  fs.writeFileSync(stub, `const Module = require('module'); const orig = Module._load;
Module._load = function (request) { if (request === 'resend') { return { Resend: class { constructor() { this.emails = { send: async () => ({ data: { id: 'stub' }, error: null }) }; } } }; } return orig.apply(this, arguments); };`);
  await new Promise(r => translator.listen(0, '127.0.0.1', r)); const dbPort = translator.address().port;
  const port = await freePort(); const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-liv-'));
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, SYSTEMROOT: process.env.SYSTEMROOT, TEMP: os.tmpdir(), TMP: os.tmpdir(), HOME: cwd, USERPROFILE: cwd,
    SUPABASE_URL: `http://127.0.0.1:${dbPort}`, SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key', JWT_SECRET, ADMIN_SECRET: 'test-only-admin-secret', PORT: String(port), RESEND_API_KEY: 'test-only-resend-key' };
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
    await q(`INSERT INTO users (id,email,name,photos,premium,email_verified,onboarding_stage,banned,deleted_at) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9)`,
      [id, `${id}@example.test`, name, JSON.stringify(o.photos ?? [`https://img.test/${name.replace(/\s/g, '')}.jpg`]), o.premium ?? false, o.verified ?? true, o.stage ?? 'complete', o.banned ?? false, o.deleted_at ?? null]);
    return id;
  };
  const swipe = (from, to, direction = 'right') => q(`INSERT INTO swipes (from_user,to_user,direction) VALUES ($1,$2,$3)`, [from, to, direction]);
  const block = (from, to) => q(`INSERT INTO blocks (from_user,to_user) VALUES ($1,$2)`, [from, to]);
  const rows = async (sql, args) => Number((await one(sql, args)).c);
  const swipeRows = (from, to) => rows(`SELECT count(*) c FROM swipes WHERE from_user=$1 AND to_user=$2`, [from, to]);
  const blockRows = (from, to) => rows(`SELECT count(*) c FROM blocks WHERE from_user=$1 AND to_user=$2`, [from, to]);

  try {
    check('server booted', /Server on port/.test(out) && exited === null, out.slice(-300));
    const failOn = (method, table) => { faultOn = (m, t) => m === method && t === table; };
    const noFault = () => { faultOn = null; };
    const logged = re => re.test(out);

    // ================= skip =================
    console.log('\n=== POST /api/skip: failed writes are not success ===');
    const skipper = await mkUser('Skipper');
    const t1 = await mkUser('Skip Target One');
    failOn('POST', 'swipes');
    let r = await call('POST', '/api/skip', skipper, { targetId: t1 });
    check('swipes INSERT fails -> 500, not ok', r.status === 500 && r.body?.ok !== true, JSON.stringify(r));
    check('...and nothing was stored', (await swipeRows(skipper, t1)) === 0, '');
    check('...the real error is logged', logged(/Skip error:[\s\S]*injected fault/), out.split('\n').filter(l => /Skip error/.test(l)).join(' | ') || '(nothing logged)');
    check('...the response does not leak the internal error', !/injected fault/.test(JSON.stringify(r.body)), JSON.stringify(r.body));
    noFault();
    r = await call('POST', '/api/skip', skipper, { targetId: t1 });
    check('retry once the database recovers -> 200 and the skip is stored', r.status === 200 && (await swipeRows(skipper, t1)) === 1, JSON.stringify(r));

    const t2 = await mkUser('Skip Target Two');
    failOn('GET', 'swipes');
    r = await call('POST', '/api/skip', skipper, { targetId: t2 });
    check('swipes duplicate-check SELECT fails -> 500, not ok', r.status === 500 && r.body?.ok !== true, JSON.stringify(r));
    check('...and nothing was stored', (await swipeRows(skipper, t2)) === 0, '');
    noFault();

    const t3 = await mkUser('Skip Target Three');
    await swipe(skipper, t3, 'left');
    failOn('POST', 'swipes');
    r = await call('POST', '/api/skip', skipper, { targetId: t3 });
    check('already skipped + insert would fail -> still 200 (no write attempted)', r.status === 200 && (await swipeRows(skipper, t3)) === 1, JSON.stringify(r));
    noFault();

    // 23505 race: the insert hits the unique index after a concurrent request won - must still be ok.
    const t4 = await mkUser('Skip Target Four');
    failOn('POST', 'swipes'); faultCode = '23505';
    r = await call('POST', '/api/skip', skipper, { targetId: t4 });
    check('insert answers 23505 (concurrent duplicate) -> 200 ok, not a 500', r.status === 200 && r.body?.ok === true, JSON.stringify(r));
    faultCode = 'XX000'; noFault();

    // ================= block =================
    console.log('\n=== POST /api/block: failed writes are not success ===');
    const blocker = await mkUser('Blocker');
    const mkPair = async name => {
      const victim = await mkUser(name); const conn = uuid();
      await q(`INSERT INTO connections (id,user1,user2,active,status) VALUES ($1,$2,$3,true,'active')`, [conn, blocker, victim]);
      await q(`INSERT INTO messages (id,connection_id,sender_id,text) VALUES ($1,$2,$3,'hello')`, [uuid(), conn, victim]);
      await swipe(blocker, victim); await swipe(victim, blocker);
      return { victim, conn };
    };
    const connRows = ({ conn }) => rows(`SELECT count(*) c FROM connections WHERE id=$1`, [conn]);
    const intact = async p => (await connRows(p)) === 1 && (await rows(`SELECT count(*) c FROM messages WHERE connection_id=$1`, [p.conn])) === 1;
    const tornDown = async p => (await connRows(p)) === 0 && (await rows(`SELECT count(*) c FROM messages WHERE connection_id=$1`, [p.conn])) === 0 && (await swipeRows(blocker, p.victim)) === 0 && (await swipeRows(p.victim, blocker)) === 0;

    // 1. blocks INSERT fails: nothing is torn down, no ok
    let p = await mkPair('Block Victim A');
    failOn('POST', 'blocks');
    r = await call('POST', '/api/block', blocker, { targetId: p.victim });
    check('blocks INSERT fails -> 500, not ok', r.status === 500 && r.body?.ok !== true, JSON.stringify(r));
    check('...no block row stored, and the connection is left untouched', (await blockRows(blocker, p.victim)) === 0 && await intact(p), '');
    check('...the real error is logged', logged(/Block error:[\s\S]*injected fault/), out.split('\n').filter(l => /Block error/.test(l)).join(' | ') || '(nothing logged)');
    check('...the response does not leak the internal error', !/injected fault/.test(JSON.stringify(r.body)), JSON.stringify(r.body));
    noFault();
    r = await call('POST', '/api/block', blocker, { targetId: p.victim });
    check('retry once the database recovers -> 200, block stored, teardown complete', r.status === 200 && (await blockRows(blocker, p.victim)) === 1 && await tornDown(p), JSON.stringify(r));

    // 2. blocks existence SELECT fails
    p = await mkPair('Block Victim B');
    failOn('GET', 'blocks');
    r = await call('POST', '/api/block', blocker, { targetId: p.victim });
    check('blocks existence SELECT fails -> 500, not ok', r.status === 500 && r.body?.ok !== true, JSON.stringify(r));
    check('...nothing stored, connection untouched', (await blockRows(blocker, p.victim)) === 0 && await intact(p), '');
    noFault();

    // 3. connections SELECT fails after the block row is stored
    p = await mkPair('Block Victim C');
    failOn('GET', 'connections');
    r = await call('POST', '/api/block', blocker, { targetId: p.victim });
    check('connections SELECT fails -> 500, NOT ok (the user must not be told they are protected)', r.status === 500 && r.body?.ok !== true, JSON.stringify(r));
    check('...the block row IS stored (safe side) but the connection is still there', (await blockRows(blocker, p.victim)) === 1 && await intact(p), '');
    noFault();
    r = await call('POST', '/api/block', blocker, { targetId: p.victim });
    check('retry -> 200 and the teardown is now complete (idempotent, exactly one block row)', r.status === 200 && (await blockRows(blocker, p.victim)) === 1 && await tornDown(p), JSON.stringify(r));

    // 4. messages DELETE fails
    p = await mkPair('Block Victim D');
    failOn('DELETE', 'messages');
    r = await call('POST', '/api/block', blocker, { targetId: p.victim });
    check('messages DELETE fails -> 500, not ok', r.status === 500 && r.body?.ok !== true, JSON.stringify(r));
    check('...the connection row is NOT deleted ahead of its messages', await intact(p), '');
    noFault();
    r = await call('POST', '/api/block', blocker, { targetId: p.victim });
    check('retry -> 200 and the teardown completes', r.status === 200 && await tornDown(p), JSON.stringify(r));

    // 5. connections DELETE fails
    p = await mkPair('Block Victim E');
    failOn('DELETE', 'connections');
    r = await call('POST', '/api/block', blocker, { targetId: p.victim });
    check('connections DELETE fails -> 500, not ok', r.status === 500 && r.body?.ok !== true, JSON.stringify(r));
    check('...the block row is stored and the connection still exists', (await blockRows(blocker, p.victim)) === 1 && (await connRows(p)) === 1, '');
    noFault();
    r = await call('POST', '/api/block', blocker, { targetId: p.victim });
    check('retry -> 200 and the teardown completes', r.status === 200 && await tornDown(p), JSON.stringify(r));

    // 6. swipes DELETE fails (last step)
    p = await mkPair('Block Victim F');
    failOn('DELETE', 'swipes');
    r = await call('POST', '/api/block', blocker, { targetId: p.victim });
    check('swipes DELETE fails -> 500, not ok', r.status === 500 && r.body?.ok !== true, JSON.stringify(r));
    check('...the block row is stored, the connection is gone, the swipes remain', (await blockRows(blocker, p.victim)) === 1 && (await connRows(p)) === 0 && (await swipeRows(blocker, p.victim)) === 1, '');
    noFault();
    r = await call('POST', '/api/block', blocker, { targetId: p.victim });
    check('retry -> 200 and the swipes are gone', r.status === 200 && await tornDown(p), JSON.stringify(r));

    // 7. 23505 race on the block insert
    const raced = await mkUser('Block Raced');
    failOn('POST', 'blocks'); faultCode = '23505';
    r = await call('POST', '/api/block', blocker, { targetId: raced });
    check('block insert answers 23505 (concurrent duplicate) -> 200 ok, not a 500', r.status === 200 && r.body?.ok === true, JSON.stringify(r));
    faultCode = 'XX000'; noFault();

    // 8. the happy path is unchanged
    p = await mkPair('Block Victim Happy');
    r = await call('POST', '/api/block', blocker, { targetId: p.victim });
    check('no faults: 200, block stored, connection + messages + swipes gone (unchanged)', r.status === 200 && (await blockRows(blocker, p.victim)) === 1 && await tornDown(p), JSON.stringify(r));

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
