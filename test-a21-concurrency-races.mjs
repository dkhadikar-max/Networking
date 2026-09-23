// Regression test for audit finding A21 - three independent check-then-act races, none backed by
// anything at the database level (see migrations/024_concurrency_race_fixes.sql for the full writeup):
//
//   A21a CONNECT.  Two mutual matches racing (both sides swipe/connect right within the same narrow
//        window) could each pass "does the other side already have a matching swipe" before either
//        had inserted its own connection row - connections had no unique constraint, so BOTH inserts
//        succeeded: two connection rows for the same pair, two "You matched!" notifications. The
//        23505-recovery code already in POST /api/swipe and POST /api/connect was written assuming a
//        constraint that was never added - dead code until connections_pair_uidx exists - and even
//        once it does, the recovery path still sent a second, duplicate set of match notifications
//        (fixed here too). Investigating this surfaced a SECOND, more severe bug specific to
//        POST /api/connect: it batched its own swipe-insert and its "did they already swipe me"
//        check via Promise.all, reasoning they were "independent" (different rows). They are not -
//        batching them removed the happens-before relationship that makes a genuine mutual match
//        detectable at all, so both sides' checks could run and both find nothing BEFORE either
//        side's insert committed - a real mutual right-swipe silently never became a connection at
//        all. POST /api/swipe never had this (it already inserted, then checked, in sequence);
//        /api/connect now does the same.
//   A21b PRIORITY MESSAGE.  The monthly-quota check, the duplicate-recipient check and the insert
//        were three separate REST calls with nothing serializing them. A burst of concurrent requests
//        could each read the same under-the-limit count (or "no duplicate yet" state) before any of
//        them committed - exceeding the monthly cap (3 free / 20 premium) and/or sending two priority
//        messages to the same recipient in the same month.
//   A21c DUPLICATE REPORTS.  The "already reported" dedupe SELECT and the insert were the same shape:
//        concurrent identical reports from ONE reporter could each pass the check before either
//        committed, each insert its own row, and each apply its own -10 trust penalty to the target -
//        unboundedly, from a single reporter racing their own request. The insert's own error was
//        never even checked.
//
// This proves the fix with GENUINE concurrency - real overlapping HTTP requests against the spawned
// server.js and a real multi-connection PostgreSQL (embedded-postgres), not a single-threaded
// simulation - firing many competing pairs/bursts at once, since a single pair is not guaranteed to
// hit the race window (statistical, like any true concurrency test; the batch sizes here give
// negligible flake probability). migrations/024_concurrency_race_fixes.sql is applied VERBATIM.
// process_priority_message's OWN atomicity (real multi-connection races, the row-lock/advisory-lock
// mechanics, privilege checks) is proven independently and more exhaustively in
// test-a21b-priority-message-sql.mjs, which talks to Postgres directly with no HTTP layer at all -
// this file instead proves server.js is wired to it correctly end-to-end.
//
// How it runs (nothing can touch production): the REAL server.js (or $SERVER_JS) against a
// PostgREST-compatible translator (extended here with a genuine /rest/v1/rpc/<fn> passthrough that
// executes the real Postgres function, so process_priority_message runs for real) over a REAL
// PostgreSQL; empty cwd (no .env), whitelisted env.
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
CREATE TABLE connections (id text PRIMARY KEY, user1 text NOT NULL, user2 text NOT NULL, created_at timestamptz DEFAULT now(), expires_at timestamptz, first_response_deadline timestamptz,
  user1_responded boolean DEFAULT false, user2_responded boolean DEFAULT false, active boolean DEFAULT false, status text, user1_last_read_at timestamptz, user2_last_read_at timestamptz);
CREATE TABLE circle_posts (id text PRIMARY KEY, user_id text NOT NULL, text text, tags jsonb DEFAULT '[]', structured_meta jsonb DEFAULT '{}', links jsonb DEFAULT '[]', created_at timestamptz DEFAULT now(), group_id text);
CREATE TABLE circle_groups (id text PRIMARY KEY, privacy text DEFAULT 'public');
CREATE TABLE circle_group_members (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, group_id text, user_id text, role text);
CREATE TABLE messages (id text PRIMARY KEY, connection_id text NOT NULL, sender_id text NOT NULL, text text, created_at timestamptz DEFAULT now());
CREATE TABLE user_reviews (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, reviewer_id text NOT NULL, reviewed_id text NOT NULL, rating int NOT NULL, tags jsonb DEFAULT '[]', created_at timestamptz DEFAULT now());
CREATE TABLE works (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, user_id text NOT NULL, title text NOT NULL, description text DEFAULT '', url text DEFAULT '', image text DEFAULT '', created_at timestamptz DEFAULT now());
CREATE TABLE blocks (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, from_user text NOT NULL, to_user text NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE reports (id text PRIMARY KEY, from_user text NOT NULL, target_id text NOT NULL, reason text NOT NULL, type text, created_at timestamptz DEFAULT now());
CREATE TABLE priority_msgs (id text PRIMARY KEY, from_user text NOT NULL, to_user text NOT NULL, text text, month text, read boolean DEFAULT false, created_at timestamptz DEFAULT now());
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
const dbLog = [];
let faultOn = null;
const translator = http.createServer((req, res) => {
  const chunks = []; req.on('data', c => chunks.push(c));
  req.on('end', async () => {
    const url = new URL(req.url, 'http://mock'); const table = url.pathname.replace(/^\/rest\/v1\//, ''); dbLog.push({ method: req.method, table, select: url.searchParams.get('select') });
    const raw = Buffer.concat(chunks).toString('utf8'); let body = null; try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
    const wantObject = (req.headers.accept || '').includes('vnd.pgrst.object+json'); const prefer = req.headers.prefer || '';
    const send = (status, payload, extra = {}) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...extra }); res.end(payload === undefined ? undefined : JSON.stringify(payload)); };
    const objectOr406 = list => list.length === 1 ? send(200, list[0]) : send(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: null, hint: null });
    const rpcMatch = /^\/rest\/v1\/rpc\/(\w+)$/.exec(url.pathname);
    if (rpcMatch) {
      const argNames = Object.keys(body || {});
      // Explicit casts, inferred from the JS value type: named-parameter function calls leave
      // Postgres unable to infer a $N placeholder's type on its own (unlike ordinary positional
      // queries), and it does not default to the function's declared parameter type - without
      // this every placeholder resolves as `integer` and the call fails to match any overload.
      const placeholders = argNames.map((k, i) => `${k} := $${i + 1}${typeof body[k] === 'number' ? '::int' : typeof body[k] === 'boolean' ? '::boolean' : '::text'}`).join(', ');
      const args = argNames.map(k => body[k]);
      try {
        const result = await pool.query(`SELECT ${rpcMatch[1]}(${placeholders}) AS r`, args);
        return send(200, result.rows[0].r);
      } catch (e) {
        return send(400, { code: e.code || 'XX000', message: e.message, details: e.detail ?? null, hint: e.hint ?? null });
      }
    }
    try {
      if (faultOn && faultOn(req.method, table, url)) return send(500, { code: 'XX000', message: 'injected fault', details: null, hint: null });
      const cols = await tableCols(table);
      if (!cols) return req.method === 'GET' || req.method === 'HEAD' ? send(200, [], { 'Content-Range': '*/0' }) : (res.writeHead(req.method === 'POST' ? 201 : 204), res.end());
      const knownCols = payload => { for (const c of Object.keys(payload)) if (!cols.has(c)) throw new PgLike(400, 'PGRST204', `Could not find the '${c}' column of '${table}' in the schema cache`); };
      const cast = (c, v) => cols.get(c) === 'jsonb' ? JSON.stringify(v) : v;
      if (req.method === 'GET' || req.method === 'HEAD') {
        const args = []; const w = where(table, cols, url.searchParams, args); const ob = orderBy(cols, url.searchParams); const lim = url.searchParams.get('limit') ? `LIMIT ${parseInt(url.searchParams.get('limit'), 10)}` : '';
        const off = url.searchParams.get('offset') ? ` OFFSET ${parseInt(url.searchParams.get('offset'), 10)}` : '';
        const emb = /author:users!\w+\(([^)]*)\)/.exec(url.searchParams.get('select') || '');
        let rows;
        if (table === 'circle_posts' && emb) {
          const acols = emb[1].split(',').map(s => s.trim()).filter(Boolean).map(c => `"${c}"`).join(', ');
          rows = (await pool.query(`SELECT to_jsonb(t) || jsonb_build_object('author', (SELECT to_jsonb(a) FROM (SELECT ${acols} FROM users u WHERE u.id = t.user_id) a)) AS r FROM "${table}" t ${w} ${ob} ${lim}${off}`, args)).rows.map(r => r.r);
        } else rows = (await pool.query(`SELECT to_jsonb(t) AS r FROM "${table}" t ${w} ${ob} ${lim}${off}`, args)).rows.map(r => pick(r.r, url.searchParams.get('select'), cols, table));
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
  const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a21-pg-'));
  const pgPort = await freePort();
  const epg = new EmbeddedPostgres({ databaseDir: dbDir, user: 'postgres', password: 'pw', port: pgPort, persistent: false, initdbFlags: ['--encoding=UTF8'], onLog: () => {}, onError: () => {} });
  await epg.initialise(); await epg.start(); await epg.createDatabase('byn');
  pool = new pg.Pool({ host: '127.0.0.1', port: pgPort, user: 'postgres', password: 'pw', database: 'byn', max: 10 });
  const q = (sql, args) => pool.query(sql, args); const one = async (sql, args) => (await q(sql, args)).rows[0];
  await q(DDL);

  const shared = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a21-shared-'));
  const stub = path.join(shared, 'stub-resend.cjs');
  fs.writeFileSync(stub, `const Module = require('module'); const orig = Module._load;
Module._load = function (request) { if (request === 'resend') { return { Resend: class { constructor() { this.emails = { send: async () => ({ data: { id: 'stub' }, error: null }) }; } } }; } return orig.apply(this, arguments); };`);
  const MIGRATION_024 = path.join(here, 'migrations', '024_concurrency_race_fixes.sql');
  await pool.query(fs.readFileSync(MIGRATION_024, 'utf8'));
  console.log('=== applied verbatim: migrations/024_concurrency_race_fixes.sql ===');
  await new Promise(r => translator.listen(0, '127.0.0.1', r)); const dbPort = translator.address().port;
  const port = await freePort(); const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a21-'));
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, SYSTEMROOT: process.env.SYSTEMROOT, TEMP: os.tmpdir(), TMP: os.tmpdir(), HOME: cwd, USERPROFILE: cwd,
    SUPABASE_URL: `http://127.0.0.1:${dbPort}`, SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key', JWT_SECRET, ADMIN_SECRET: 'test-only-admin-secret', PORT: String(port), RESEND_API_KEY: 'test-only-resend-key' };
  let out = ''; const child = spawn(process.execPath, ['-r', stub, SERVER_JS], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  let exited = null; child.on('exit', c => { exited = c; });
  await waitFor(() => /Server on port/.test(out) || exited !== null, 60000, 200);
  const base = `http://127.0.0.1:${port}`;
  const tok = id => jwt.sign({ id, email: `${id}@example.test`, name: 'T' }, JWT_SECRET, { expiresIn: '1h' });
  let ipN = 0;
  const call = async (method, p, as, body) => { const r = await fetch(base + p, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(as ? { Authorization: `Bearer ${tok(as)}` } : {}), 'X-Forwarded-For': `10.17.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: body !== undefined ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch {} return { status: r.status, body: j }; };

  const uuid = () => crypto.randomUUID();
  // A caller who clears activeGuard / profileGuard (score >= 70) / trustGuard (score >= 20) - the
  // three guards in front of /api/swipe and /api/connect. Mirrors A11's "complete" viewer shape.
  const mkViewer = async name => {
    const id = uuid();
    await q(`INSERT INTO users (id,email,name,bio,location,intent,photos,interests,skills,linkedin,email_verified,onboarding_stage,banned,last_active)
             VALUES ($1,$2,$3,'A complete biography text','Pune','explore-network','["1","2","3","4"]'::jsonb,'["ai","design","music"]'::jsonb,'["react"]'::jsonb,'https://linkedin.com/in/x',true,'complete',false,now())`,
      [id, `${id}@example.test`, name]);
    return id;
  };
  // A bare account - enough to be a swipe/connect/report/priority-message target or a low-guard caller.
  const mkTarget = async name => {
    const id = uuid();
    await q(`INSERT INTO users (id,email,name,email_verified,onboarding_stage,banned) VALUES ($1,$2,$3,true,'complete',false)`,
      [id, `${id}@example.test`, name]);
    return id;
  };
  const swipe   = (as, targetId, direction) => call('POST', '/api/swipe', as, { targetId, direction });
  const connect = (as, targetId) => call('POST', '/api/connect', as, { userId: targetId });
  const pm = (as, targetId, text = 'Would love to connect and chat!') => call('POST', '/api/priority-message', as, { targetId, text });
  const report = (as, targetId, reason = 'spam') => call('POST', '/api/report', as, { targetId, reason });

  try {
    check('server booted', /Server on port/.test(out) && exited === null, out.slice(-300));

    console.log('\n--- A21a: two mutual matches racing must never create two connection rows for the same pair ---');
    // 25 independent pairs, both sides swiped concurrently, all 50 requests fired in ONE batch - a
    // single pair racing is not guaranteed to hit the interleaving window; this many independent
    // pairs makes the flake probability of the OLD (unfixed) code passing by luck negligible.
    const N_PAIRS = 25;
    const pairs = [];
    for (let i = 0; i < N_PAIRS; i++) pairs.push([await mkViewer(`Racer A${i}`), await mkViewer(`Racer B${i}`)]);
    const swipeResults = await Promise.all(pairs.flatMap(([a, b]) => [swipe(a, b, 'right'), swipe(b, a, 'right')]));
    check('every racing swipe request completed cleanly (no 5xx)', swipeResults.every(r => r.status === 200), JSON.stringify(swipeResults.filter(r => r.status !== 200).slice(0, 5)));
    let maxConnRows = 0, pairsWithDup = 0, pairsMatched = 0;
    for (const [a, b] of pairs) {
      const n = Number((await one(`SELECT count(*) c FROM connections WHERE (user1=$1 AND user2=$2) OR (user1=$2 AND user2=$1)`, [a, b])).c);
      maxConnRows = Math.max(maxConnRows, n);
      if (n > 1) pairsWithDup++;
      if (n >= 1) pairsMatched++;
    }
    check(`all ${N_PAIRS} racing pairs matched (every mutual right-swipe produced at least one connection)`, pairsMatched === N_PAIRS, `pairsMatched=${pairsMatched}`);
    check(`...and EXACTLY one connection row each - never two (was: possible, connections had no unique constraint; connections_pair_uidx / migrations/024 closes it)`, maxConnRows === 1 && pairsWithDup === 0, `maxConnRows=${maxConnRows} pairsWithDup=${pairsWithDup}`);
    // Per PAIR, at least one of the two racing responses reports the match (which side depends on
    // real timing - both can, if they genuinely interleave); a connectionId is only ever present
    // alongside match:true. Neither side of any pair is ever left with a 5xx or a malformed body.
    check('every racing response is well-formed: match is a boolean, and connectionId is a string exactly when match is true', swipeResults.every(r => typeof r.body?.match === 'boolean' && (r.body.match ? typeof r.body.connectionId === 'string' : r.body.connectionId == null)), JSON.stringify(swipeResults.slice(0, 4).map(r => r.body)));

    console.log('\n--- POST /api/connect exercises the SAME race, in its own separate match-creation code path ---');
    // Same shape as the /api/swipe race above, but both sides go through /api/connect specifically -
    // its match-creation branch is a near-duplicate of /api/swipe's, with its own independent 23505
    // recovery code (also previously dead for the same reason).
    const connPairs = [];
    for (let i = 0; i < 15; i++) connPairs.push([await mkViewer(`ConnA${i}`), await mkViewer(`ConnB${i}`)]);
    const connResults = await Promise.all(connPairs.flatMap(([a, b]) => [connect(a, b), connect(b, a)]));
    check('every racing /api/connect call completed cleanly (no 5xx)', connResults.every(r => r.status === 200), JSON.stringify(connResults.filter(r => r.status !== 200).slice(0, 5)));
    let connMax = 0, connPairsMatched = 0;
    for (const [a, b] of connPairs) {
      const n = Number((await one(`SELECT count(*) c FROM connections WHERE (user1=$1 AND user2=$2) OR (user1=$2 AND user2=$1)`, [a, b])).c);
      connMax = Math.max(connMax, n);
      if (n >= 1) connPairsMatched++;
    }
    check('all 15 pairs matched via /api/connect (was: a genuine mutual match could be silently missed entirely - see the fix in POST /api/connect\'s insert/check ordering)', connPairsMatched === 15, `connPairsMatched=${connPairsMatched}`);
    check('...and EXACTLY one connection row each - never two', connMax === 1, `connMax=${connMax}`);

    console.log('\n--- A21c: concurrent identical reports from ONE reporter must produce exactly one report row and one -10 penalty ---');
    const reporter = await mkTarget('Reporter');
    const reportTarget = await mkTarget('Report Target');
    await q(`UPDATE users SET trust_score = 50 WHERE id = $1`, [reportTarget]);
    const N_REPORTS = 15;
    const reportResults = await Promise.all(Array.from({ length: N_REPORTS }, () => report(reporter, reportTarget)));
    check('every report request completed cleanly (200 or the expected 400 "already reported" - never a 5xx)', reportResults.every(r => r.status === 200 || r.status === 400), JSON.stringify(reportResults.map(r => r.status)));
    const reportSuccesses = reportResults.filter(r => r.status === 200).length;
    check(`of ${N_REPORTS} concurrent identical reports, exactly ONE succeeded (was: several could all succeed, racing the dedupe check - and the insert's own error was never even checked)`, reportSuccesses === 1, `successes=${reportSuccesses}`);
    const reportRowCount = Number((await one(`SELECT count(*) c FROM reports WHERE from_user=$1 AND target_id=$2`, [reporter, reportTarget])).c);
    check('exactly one report row stored', reportRowCount === 1, `reportRowCount=${reportRowCount}`);
    const targetTrust = Number((await one(`SELECT trust_score t FROM users WHERE id=$1`, [reportTarget])).t);
    check('the target\'s trust score dropped by exactly 10 (50 -> 40) - not once per racing request', targetTrust === 40, `targetTrust=${targetTrust}`);
    // A separate illegal-content report (a genuinely different channel, type='illegal_content') must
    // still be allowed against the SAME target by the SAME reporter - the partial index must not
    // block it (it is scoped to ordinary reports only).
    await q(`INSERT INTO reports (id, from_user, target_id, reason, type) VALUES ($1,$2,$3,'csam','illegal_content')`, [uuid(), reporter, reportTarget]);
    const illegalRowCount = Number((await one(`SELECT count(*) c FROM reports WHERE from_user=$1 AND target_id=$2 AND type='illegal_content'`, [reporter, reportTarget])).c);
    check('an illegal-content report against the same target is NOT blocked by the ordinary-report dedupe index (separate channel)', illegalRowCount === 1, `illegalRowCount=${illegalRowCount}`);

    console.log('\n--- A21b: the monthly quota race - a burst of concurrent sends must never exceed the monthly limit ---');
    const quotaSender = await mkTarget('Quota Sender');   // premium defaults false -> limit 3/month
    const quotaTargets = []; for (let i = 0; i < 10; i++) quotaTargets.push(await mkTarget(`Quota Target ${i}`));
    const quotaResults = await Promise.all(quotaTargets.map(t => pm(quotaSender, t)));
    check('every send completed cleanly (200 sent, or 429 limit reached - never a 5xx)', quotaResults.every(r => r.status === 200 || r.status === 429), JSON.stringify(quotaResults.map(r => r.status)));
    const quotaSent = quotaResults.filter(r => r.status === 200).length;
    check('of 10 concurrent sends (free limit: 3/month), EXACTLY 3 succeeded - not more (was: a burst could exceed the monthly cap, reading the same under-limit count before any commit)', quotaSent === 3, `sent=${quotaSent}`);
    const quotaRowCount = Number((await one(`SELECT count(*) c FROM priority_msgs WHERE from_user=$1`, [quotaSender])).c);
    check('exactly 3 rows stored (never more than the limit, whatever the race)', quotaRowCount === 3, `quotaRowCount=${quotaRowCount}`);
    const limitMsgs = quotaResults.filter(r => r.status === 429).map(r => r.body?.error);
    check('the 7 capped requests all get the correct, informative message', limitMsgs.length === 7 && limitMsgs.every(m => m === 'Priority message limit reached (3/month)'), JSON.stringify([...new Set(limitMsgs)]));

    console.log('\n--- A21b: the duplicate-recipient race - concurrent sends to the SAME person must never produce two messages ---');
    const dupSender = await mkTarget('Dup Sender');
    const dupTarget = await mkTarget('Dup Target');
    const N_DUP = 8;
    const dupResults = await Promise.all(Array.from({ length: N_DUP }, () => pm(dupSender, dupTarget)));
    check('every send completed cleanly (200 or the expected 400 "already sent" - never a 5xx)', dupResults.every(r => r.status === 200 || r.status === 400), JSON.stringify(dupResults.map(r => r.status)));
    const dupSuccesses = dupResults.filter(r => r.status === 200).length;
    check(`of ${N_DUP} concurrent sends to the SAME recipient, exactly ONE succeeded (was: several could all succeed, racing the duplicate-recipient check)`, dupSuccesses === 1, `successes=${dupSuccesses}`);
    const dupRowCount = Number((await one(`SELECT count(*) c FROM priority_msgs WHERE from_user=$1 AND to_user=$2`, [dupSender, dupTarget])).c);
    check('exactly one row stored for that (sender, recipient, month)', dupRowCount === 1, `dupRowCount=${dupRowCount}`);
    const dup400s = dupResults.filter(r => r.status === 400).map(r => r.body?.error);
    check('the rejected duplicates all get the correct message', dup400s.length === N_DUP - 1 && dup400s.every(m => m === 'Already sent a priority message to this person'), JSON.stringify([...new Set(dup400s)]));

    console.log('\n--- A21b: the endpoint\'s own contract is otherwise unchanged (a single ordinary send) ---');
    const ordinarySender = await mkTarget('Ordinary Sender');
    const ordinaryTarget = await mkTarget('Ordinary Target');
    let r = await pm(ordinarySender, ordinaryTarget, 'Check out http://spam.example for more!');
    check('a normal send -> 200, ok:true, remaining reflects the limit just used (3 - 1 = 2)', r.status === 200 && r.body?.ok === true && r.body?.remaining === 2, JSON.stringify(r));
    const stored = await one(`SELECT text FROM priority_msgs WHERE from_user=$1 AND to_user=$2`, [ordinarySender, ordinaryTarget]);
    check('URL stripping still applies (unchanged) - the link is replaced', stored?.text === 'Check out [link removed] for more!', JSON.stringify(stored));
    r = await call('POST', '/api/priority-message', ordinarySender, {});
    check('missing targetId/text -> 400 (unchanged)', r.status === 400, JSON.stringify(r));
    r = await pm(ordinarySender, uuid());
    check('an unknown recipient -> 404 (unchanged)', r.status === 404, JSON.stringify(r));
    r = await call('POST', '/api/priority-message', null, { targetId: ordinaryTarget, text: 'hi' });
    check('no token -> 401 (unchanged)', r.status === 401, JSON.stringify(r));

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
