// Regression test for audit finding A15 - GET /api/discover/daily-signal read the caller's location from the
// auth cache slice.
//
//   The route took `const me = req.userData` and read me.location / me.lat / me.lng. On a COLD cache auth() puts
//   the full users row there; on a WARM cache hit (the web app warms it with GET /api/me on every page load,
//   and it lasts 30s) req.userData is the narrow cached slice - id, banned, premium, password_changed_at,
//   deleted_at, role - which never carries location or coordinates. So the same user, with the same data, got
//   { count: N, city: "Pune" } when cold and { count: 0, city: "" } when warm.
//   (Same defect class as A2 / A3: a handler trusting req.userData for fields the cache does not hold.)
//
// Invariant enforced here: the answer depends only on the user's data, never on whether their auth cache
// happens to be warm - and it reflects the CURRENT row (a location change is seen at once, not after the 30s
// TTL). The counting rules themselves are unchanged.
//
// How it runs (nothing can touch production): the REAL server.js (or $SERVER_JS) against a PostgREST-compatible
// translator over a REAL PostgreSQL (embedded-postgres, UTF-8); empty cwd (no .env), whitelisted env.
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
  last_active timestamptz, created_at timestamptz DEFAULT now());
CREATE TABLE swipes (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, from_user text NOT NULL, to_user text NOT NULL, direction text NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE connections (id text PRIMARY KEY, user1 text NOT NULL, user2 text NOT NULL, created_at timestamptz DEFAULT now(), expires_at timestamptz, first_response_deadline timestamptz,
  user1_responded boolean DEFAULT false, user2_responded boolean DEFAULT false, active boolean DEFAULT false, status text, user1_last_read_at timestamptz, user2_last_read_at timestamptz);
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
const translator = http.createServer((req, res) => {
  const chunks = []; req.on('data', c => chunks.push(c));
  req.on('end', async () => {
    const url = new URL(req.url, 'http://mock'); const table = url.pathname.replace(/^\/rest\/v1\//, '');
    const raw = Buffer.concat(chunks).toString('utf8'); let body = null; try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
    const wantObject = (req.headers.accept || '').includes('vnd.pgrst.object+json'); const prefer = req.headers.prefer || '';
    const send = (status, payload, extra = {}) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...extra }); res.end(payload === undefined ? undefined : JSON.stringify(payload)); };
    const objectOr406 = list => list.length === 1 ? send(200, list[0]) : send(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: null, hint: null });
    try {
      const cols = await tableCols(table);
      if (!cols) return req.method === 'GET' || req.method === 'HEAD' ? send(200, [], { 'Content-Range': '*/0' }) : (res.writeHead(req.method === 'POST' ? 201 : 204), res.end());
      const knownCols = payload => { for (const c of Object.keys(payload)) if (!cols.has(c)) throw new PgLike(400, 'PGRST204', `Could not find the '${c}' column of '${table}' in the schema cache`); };
      const cast = (c, v) => cols.get(c) === 'jsonb' ? JSON.stringify(v) : v;
      if (req.method === 'GET' || req.method === 'HEAD') {
        const args = []; const w = where(table, cols, url.searchParams, args); const ob = orderBy(cols, url.searchParams); const lim = url.searchParams.get('limit') ? `LIMIT ${parseInt(url.searchParams.get('limit'), 10)}` : '';
        const rows = (await pool.query(`SELECT to_jsonb(t) AS r FROM "${table}" t ${w} ${ob} ${lim}`, args)).rows.map(r => pick(r.r, url.searchParams.get('select'), cols, table));
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
  const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a15-pg-'));
  const pgPort = await freePort();
  const epg = new EmbeddedPostgres({ databaseDir: dbDir, user: 'postgres', password: 'pw', port: pgPort, persistent: false, initdbFlags: ['--encoding=UTF8'], onLog: () => {}, onError: () => {} });
  await epg.initialise(); await epg.start(); await epg.createDatabase('byn');
  pool = new pg.Pool({ host: '127.0.0.1', port: pgPort, user: 'postgres', password: 'pw', database: 'byn', max: 10 });
  const q = (sql, args) => pool.query(sql, args); const one = async (sql, args) => (await q(sql, args)).rows[0];
  await q(DDL);

  const shared = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a15-shared-'));
  const stub = path.join(shared, 'stub-resend.cjs');
  fs.writeFileSync(stub, `const Module = require('module'); const orig = Module._load;
Module._load = function (request) { if (request === 'resend') { return { Resend: class { constructor() { this.emails = { send: async () => ({ data: { id: 'stub' }, error: null }) }; } } }; } return orig.apply(this, arguments); };`);
  await new Promise(r => translator.listen(0, '127.0.0.1', r)); const dbPort = translator.address().port;
  const port = await freePort(); const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a15-'));
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, SYSTEMROOT: process.env.SYSTEMROOT, TEMP: os.tmpdir(), TMP: os.tmpdir(), HOME: cwd, USERPROFILE: cwd,
    SUPABASE_URL: `http://127.0.0.1:${dbPort}`, SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key', JWT_SECRET, ADMIN_SECRET: 'test-only-admin-secret', PORT: String(port), RESEND_API_KEY: 'test-only-resend-key' };
  let out = ''; const child = spawn(process.execPath, ['-r', stub, SERVER_JS], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  let exited = null; child.on('exit', c => { exited = c; });
  await waitFor(() => /Server on port/.test(out) || exited !== null, 60000, 200);
  const base = `http://127.0.0.1:${port}`;
  const tok = id => jwt.sign({ id, email: `${id}@example.test`, name: 'T' }, JWT_SECRET, { expiresIn: '1h' });
  let ipN = 0;
  const call = async (method, p, as, body) => { const r = await fetch(base + p, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(as ? { Authorization: `Bearer ${tok(as)}` } : {}), 'X-Forwarded-For': `10.0.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: body !== undefined ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch {} return { status: r.status, body: j }; };

  const uuid = () => crypto.randomUUID();
  const HOURS = h => new Date(Date.now() - h * 3600000).toISOString();
  // one row per call; `o` sets location / coordinates / verification / activity / creation time
  const mkU = async (name, o = {}) => {
    const id = o.id || uuid(); const has = k => k in o;
    await q(`INSERT INTO users (id,email,name,bio,location,lat,lng,intent,photos,interests,skills,linkedin,email_verified,onboarding_stage,banned,last_active,created_at)
             VALUES ($1,$2,$3,'A complete biography text',$4,$5,$6,'explore-network','["1","2","3","4"]'::jsonb,'["ai","design","music"]'::jsonb,'[]'::jsonb,'https://linkedin.com/in/x',$7,'complete',false,$8,$9)`,
      [id, `${id}@example.test`, name, has('location') ? o.location : '', o.lat ?? null, o.lng ?? null, has('verified') ? o.verified : true, has('active') ? o.active : HOURS(0), has('created') ? o.created : HOURS(24 * 60)]);
    return id;
  };
  const PUNE = { lat: 18.52, lng: 73.86 };

  try {
    check('server booted', /Server on port/.test(out) && exited === null, out.slice(-300));

    // ---- the people the signal counts (active or created in the last 24h, e-mail verified, not the caller) ----
    await mkU('Same City One', { location: 'Pune, India', ...PUNE });                                   // counts: same city string
    await mkU('Same City Two', { location: 'Pune', ...PUNE });                                          // counts
    await mkU('Nearby By Coords', { location: 'Mumbai', lat: 19.07, lng: 72.87 });                      // counts by distance only (~120 km, different city string)
    await mkU('New Signup', { location: 'Pune', ...PUNE, active: HOURS(24 * 40), created: HOURS(2) });  // counts: created in the last 24h although not recently active
    await mkU('Far Away', { location: 'Delhi', lat: 28.61, lng: 77.20 });                               // does NOT count: far and another city
    await mkU('Unverified Local', { location: 'Pune', ...PUNE, verified: false });                      // does NOT count: e-mail not verified
    await mkU('Stale Local', { location: 'Pune', ...PUNE, active: HOURS(24 * 3), created: HOURS(24 * 30) }); // does NOT count: neither active nor created in 24h
    // callers: same data in every request, only the state of THEIR auth cache differs
    const withCity = await mkU('Caller With City', { location: 'Pune', ...PUNE });
    const coordsOnly = await mkU('Caller Coords Only', { location: '', ...PUNE });
    const nothing = await mkU('Caller With Nothing', { location: '' });
    const EXPECT_CITY = { count: 5, city: 'Pune' };            // Same City One + Two + Nearby By Coords + New Signup + the OTHER caller with Pune coordinates
    const EXPECT_COORDS = { count: 5, city: '' };              // the same five, all found through coordinates (One, Two, New Signup and the other caller are at the Pune point; Nearby is ~120 km)

    console.log('\n--- a caller with a city: cold, then warm, then warm again ---');
    let r = await call('GET', '/api/discover/daily-signal', withCity);                                  // FIRST request: cold cache
    check('COLD cache: { count: 5, city: "Pune" }', r.status === 200 && r.body?.count === EXPECT_CITY.count && r.body?.city === EXPECT_CITY.city, JSON.stringify(r));
    const me1 = await call('GET', '/api/me', withCity);                                                 // what the web app does on every page load - warms the auth cache
    check('(GET /api/me warms the cache)', me1.status === 200);
    r = await call('GET', '/api/discover/daily-signal', withCity);
    check('WARM cache: the SAME answer { count: 5, city: "Pune" } (was { count: 0, city: "" })', r.status === 200 && r.body?.count === EXPECT_CITY.count && r.body?.city === EXPECT_CITY.city, JSON.stringify(r));
    r = await call('GET', '/api/discover/daily-signal', withCity);
    check('...and again on the next warm request', r.status === 200 && r.body?.count === EXPECT_CITY.count && r.body?.city === EXPECT_CITY.city, JSON.stringify(r));

    console.log('\n--- a caller with coordinates but no city string: found through the coordinates, cold and warm alike ---');
    r = await call('GET', '/api/discover/daily-signal', coordsOnly);
    check('COLD: { count: 5, city: "" }', r.status === 200 && r.body?.count === EXPECT_COORDS.count && r.body?.city === EXPECT_COORDS.city, JSON.stringify(r));
    await call('GET', '/api/me', coordsOnly);
    r = await call('GET', '/api/discover/daily-signal', coordsOnly);
    check('WARM: the same { count: 5, city: "" } (was 0 - the coordinates were unreadable from the cache)', r.status === 200 && r.body?.count === EXPECT_COORDS.count && r.body?.city === EXPECT_COORDS.city, JSON.stringify(r));

    console.log('\n--- a caller with neither: 0, cold and warm alike (unchanged) ---');
    r = await call('GET', '/api/discover/daily-signal', nothing);
    check('COLD: { count: 0, city: "" }', r.status === 200 && r.body?.count === 0 && r.body?.city === '', JSON.stringify(r));
    await call('GET', '/api/me', nothing);
    r = await call('GET', '/api/discover/daily-signal', nothing);
    check('WARM: { count: 0, city: "" }', r.status === 200 && r.body?.count === 0 && r.body?.city === '', JSON.stringify(r));

    console.log('\n--- the answer reflects the CURRENT row, not a stale cache ---');
    await call('GET', '/api/me', withCity);                                                             // cache is warm for this caller
    await q(`UPDATE users SET location='Delhi', lat=28.61, lng=77.20 WHERE id=$1`, [withCity]);
    r = await call('GET', '/api/discover/daily-signal', withCity);
    check('warm cache + the caller moved to Delhi -> the very next request already answers for Delhi (city "Delhi", the Delhi user counted)', r.status === 200 && r.body?.city === 'Delhi' && r.body?.count === 1, JSON.stringify(r));
    await q(`UPDATE users SET location='Pune', lat=18.52, lng=73.86 WHERE id=$1`, [withCity]);
    r = await call('GET', '/api/discover/daily-signal', withCity);
    check('...and back again', r.status === 200 && r.body?.city === 'Pune' && r.body?.count === 5, JSON.stringify(r));

    console.log('\n--- unchanged behaviour ---');
    r = await call('GET', '/api/discover/daily-signal', withCity);
    check('the response shape is still exactly { count, city }', JSON.stringify(Object.keys(r.body || {}).sort()) === JSON.stringify(['city', 'count']), JSON.stringify(Object.keys(r.body || {})));
    r = await call('GET', '/api/discover/daily-signal', null);
    check('no token -> 401', r.status === 401, JSON.stringify(r));
    // the counting rules: the caller is never counted; unverified / stale users are not
    const onlyMe = await mkU('Lonely Caller', { location: 'Atlantis' });
    r = await call('GET', '/api/discover/daily-signal', onlyMe);
    check('a caller in a city nobody else is in counts nobody (and never counts themselves)', r.status === 200 && r.body?.count === 0 && r.body?.city === 'Atlantis', JSON.stringify(r));
    await call('GET', '/api/me', onlyMe);
    r = await call('GET', '/api/discover/daily-signal', onlyMe);
    check('...the same when warm, and the city is now reported (it was "" when warm)', r.status === 200 && r.body?.count === 0 && r.body?.city === 'Atlantis', JSON.stringify(r));
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
