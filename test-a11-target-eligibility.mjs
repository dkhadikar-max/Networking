// Regression test for audit finding A11 - POST /api/swipe and POST /api/connect never validated the TARGET.
//
//   swipe checked only that `targetId` was truthy; connect checked only that it looked like a UUID. Neither
//   looked the target up. So a nonexistent id, a soft-deleted (anonymised) account, a BANNED account or (on
//   swipe) a malformed value of any type all answered 200 and wrote a swipe row - and, if that account had
//   already swiped right on the caller, created a real match and connection with someone who no longer exists
//   or has been banned. Production already holds 21 swipe rows on users that do not exist.
//
// Invariant enforced here: the target must be a real, live account - it exists, is not soft-deleted and is not
// banned - otherwise the request is refused (404) and NOTHING is written: no swipe row, no connection, no
// daily-limit consumed. Nonexistent / deleted / banned are indistinguishable (same status and body), so the
// endpoints cannot be used to probe which ids were ever accounts or who was banned. A malformed target on swipe
// is a 400 like connect already gave. The caller's own gate (A10) still answers first; eligible targets, matches,
// duplicate handling and self-swipes behave as before.
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
  const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a11-pg-'));
  const pgPort = await freePort();
  const epg = new EmbeddedPostgres({ databaseDir: dbDir, user: 'postgres', password: 'pw', port: pgPort, persistent: false, initdbFlags: ['--encoding=UTF8'], onLog: () => {}, onError: () => {} });
  await epg.initialise(); await epg.start(); await epg.createDatabase('byn');
  pool = new pg.Pool({ host: '127.0.0.1', port: pgPort, user: 'postgres', password: 'pw', database: 'byn', max: 10 });
  const q = (sql, args) => pool.query(sql, args); const one = async (sql, args) => (await q(sql, args)).rows[0];
  await q(DDL);

  const shared = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a11-shared-'));
  const stub = path.join(shared, 'stub-resend.cjs');
  fs.writeFileSync(stub, `const Module = require('module'); const orig = Module._load;
Module._load = function (request) { if (request === 'resend') { return { Resend: class { constructor() { this.emails = { send: async () => ({ data: { id: 'stub' }, error: null }) }; } } }; } return orig.apply(this, arguments); };`);
  await new Promise(r => translator.listen(0, '127.0.0.1', r)); const dbPort = translator.address().port;
  const port = await freePort(); const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a11-'));
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, SYSTEMROOT: process.env.SYSTEMROOT, TEMP: os.tmpdir(), TMP: os.tmpdir(), HOME: cwd, USERPROFILE: cwd,
    SUPABASE_URL: `http://127.0.0.1:${dbPort}`, SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key', JWT_SECRET, ADMIN_SECRET: 'test-only-admin-secret', PORT: String(port), RESEND_API_KEY: 'test-only-resend-key' };
  let out = ''; const child = spawn(process.execPath, ['-r', stub, SERVER_JS], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  let exited = null; child.on('exit', c => { exited = c; });
  await waitFor(() => /Server on port/.test(out) || exited !== null, 60000, 200);
  const base = `http://127.0.0.1:${port}`;
  const tok = id => jwt.sign({ id, email: `${id}@example.test`, name: 'T' }, JWT_SECRET, { expiresIn: '1h' });
  let ipN = 0;
  const call = async (method, p, as, body) => { const r = await fetch(base + p, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(as ? { Authorization: `Bearer ${tok(as)}` } : {}), 'X-Forwarded-For': `10.4.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: body !== undefined ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch {} return { status: r.status, body: j }; };

  // an ACTIVE caller with a complete profile (clears activeGuard, profileGuard and trustGuard), and targets in chosen states
  const complete = { name: 'Full Profile', bio: 'A complete biography text', location: 'Pune', intent: 'explore-network', photos: ['1', '2', '3', '4'], interests: ['ai', 'design', 'music'], skills: ['react'], linkedin: 'https://linkedin.com/in/x' };
  const mk = async (id, o = {}) => { const p = { ...complete, ...o }; await q(`INSERT INTO users (id,email,name,bio,location,intent,photos,interests,skills,linkedin,email_verified,onboarding_stage,banned,deleted_at,last_active) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11,$12,$13,$14,now())`,
    [id, `${id}@example.test`, p.name, p.bio, p.location, p.intent, JSON.stringify(p.photos), JSON.stringify(p.interests), JSON.stringify(p.skills), p.linkedin, 'verified' in o ? o.verified : true, 'stage' in o ? o.stage : 'complete', !!o.banned, o.deleted ? new Date().toISOString() : null]); return id; };
  const swipesBy = async id => Number((await one(`SELECT count(*) c FROM swipes WHERE from_user=$1`, [id])).c);
  const swipesTo = async id => Number((await one(`SELECT count(*) c FROM swipes WHERE to_user=$1 AND from_user <> to_user`, [id])).c);
  const connsOf = async id => Number((await one(`SELECT count(*) c FROM connections WHERE user1=$1 OR user2=$1`, [id])).c);
  const uuid = () => crypto.randomUUID();
  // the target ALREADY liked the caller: before the fix, one swipe on them was a real match
  const likeBack = (from, to) => q(`INSERT INTO swipes (from_user, to_user, direction) VALUES ($1,$2,'right')`, [from, to]);

  try {
    check('server booted', /Server on port/.test(out) && exited === null, out.slice(-300));
    const me = await mk('active1');

    // ---- targets that must be refused ----
    const ghost = uuid();                                                        // a well-formed id that never existed
    const deleted = uuid(); await mk(deleted, { deleted: true, name: 'Deleted User' });
    const banned = uuid(); await mk(banned, { banned: true });
    for (const id of [deleted, banned]) await likeBack(id, me);
    const swipesToMeBefore = await swipesTo(me);
    const baseline = await swipesBy(me);
    const INELIGIBLE = [['NONEXISTENT (well-formed id that was never an account)', ghost], ['SOFT-DELETED (anonymised) account', deleted], ['BANNED account', banned]];
    const answers = [];
    for (const [label, tgt] of INELIGIBLE) {
      console.log(`\n--- target: ${label} ---`);
      const s1 = await call('POST', '/api/swipe', me, { targetId: tgt, direction: 'right' });
      const s2 = await call('POST', '/api/swipe', me, { targetId: tgt, direction: 'left' });
      const c1 = await call('POST', '/api/connect', me, { userId: tgt });
      answers.push([s1, s2, c1]);
      check('swipe right -> 404', s1.status === 404, JSON.stringify(s1));
      check('swipe left -> 404', s2.status === 404, JSON.stringify(s2));
      check('connect -> 404', c1.status === 404, JSON.stringify(c1));
      check('NOTHING was written: no swipe row by the caller on them, no connection involving them, no daily swipe consumed',
        (await connsOf(tgt)) === 0 && (await swipesBy(me)) === baseline, `conns=${await connsOf(tgt)} mine=${await swipesBy(me)}/${baseline}`);
    }
    check('their earlier like of the caller did NOT turn into a match: no connection anywhere for the caller', (await connsOf(me)) === 0, `conns=${await connsOf(me)}`);
    const same = (a, b) => a.status === b.status && JSON.stringify(a.body) === JSON.stringify(b.body);
    check('nonexistent, deleted and banned are INDISTINGUISHABLE (same status and body on swipe right, swipe left and connect) - no probing which ids were accounts or who was banned',
      [0, 1, 2].every(i => same(answers[0][i], answers[1][i]) && same(answers[0][i], answers[2][i])), JSON.stringify(answers.map(a => a[0].body)));

    console.log('\n--- malformed target on swipe (connect already validated the format) ---');
    for (const [label, targetId] of [['not a UUID', 'not-a-uuid'], ['number', 12345], ['object', { a: 1 }], ['array', ['x']], ['boolean', true], ['5000 chars', 'A'.repeat(5000)], ['UUID-shaped garbage', 'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz']]) {
      const r = await call('POST', '/api/swipe', me, { targetId, direction: 'right' });
      check(`swipe with a ${label} target -> 400, no row written`, r.status === 400 && (await swipesBy(me)) === baseline, JSON.stringify([r.status, r.body?.error]));
    }
    let r = await call('POST', '/api/connect', me, { userId: 'not-a-uuid' });
    check('connect with a malformed target -> 400 (unchanged)', r.status === 400, JSON.stringify(r));
    r = await call('POST', '/api/swipe', me, { targetId: '', direction: 'right' });
    check('swipe with an empty target -> 400 (unchanged)', r.status === 400, JSON.stringify(r));

    console.log('\n--- an EXISTING connection with a target that has since been banned ---');
    const stale = uuid(); await mk(stale);
    await q(`INSERT INTO connections (id, user1, user2, expires_at, active, status) VALUES ('stale-c1', $1, $2, now() + interval '7 days', true, 'active')`, [me, stale]);
    r = await call('POST', '/api/connect', me, { userId: stale });
    check('while the target is eligible, connect on an existing connection answers as before (200, duplicate, the connection id)', r.status === 200 && r.body?.duplicate === true && r.body?.connectionId === 'stale-c1', JSON.stringify(r));
    await q(`UPDATE users SET banned = true WHERE id=$1`, [stale]);
    r = await call('POST', '/api/connect', me, { userId: stale });
    check('once the target is BANNED, connect -> 404 (the target check comes before the "already connected" shortcut)', r.status === 404, JSON.stringify(r));
    r = await call('GET', '/api/connections', me);
    check('...and the existing connection itself is untouched (still listed: only NEW swipe/connect is gated)', r.status === 200 && Array.isArray(r.body) && r.body.some(c => c.connection?.id === 'stale-c1'), JSON.stringify(r).slice(0, 160));

    console.log('\n--- control: an ELIGIBLE target behaves exactly as before ---');
    const t1 = uuid(); await mk(t1);
    r = await call('POST', '/api/swipe', me, { targetId: t1, direction: 'right' });
    check('swipe right on an eligible target -> 200 {match:false}, one swipe row', r.status === 200 && r.body?.match === false && (await swipesTo(t1)) === 1, JSON.stringify(r));
    r = await call('POST', '/api/swipe', me, { targetId: t1, direction: 'right' });
    check('swiping the same target again -> duplicate:true, still one row (unchanged)', r.status === 200 && r.body?.duplicate === true && (await swipesTo(t1)) === 1, JSON.stringify(r));
    const t2 = uuid(); await mk(t2); await likeBack(t2, me);
    r = await call('POST', '/api/swipe', me, { targetId: t2, direction: 'right' });
    check('mutual swipe with an eligible target -> match, connection created (unchanged)', r.status === 200 && r.body?.match === true && (await connsOf(t2)) === 1, JSON.stringify(r));
    const t3 = uuid(); await mk(t3); await likeBack(t3, me);
    r = await call('POST', '/api/connect', me, { userId: t3 });
    check('connect to an eligible target who already liked the caller -> match (unchanged)', r.status === 200 && r.body?.match === true && (await connsOf(t3)) === 1, JSON.stringify(r));
    const t4 = uuid(); await mk(t4);
    r = await call('POST', '/api/connect', me, { userId: t4 });
    check('connect to an eligible target -> 200 {ok, match:false} (unchanged)', r.status === 200 && r.body?.ok === true && r.body?.match === false, JSON.stringify(r));
    r = await call('POST', '/api/swipe', me, { targetId: 'active1', direction: 'right' });
    check('swipe on yourself -> 200 {ok:true} and no row (unchanged)', r.status === 200 && r.body?.ok === true && (await one(`SELECT count(*) c FROM swipes WHERE from_user='active1' AND to_user='active1'`)).c === '0', JSON.stringify(r));
    r = await call('POST', '/api/connect', me, { userId: 'active1' });
    check('connect to yourself -> 400 (unchanged)', r.status === 400, JSON.stringify(r));
    r = await call('POST', '/api/swipe', me, { targetId: t4, direction: 'sideways' });
    check('an invalid direction -> 400 (unchanged)', r.status === 400, JSON.stringify(r));

    console.log('\n--- the caller\'s own gate (A10) still answers FIRST ---');
    const unv = await mk('unverified1', { verified: false, stage: 'acquisition' });
    r = await call('POST', '/api/swipe', unv, { targetId: ghost, direction: 'right' });
    check('an unverified caller swiping a nonexistent target -> 403 EMAIL_NOT_VERIFIED (not 404: the caller gate comes first)', r.status === 403 && r.body?.code === 'EMAIL_NOT_VERIFIED', JSON.stringify(r));
    r = await call('POST', '/api/swipe', null, { targetId: t1, direction: 'right' });
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
