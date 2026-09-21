// Regression test for audit finding A10 - POST /api/swipe and POST /api/connect did not require an ACTIVE user.
//
//   Both routes were guarded only by auth + profileGuard (profile_score >= 70) + trustGuard (trust >= 20).
//   The "active BYN user" rule - email_verified AND onboarding_stage = 'complete' - was enforced by
//   Discover (as a query filter) and by the web app's layout redirect, but NOT by the API: the email gate
//   existed only on the three onboarding POSTs. So an account that never verified its e-mail, or never
//   finished onboarding, could fill its profile through PUT /api/me (which raises profile_score and trust)
//   and then swipe and CONNECT - creating swipe rows, matches, connections and push notifications for real
//   users - from outside the product flow.
//
// Invariant enforced here: an account that is not active (email_verified !== true OR onboarding_stage !==
// 'complete') gets a 403 from swipe and connect, creating NOTHING (no swipe row, no connection), even when its
// profile is complete enough to clear profileGuard/trustGuard and even when the target has already liked it.
// The 403 says which prerequisite is missing (e-mail first). Active accounts are unaffected, the gate reads
// the CURRENT row (not the 30s auth cache), and existing connections stay readable.
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
  const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a10-pg-'));
  const pgPort = await freePort();
  const epg = new EmbeddedPostgres({ databaseDir: dbDir, user: 'postgres', password: 'pw', port: pgPort, persistent: false, initdbFlags: ['--encoding=UTF8'], onLog: () => {}, onError: () => {} });
  await epg.initialise(); await epg.start(); await epg.createDatabase('byn');
  pool = new pg.Pool({ host: '127.0.0.1', port: pgPort, user: 'postgres', password: 'pw', database: 'byn', max: 10 });
  const q = (sql, args) => pool.query(sql, args); const one = async (sql, args) => (await q(sql, args)).rows[0];
  await q(DDL);

  const shared = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a10-shared-'));
  const stub = path.join(shared, 'stub-resend.cjs');
  fs.writeFileSync(stub, `const Module = require('module'); const orig = Module._load;
Module._load = function (request) { if (request === 'resend') { return { Resend: class { constructor() { this.emails = { send: async () => ({ data: { id: 'stub' }, error: null }) }; } } }; } return orig.apply(this, arguments); };`);
  await new Promise(r => translator.listen(0, '127.0.0.1', r)); const dbPort = translator.address().port;
  const port = await freePort(); const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a10-'));
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, SYSTEMROOT: process.env.SYSTEMROOT, TEMP: os.tmpdir(), TMP: os.tmpdir(), HOME: cwd, USERPROFILE: cwd,
    SUPABASE_URL: `http://127.0.0.1:${dbPort}`, SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key', JWT_SECRET, ADMIN_SECRET: 'test-only-admin-secret', PORT: String(port), RESEND_API_KEY: 'test-only-resend-key' };
  let out = ''; const child = spawn(process.execPath, ['-r', stub, SERVER_JS], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  let exited = null; child.on('exit', c => { exited = c; });
  await waitFor(() => /Server on port/.test(out) || exited !== null, 60000, 200);
  const base = `http://127.0.0.1:${port}`;
  const tok = id => jwt.sign({ id, email: `${id}@example.test`, name: 'T' }, JWT_SECRET, { expiresIn: '1h' });
  let ipN = 0;
  const call = async (method, p, as, body) => { const r = await fetch(base + p, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(as ? { Authorization: `Bearer ${tok(as)}` } : {}), 'X-Forwarded-For': `10.5.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: body !== undefined ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch {} return { status: r.status, body: j }; };

  // an account with a COMPLETE profile (profile_score 100, trust 70) - clears profileGuard and trustGuard - in a chosen onboarding/verification state
  const complete = { name: 'Full Profile', bio: 'A complete biography text', location: 'Pune', intent: 'explore-network', photos: ['1', '2', '3', '4'], interests: ['ai', 'design', 'music'], skills: ['react'], linkedin: 'https://linkedin.com/in/x' };
  const mk = async (id, o = {}) => { const p = { ...complete, ...o }; await q(`INSERT INTO users (id,email,name,bio,location,intent,photos,interests,skills,linkedin,email_verified,onboarding_stage,banned,last_active) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11,$12,$13,now())`,
    [id, `${id}@example.test`, p.name, p.bio, p.location, p.intent, JSON.stringify(p.photos), JSON.stringify(p.interests), JSON.stringify(p.skills), p.linkedin, 'verified' in o ? o.verified : true, 'stage' in o ? o.stage : 'complete', !!o.banned]); return id; };
  const swipesBy = async id => Number((await one(`SELECT count(*) c FROM swipes WHERE from_user=$1`, [id])).c);
  const connsOf = async id => Number((await one(`SELECT count(*) c FROM connections WHERE user1=$1 OR user2=$1`, [id])).c);
  const newTarget = async () => { const id = crypto.randomUUID(); await mk(id); return id; };   // connect requires a UUID-shaped target id
  const likeBack = (from, to) => q(`INSERT INTO swipes (from_user, to_user, direction) VALUES ($1,$2,'right')`, [from, to]);

  // ---- the actors: complete profile, but NOT active ----
  const NOT_ACTIVE = [
    ['unverified, onboarding complete (legacy: reached complete without verifying)', { verified: false, stage: 'complete' }, 'EMAIL_NOT_VERIFIED'],
    ['unverified, still at acquisition (the audit scenario: profile filled via PUT /api/me)', { verified: false, stage: 'acquisition' }, 'EMAIL_NOT_VERIFIED'],
    ['e-mail NULL (never set), onboarding complete', { verified: null, stage: 'complete' }, 'EMAIL_NOT_VERIFIED'],
    ['verified, onboarding stopped at "profile"', { verified: true, stage: 'profile' }, 'ONBOARDING_INCOMPLETE'],
    ['verified, onboarding stopped at "intent"', { verified: true, stage: 'intent' }, 'ONBOARDING_INCOMPLETE'],
    ['verified, still at acquisition', { verified: true, stage: 'acquisition' }, 'ONBOARDING_INCOMPLETE'],
    ['verified, onboarding stage NULL', { verified: true, stage: null }, 'ONBOARDING_INCOMPLETE'],
  ];

  try {
    check('server booted', /Server on port/.test(out) && exited === null, out.slice(-300));
    const active = await mk('active1');

    console.log('\n--- control: an ACTIVE account (verified + onboarding complete) is unaffected ---');
    let t = await newTarget(); let r = await call('POST', '/api/swipe', active, { targetId: t, direction: 'right' });
    check('active: swipe right -> 200 {match:false}, swipe row created', r.status === 200 && r.body?.match === false && (await swipesBy(active)) === 1, JSON.stringify(r));
    t = await newTarget(); r = await call('POST', '/api/connect', active, { userId: t });
    check('active: connect -> 200 {ok:true, match:false}', r.status === 200 && r.body?.ok === true && r.body?.match === false, JSON.stringify(r));
    t = await newTarget(); await likeBack(t, active); r = await call('POST', '/api/connect', active, { userId: t });
    check('active: connect to someone who already liked them -> match, connection row created', r.status === 200 && r.body?.match === true && (await connsOf(active)) === 1, JSON.stringify(r));
    t = await newTarget(); await likeBack(t, active); r = await call('POST', '/api/swipe', active, { targetId: t, direction: 'right' });
    check('active: mutual swipe -> match (connection created)', r.status === 200 && r.body?.match === true && (await connsOf(active)) === 2, JSON.stringify(r));

    for (const [label, o, code] of NOT_ACTIVE) {
      console.log(`\n--- not active: ${label} ---`);
      const id = `na_${Math.random().toString(36).slice(2, 8)}`; await mk(id, o);
      const tgt = await newTarget(); await likeBack(tgt, id);          // the target ALREADY liked them: pre-fix, one right-swipe would create a connection
      const s1 = await call('POST', '/api/swipe', id, { targetId: tgt, direction: 'right' });
      check(`swipe right -> 403 ${code}`, s1.status === 403 && s1.body?.code === code, JSON.stringify(s1));
      const c1 = await call('POST', '/api/connect', id, { userId: tgt });
      check(`connect -> 403 ${code}`, c1.status === 403 && c1.body?.code === code, JSON.stringify(c1));
      const s2 = await call('POST', '/api/swipe', id, { targetId: tgt, direction: 'left' });
      check('swipe left is gated too -> 403', s2.status === 403, JSON.stringify(s2));
      check('NOTHING was created: no swipe row by them, no connection involving them', (await swipesBy(id)) === 0 && (await connsOf(id)) === 0, `swipes=${await swipesBy(id)} conns=${await connsOf(id)}`);
      check('...and the profile really was complete enough to clear profileGuard/trustGuard (so it is the active gate that refused)', (await one(`SELECT jsonb_array_length(photos) n FROM users WHERE id=$1`, [id])).n === 4);
    }

    console.log('\n--- error precedence: an unverified account with an INCOMPLETE profile is told to verify e-mail first ---');
    const raw = `raw_${Math.random().toString(36).slice(2, 8)}`; await mk(raw, { verified: false, stage: 'acquisition', name: '', bio: '', location: '', intent: null, photos: [], interests: [], skills: [], linkedin: '' });
    t = await newTarget(); r = await call('POST', '/api/swipe', raw, { targetId: t, direction: 'right' });
    check('unverified + empty profile -> EMAIL_NOT_VERIFIED (not PROFILE_INCOMPLETE / TRUST_TOO_LOW)', r.status === 403 && r.body?.code === 'EMAIL_NOT_VERIFIED', JSON.stringify(r));
    const raw2 = `raw_${Math.random().toString(36).slice(2, 8)}`; await mk(raw2, { verified: true, stage: 'profile', name: '', bio: '', location: '', intent: null, photos: [], interests: [], skills: [], linkedin: '' });
    r = await call('POST', '/api/connect', raw2, { userId: t });
    check('verified + mid-onboarding + empty profile -> ONBOARDING_INCOMPLETE', r.status === 403 && r.body?.code === 'ONBOARDING_INCOMPLETE', JSON.stringify(r));
    check('the message tells them what to do', /verify your email/i.test((await call('POST', '/api/swipe', raw, { targetId: t, direction: 'right' })).body?.error || ''), '');

    console.log('\n--- the gate reads the CURRENT row, not the 30-second auth cache ---');
    const flip = `flip_${Math.random().toString(36).slice(2, 8)}`; await mk(flip, { verified: false, stage: 'acquisition' });
    await call('GET', '/api/me', flip);                                   // warms the auth cache for this account
    t = await newTarget(); r = await call('POST', '/api/swipe', flip, { targetId: t, direction: 'right' });
    check('warm cache, not active -> still 403 (the cached slice does not carry the fields; the gate must not treat that as "fine")', r.status === 403 && r.body?.code === 'EMAIL_NOT_VERIFIED', JSON.stringify(r));
    await q(`UPDATE users SET email_verified = true, onboarding_stage = 'complete' WHERE id=$1`, [flip]);
    r = await call('POST', '/api/swipe', flip, { targetId: t, direction: 'right' });
    check('...and the moment the account BECOMES active (verifies + completes onboarding) the very next swipe works, no waiting for the cache', r.status === 200 && (await swipesBy(flip)) === 1, JSON.stringify(r));
    await q(`UPDATE users SET email_verified = false WHERE id=$1`, [flip]);
    t = await newTarget(); r = await call('POST', '/api/connect', flip, { userId: t });
    check('...and if it stops being active, connect is refused again immediately', r.status === 403 && r.body?.code === 'EMAIL_NOT_VERIFIED', JSON.stringify(r));

    console.log('\n--- unchanged behaviours ---');
    r = await call('POST', '/api/swipe', null, { targetId: t, direction: 'right' });
    check('no token -> 401', r.status === 401, JSON.stringify(r));
    const ban = await mk('banned1', { banned: true });
    r = await call('POST', '/api/connect', ban, { userId: t });
    check('banned account -> 403 "Account restricted" (auth answers before the new gate)', r.status === 403 && /restricted/i.test(r.body?.error || ''), JSON.stringify(r));
    r = await call('POST', '/api/swipe', active, { targetId: t, direction: 'sideways' });
    check('an active account with invalid swipe data -> 400 (validation unchanged)', r.status === 400, JSON.stringify(r));
    r = await call('POST', '/api/connect', active, {});
    check('an active account with no userId -> 400 (unchanged)', r.status === 400, JSON.stringify(r));
    // existing connections stay readable: the gate is about STARTING new connections, not about reading old ones
    const legacy = `legacy_${Math.random().toString(36).slice(2, 8)}`; await mk(legacy, { verified: false, stage: 'complete' }); const peer = await newTarget();
    await q(`INSERT INTO connections (id, user1, user2, expires_at, active, status) VALUES ('legacy-c1', $1, $2, now() + interval '7 days', true, 'active')`, [legacy, peer]);
    r = await call('GET', '/api/connections', legacy);
    check('an inactive account keeps read access to its EXISTING connections (GET /api/connections -> 200 with the connection)', r.status === 200 && Array.isArray(r.body) && r.body.length === 1, JSON.stringify(r).slice(0, 200));
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
