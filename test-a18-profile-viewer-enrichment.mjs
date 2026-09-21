// Regression test for audit finding A18 - GET /api/profiles/:id enriched the response only for a raw
// `Authorization: Bearer` header.
//
//   The route is behind auth(), which identifies the caller from EITHER the `Authorization: Bearer` header (the
//   mobile app) OR the httpOnly `byn_token` cookie (the web app - frontend/lib/api.ts sends `credentials:
//   'include'` and no Authorization header at all). After auth() had already verified the caller and set
//   req.user, the handler ignored it and re-parsed `req.headers.authorization` itself for its "optional auth"
//   enrichment (is_connected, mutual_count, my_review), swallowing every failure in an empty catch. So a
//   cookie-authenticated caller (every web user) was authenticated, could read the profile, and silently got a
//   response WITHOUT the three fields - the same endpoint returned different answers for the same person
//   depending only on how the session was carried. (The web profile page computes `connected` from
//   `is_connected` - frontend/app/(app)/profile/[id]/page.tsx - so the data path was broken even though the
//   view does not render it yet.)
//
// Invariant enforced here: the enrichment is a function of WHO the authenticated caller is (req.user), not of
// the transport that carried the credential - cookie, Bearer and both give identical bodies - and a failed
// enrichment query is an error, not a silently thinner response.
//
// How it runs (nothing can touch production): the REAL server.js (or $SERVER_JS) against a PostgREST-compatible
// translator over a REAL PostgreSQL (embedded-postgres, UTF-8); empty cwd (no .env), whitelisted env. A fault
// hook in the translator makes chosen queries fail, to prove the failure is not swallowed.
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
CREATE TABLE blocks (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, from_user text NOT NULL, to_user text NOT NULL, created_at timestamptz DEFAULT now());
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
  const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a18-pg-'));
  const pgPort = await freePort();
  const epg = new EmbeddedPostgres({ databaseDir: dbDir, user: 'postgres', password: 'pw', port: pgPort, persistent: false, initdbFlags: ['--encoding=UTF8'], onLog: () => {}, onError: () => {} });
  await epg.initialise(); await epg.start(); await epg.createDatabase('byn');
  pool = new pg.Pool({ host: '127.0.0.1', port: pgPort, user: 'postgres', password: 'pw', database: 'byn', max: 10 });
  const q = (sql, args) => pool.query(sql, args); const one = async (sql, args) => (await q(sql, args)).rows[0];
  await q(DDL);

  const shared = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a18-shared-'));
  const stub = path.join(shared, 'stub-resend.cjs');
  fs.writeFileSync(stub, `const Module = require('module'); const orig = Module._load;
Module._load = function (request) { if (request === 'resend') { return { Resend: class { constructor() { this.emails = { send: async () => ({ data: { id: 'stub' }, error: null }) }; } } }; } return orig.apply(this, arguments); };`);
  await new Promise(r => translator.listen(0, '127.0.0.1', r)); const dbPort = translator.address().port;
  const port = await freePort(); const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a18-'));
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, SYSTEMROOT: process.env.SYSTEMROOT, TEMP: os.tmpdir(), TMP: os.tmpdir(), HOME: cwd, USERPROFILE: cwd,
    SUPABASE_URL: `http://127.0.0.1:${dbPort}`, SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key', JWT_SECRET, ADMIN_SECRET: 'test-only-admin-secret', PORT: String(port), RESEND_API_KEY: 'test-only-resend-key' };
  let out = ''; const child = spawn(process.execPath, ['-r', stub, SERVER_JS], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  let exited = null; child.on('exit', c => { exited = c; });
  await waitFor(() => /Server on port/.test(out) || exited !== null, 60000, 200);
  const base = `http://127.0.0.1:${port}`;
  const tok = id => jwt.sign({ id, email: `${id}@example.test`, name: 'T' }, JWT_SECRET, { expiresIn: '1h' });
  let ipN = 0;
  const call = async (method, p, as, body) => { const r = await fetch(base + p, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(as ? { Authorization: `Bearer ${tok(as)}` } : {}), 'X-Forwarded-For': `10.12.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: body !== undefined ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch {} return { status: r.status, body: j }; };

  const uuid = () => crypto.randomUUID();
  const mkU = async (name, o = {}) => {
    const id = uuid();
    await q(`INSERT INTO users (id,email,name,bio,headline,location,intent,photos,interests,skills,linkedin,trust_score,email_verified,onboarding_stage,banned,last_active)
             VALUES ($1,$2,$3,'A complete biography text','','Pune','explore-network','["1","2","3","4"]'::jsonb,'["ai"]'::jsonb,'["react"]'::jsonb,'https://linkedin.com/in/x',10,true,'complete',false,now())`,
      [id, `${id}@example.test`, name]);
    return id;
  };
  const mkConn = async (a, b) => {
    await q(`INSERT INTO connections (id, user1, user2, expires_at, active, user1_responded, user2_responded) VALUES ($1,$2,$3,$4,true,true,true)`, [uuid(), a, b, new Date(Date.now() + 86400000).toISOString()]);
  };
  const mkReview = async (reviewer, reviewed, rating, tags = []) =>
    q(`INSERT INTO user_reviews (reviewer_id, reviewed_id, rating, tags) VALUES ($1,$2,$3,$4::jsonb)`, [reviewer, reviewed, rating, JSON.stringify(tags)]);
  // The three ways a request can carry its identity. `web` = the byn_token cookie ONLY (what the web app sends);
  // `mobile` = a Bearer header ONLY; `both` = a cookie for one user and a Bearer header for another.
  let xff = 0;
  const get = async (id, { web, mobile, cookieOf } = {}) => {
    const headers = { 'X-Forwarded-For': `10.13.${Math.floor(++xff / 250)}.${xff % 250 + 1}` };
    if (web) headers.Cookie = `byn_token=${tok(web)}`;
    if (cookieOf) headers.Cookie = `byn_token=${tok(cookieOf)}`;
    if (mobile) headers.Authorization = `Bearer ${tok(mobile)}`;
    const r = await fetch(`${base}/api/profiles/${id}`, { headers });
    let j = null; try { j = await r.json(); } catch {}
    return { status: r.status, body: j };
  };
  const enrich = b => ({ is_connected: b?.is_connected, mutual_count: b?.mutual_count, my_review: b?.my_review });
  const has = (b, k) => !!b && Object.prototype.hasOwnProperty.call(b, k);

  try {
    check('server booted', /Server on port/.test(out) && exited === null, out.slice(-300));

    // ---- the graph:  V - T, V - M1, V - M2, T - M1, T - M2, T - X, Z - X.   T's connections: V, M1, M2, X (4).
    const V = await mkU('Viewer V'), T = await mkU('Target T'), M1 = await mkU('Mutual M1'), M2 = await mkU('Mutual M2'), X = await mkU('Other X'), Z = await mkU('Stranger Z');
    for (const [a, b] of [[V, T], [V, M1], [V, M2], [T, M1], [T, M2], [T, X], [Z, X]]) await mkConn(a, b);
    await mkReview(V, T, 5, ['reliable']);          // V has reviewed T
    await mkReview(M2, T, 3, []);                   // and so has M2 (not M1)

    console.log('\n--- a connected viewer, on each transport ---');
    let r = await get(T, { mobile: V });
    check('MOBILE (Bearer header): is_connected true, mutual_count 2 (M1, M2), my_review = V\'s own review (5) - correct before and after the fix', r.status === 200 && r.body?.is_connected === true && r.body?.mutual_count === 2 && r.body?.my_review?.rating === 5 && r.body?.my_review?.reviewer_id === V, JSON.stringify([r.status, enrich(r.body)]));
    const mobileBody = r.body;
    r = await get(T, { web: V });
    check('WEB (cookie only): the SAME three fields (was: none of them)', r.status === 200 && r.body?.is_connected === true && r.body?.mutual_count === 2 && r.body?.my_review?.rating === 5, JSON.stringify([r.status, enrich(r.body)]));
    check('WEB and MOBILE bodies are identical, field for field', JSON.stringify(r.body) === JSON.stringify(mobileBody), 'web keys: ' + Object.keys(r.body || {}).sort().join(','));

    console.log('\n--- a connected viewer who has not reviewed, a viewer with only a mutual friend, and self ---');
    r = await get(T, { web: M1 });
    check('WEB, connected but no review yet: is_connected true, mutual_count 1 (V), my_review null', r.status === 200 && r.body?.is_connected === true && r.body?.mutual_count === 1 && r.body?.my_review === null, JSON.stringify([r.status, enrich(r.body)]));
    r = await get(T, { web: Z });
    check('WEB, not connected but with one mutual connection (X): is_connected false, mutual_count 1, and no my_review key', r.status === 200 && r.body?.is_connected === false && r.body?.mutual_count === 1 && !has(r.body, 'my_review'), JSON.stringify([r.status, enrich(r.body), has(r.body, 'my_review')]));
    r = await get(T, { mobile: Z });
    check('...and the same on MOBILE', r.status === 200 && r.body?.is_connected === false && r.body?.mutual_count === 1 && !has(r.body, 'my_review'), JSON.stringify([r.status, enrich(r.body)]));
    r = await get(T, { web: T });
    check('WEB, own profile: no is_connected / mutual_count / my_review (as before)', r.status === 200 && !has(r.body, 'is_connected') && !has(r.body, 'mutual_count') && !has(r.body, 'my_review'), JSON.stringify(enrich(r.body)));
    r = await get(T, { mobile: T });
    check('MOBILE, own profile: the same', r.status === 200 && !has(r.body, 'is_connected') && !has(r.body, 'mutual_count') && !has(r.body, 'my_review'), JSON.stringify(enrich(r.body)));

    console.log('\n--- the enrichment follows the AUTHENTICATED caller (req.user) ---');
    r = await get(T, { cookieOf: Z, mobile: V });
    check('cookie for Z + Bearer for V: auth() takes the Bearer identity, and the enrichment is V\'s (connected, 2 mutual) - not Z\'s', r.status === 200 && r.body?.is_connected === true && r.body?.mutual_count === 2, JSON.stringify([r.status, enrich(r.body)]));

    console.log('\n--- the rest of the response is unchanged ---');
    r = await get(T, { web: V });
    check('connections_count 4, review_summary { count 2, avg_rating 4 }, works []', r.body?.connections_count === 4 && r.body?.review_summary?.count === 2 && r.body?.review_summary?.avg_rating === 4 && Array.isArray(r.body?.works), JSON.stringify([r.body?.connections_count, r.body?.review_summary, r.body?.works]));
    check('still the public view: no email, password, banned, lat/lng leak', r.body?.id === T && !['email', 'password', 'banned', 'lat', 'lng', 'push_token'].some(k => has(r.body, k)), Object.keys(r.body || {}).join(','));
    r = await get(uuid(), { web: V });
    check('an unknown id -> 404', r.status === 404, JSON.stringify(r));
    r = await get(T, {});
    check('no credential at all -> 401', r.status === 401, JSON.stringify(r));
    r = await get(T, { cookieOf: V });
    check('the cookie alone is enough to be authenticated (200)', r.status === 200, JSON.stringify(r).slice(0, 100));

    console.log('\n--- block enforcement (A12) is untouched, on both transports ---');
    const Bk = await mkU('Blocked Bk');
    await q(`INSERT INTO blocks (from_user, to_user) VALUES ($1,$2)`, [T, Bk]);
    r = await get(T, { web: Bk });
    check('a user the target blocked -> 404 (web)', r.status === 404, JSON.stringify(r));
    r = await get(T, { mobile: Bk });
    check('...and 404 (mobile)', r.status === 404, JSON.stringify(r));

    console.log('\n--- a failing enrichment query is an error, not a silently thinner profile ---');
    faultOn = (method, table, url) => method === 'GET' && table === 'connections' && (url.searchParams.get('or') || '').includes(V) && !(url.searchParams.get('or') || '').includes(T);   // the VIEWER's connection list
    r = await get(T, { web: V });
    check('WEB: the viewer\'s connections lookup fails -> 500 (not a 200 without is_connected)', r.status === 500, JSON.stringify([r.status, enrich(r.body)]));
    r = await get(T, { mobile: V });
    check('MOBILE: the same (was: swallowed by an empty catch, a 200 without the fields)', r.status === 500, JSON.stringify([r.status, enrich(r.body)]));
    faultOn = (method, table, url) => method === 'GET' && table === 'user_reviews' && (url.searchParams.get('reviewer_id') || '') === `eq.${V}`;   // V's own review
    r = await get(T, { web: V });
    check('the viewer\'s own-review lookup fails -> 500', r.status === 500, JSON.stringify([r.status, enrich(r.body)]));
    faultOn = null;
    r = await get(T, { web: V });
    check('and once the fault clears, the full enrichment is back', r.status === 200 && r.body?.is_connected === true && r.body?.my_review?.rating === 5, JSON.stringify([r.status, enrich(r.body)]));

    console.log('\n--- source: the handler takes its identity from req.user, not from the Authorization header ---');
    const src = fs.readFileSync(SERVER_JS, 'utf8');
    const iH = src.indexOf("app.get('/api/profiles/:id'");
    const iNext = src.indexOf('\napp.', iH + 10);
    const handler = src.slice(iH, iNext).split(/\r?\n/).filter(l => !/^\s*\/\//.test(l)).join('\n');   // code only: the explanatory comments name the old approach
    check('the /api/profiles/:id handler does not read req.headers.authorization or verify a token itself', iH > 0 && iNext > iH && !/headers\.authorization|jwt\.verify/.test(handler), 'handler still parses the header');

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
