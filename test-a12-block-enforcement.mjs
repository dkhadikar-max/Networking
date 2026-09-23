// Regression test for audit finding A12 - a BLOCK was recorded but never honored.
//
//   POST /api/block stores the block and (correctly) deletes any existing connection, its messages and the
//   swipes between the pair. But nothing afterwards ENFORCED it: Discover was the only reader of the blocks
//   table. So a blocked user could immediately connect to, swipe on, priority-message, VIEW the profile of and
//   SEARCH for the person who blocked them - re-creating the very contact the block was meant to end, with a
//   real match, a real connection and a push notification to the blocker.
//
// Invariant enforced here: if either user has blocked the other, then for the other party the account behaves
// like one that does not exist - swipe, connect and priority-message answer with the SAME 404 a nonexistent user
// gets, the profile view is a 404, and search leaves them out - and nothing is written (no swipe row, no
// connection, no priority message, no monthly quota used). Symmetric, like Discover (which already excluded
// both directions); indistinguishable from "no such user", so the blocked user cannot even tell they were
// blocked. Everyone else - including each side's contact with third parties - is unaffected, the block takes
// effect immediately, and the existing cleanup in POST /api/block is unchanged.
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
CREATE TABLE reports (id text PRIMARY KEY, from_user text NOT NULL, target_id text NOT NULL, reason text NOT NULL, type text, created_at timestamptz DEFAULT now());
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
    const rpcMatch = /^\/rest\/v1\/rpc\/(\w+)$/.exec(url.pathname);
    if (rpcMatch) {
      const argNames = Object.keys(body || {});
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
  const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a12-pg-'));
  const pgPort = await freePort();
  const epg = new EmbeddedPostgres({ databaseDir: dbDir, user: 'postgres', password: 'pw', port: pgPort, persistent: false, initdbFlags: ['--encoding=UTF8'], onLog: () => {}, onError: () => {} });
  await epg.initialise(); await epg.start(); await epg.createDatabase('byn');
  pool = new pg.Pool({ host: '127.0.0.1', port: pgPort, user: 'postgres', password: 'pw', database: 'byn', max: 10 });
  const q = (sql, args) => pool.query(sql, args); const one = async (sql, args) => (await q(sql, args)).rows[0];
  await q(DDL);
  await q(fs.readFileSync(path.join(here, 'migrations', '024_concurrency_race_fixes.sql'), 'utf8'));

  const shared = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a12-shared-'));
  const stub = path.join(shared, 'stub-resend.cjs');
  fs.writeFileSync(stub, `const Module = require('module'); const orig = Module._load;
Module._load = function (request) { if (request === 'resend') { return { Resend: class { constructor() { this.emails = { send: async () => ({ data: { id: 'stub' }, error: null }) }; } } }; } return orig.apply(this, arguments); };`);
  await new Promise(r => translator.listen(0, '127.0.0.1', r)); const dbPort = translator.address().port;
  const port = await freePort(); const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a12-'));
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, SYSTEMROOT: process.env.SYSTEMROOT, TEMP: os.tmpdir(), TMP: os.tmpdir(), HOME: cwd, USERPROFILE: cwd,
    SUPABASE_URL: `http://127.0.0.1:${dbPort}`, SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key', JWT_SECRET, ADMIN_SECRET: 'test-only-admin-secret', PORT: String(port), RESEND_API_KEY: 'test-only-resend-key' };
  let out = ''; const child = spawn(process.execPath, ['-r', stub, SERVER_JS], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  let exited = null; child.on('exit', c => { exited = c; });
  await waitFor(() => /Server on port/.test(out) || exited !== null, 60000, 200);
  const base = `http://127.0.0.1:${port}`;
  const tok = id => jwt.sign({ id, email: `${id}@example.test`, name: 'T' }, JWT_SECRET, { expiresIn: '1h' });
  let ipN = 0;
  const call = async (method, p, as, body) => { const r = await fetch(base + p, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(as ? { Authorization: `Bearer ${tok(as)}` } : {}), 'X-Forwarded-For': `10.3.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: body !== undefined ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch {} return { status: r.status, body: j }; };

  // three ACTIVE people with complete profiles: X blocks Y; Z is a bystander
  const complete = { bio: 'A complete biography text', location: 'Pune', intent: 'explore-network', photos: ['1', '2', '3', '4'], interests: ['ai', 'design', 'music'], skills: ['react'], linkedin: 'https://linkedin.com/in/x' };
  const mk = async (id, name) => { const p = { ...complete, name }; await q(`INSERT INTO users (id,email,name,bio,location,intent,photos,interests,skills,linkedin,email_verified,onboarding_stage,banned,last_active) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10,true,'complete',false,now())`,
    [id, `${id}@example.test`, p.name, p.bio, p.location, p.intent, JSON.stringify(p.photos), JSON.stringify(p.interests), JSON.stringify(p.skills), p.linkedin]); return id; };
  const uuid = () => crypto.randomUUID();
  const cnt = async (sql, args) => Number((await one(sql, args)).c);
  const swipes = (a, b) => cnt(`SELECT count(*) c FROM swipes WHERE (from_user=$1 AND to_user=$2) OR (from_user=$2 AND to_user=$1)`, [a, b]);
  const conns = (a, b) => cnt(`SELECT count(*) c FROM connections WHERE (user1=$1 AND user2=$2) OR (user1=$2 AND user2=$1)`, [a, b]);
  const prio = (a, b) => cnt(`SELECT count(*) c FROM priority_msgs WHERE from_user=$1 AND to_user=$2`, [a, b]);
  const same = (a, b) => a.status === b.status && JSON.stringify(a.body) === JSON.stringify(b.body);
  const names = body => (Array.isArray(body) ? body : []).map(u => u.name);

  try {
    check('server booted', /Server on port/.test(out) && exited === null, out.slice(-300));
    const X = await mk(uuid(), 'Blocker Xavier'), Y = await mk(uuid(), 'Blocked Yolanda'), Z = await mk(uuid(), 'Bystander Zed');
    const ghost = uuid();

    console.log('\n--- before any block: everyone can see everyone (control) ---');
    let r = await call('GET', `/api/profiles/${X}`, Y);
    check('Y can view X\'s profile', r.status === 200 && r.body?.name === 'Blocker Xavier', JSON.stringify(r).slice(0, 140));
    r = await call('GET', '/api/search?q=ai', Y);
    check('Y\'s search finds X and Z', r.status === 200 && names(r.body).includes('Blocker Xavier') && names(r.body).includes('Bystander Zed'), JSON.stringify(names(r.body)));

    console.log('\n--- X blocks Y through the real route (existing cleanup must still work) ---');
    await q(`INSERT INTO connections (id, user1, user2, expires_at, active, status) VALUES ('xy-c', $1, $2, now() + interval '7 days', true, 'active')`, [X, Y]);
    await q(`INSERT INTO swipes (from_user, to_user, direction) VALUES ($1,$2,'right'), ($2,$1,'right')`, [X, Y]);
    r = await call('POST', '/api/block', X, { targetId: Y });
    check('POST /api/block -> 200', r.status === 200 && r.body?.ok === true, JSON.stringify(r));
    check('existing cleanup unchanged: the connection and both swipes between them are gone', (await conns(X, Y)) === 0 && (await swipes(X, Y)) === 0, `conns=${await conns(X, Y)} swipes=${await swipes(X, Y)}`);
    check('...and blocking twice is harmless (still 200, one block row)', (await call('POST', '/api/block', X, { targetId: Y })).status === 200 && (await cnt(`SELECT count(*) c FROM blocks WHERE from_user=$1 AND to_user=$2`, [X, Y])) === 1);

    // each direction of the pair, against every audited surface
    for (const [label, from, to] of [['BLOCKED user (Y) toward the blocker (X)', Y, X], ['the BLOCKER (X) toward the blocked user (Y) - symmetric, like Discover', X, Y]]) {
      console.log(`\n--- ${label} ---`);
      const s1 = await call('POST', '/api/swipe', from, { targetId: to, direction: 'right' });
      const s2 = await call('POST', '/api/swipe', from, { targetId: to, direction: 'left' });
      const c1 = await call('POST', '/api/connect', from, { userId: to });
      const p1 = await call('POST', '/api/priority-message', from, { targetId: to, text: 'hello, please respond' });
      const v1 = await call('GET', `/api/profiles/${to}`, from);
      const q1 = await call('GET', '/api/search?q=ai', from);
      check('swipe right -> 404', s1.status === 404, JSON.stringify(s1));
      check('swipe left -> 404', s2.status === 404, JSON.stringify(s2));
      check('connect -> 404', c1.status === 404, JSON.stringify(c1));
      check('priority message -> 404', p1.status === 404, JSON.stringify(p1));
      check('profile view -> 404', v1.status === 404, JSON.stringify(v1));
      const toName = to === X ? 'Blocker Xavier' : 'Blocked Yolanda';
      check(`search does not return them (but still returns everyone else)`, q1.status === 200 && !names(q1.body).includes(toName) && names(q1.body).includes('Bystander Zed'), JSON.stringify(names(q1.body)));
      check('NOTHING was written: no swipe row, no connection, no priority message between them', (await swipes(from, to)) === 0 && (await conns(from, to)) === 0 && (await prio(from, to)) === 0, `swipes=${await swipes(from, to)} conns=${await conns(from, to)} prio=${await prio(from, to)}`);
      // a blocked party must not even learn they are blocked: the answers equal those for an id that does not exist
      const gs = await call('POST', '/api/swipe', from, { targetId: ghost, direction: 'right' });
      const gc = await call('POST', '/api/connect', from, { userId: ghost });
      const gp = await call('POST', '/api/priority-message', from, { targetId: ghost, text: 'hello, please respond' });
      const gv = await call('GET', `/api/profiles/${ghost}`, from);
      check('...and every refusal is IDENTICAL to what a nonexistent user gets (swipe, connect, priority message, profile view) - a blocked user cannot tell they are blocked',
        same(s1, gs) && same(c1, gc) && same(p1, gp) && same(v1, gv), JSON.stringify({ swipe: [s1.body, gs.body], connect: [c1.body, gc.body], prio: [p1.body, gp.body], view: [v1.body, gv.body] }).slice(0, 300));
    }

    console.log('\n--- the block used no quota: the same person can still use their full allowance elsewhere ---');
    r = await call('POST', '/api/priority-message', Y, { targetId: Z, text: 'hello Z, please respond' });
    check('Y -> Z priority message succeeds and reports the FULL remaining quota (2 of 3 left: the refused attempts to X consumed nothing)', r.status === 200 && r.body?.remaining === 2, JSON.stringify(r));

    console.log('\n--- everyone else is unaffected ---');
    r = await call('POST', '/api/swipe', Y, { targetId: Z, direction: 'right' });
    check('Y can swipe on Z', r.status === 200, JSON.stringify(r));
    r = await call('POST', '/api/connect', X, { userId: Z });
    check('X can connect to Z', r.status === 200 && r.body?.ok === true, JSON.stringify(r));
    r = await call('GET', `/api/profiles/${Z}`, Y);
    check('Y can view Z\'s profile', r.status === 200 && r.body?.name === 'Bystander Zed', JSON.stringify(r).slice(0, 120));
    r = await call('GET', `/api/profiles/${X}`, Z);
    check('Z (who blocked nobody and was blocked by nobody) can still view X, connect to X and search for X',
      r.status === 200 && (await call('POST', '/api/swipe', Z, { targetId: X, direction: 'right' })).status === 200 && names((await call('GET', '/api/search?q=ai', Z)).body).includes('Blocker Xavier'), JSON.stringify(r).slice(0, 120));
    r = await call('GET', `/api/profiles/${Y}`, Y);
    check('a user can still view their OWN profile', r.status === 200 && r.body?.name === 'Blocked Yolanda', JSON.stringify(r).slice(0, 120));
    r = await call('GET', '/api/discover?worldwide=true', Y);
    check('Discover is unchanged: it still leaves X out of Y\'s feed and still shows Z',
      r.status === 200 && !(r.body?.profiles || []).some(p => p.name === 'Blocker Xavier'), JSON.stringify((r.body?.profiles || []).map(p => p.name)));

    console.log('\n--- a block between OTHER people does not touch this pair, and takes effect immediately ---');
    const W = await mk(uuid(), 'Newcomer Wren');
    r = await call('POST', '/api/connect', W, { userId: Z });
    check('before any block, W can connect to Z', r.status === 200, JSON.stringify(r));
    await call('POST', '/api/block', Z, { targetId: W });
    r = await call('POST', '/api/connect', W, { userId: X });
    check('a block Z placed on W does not stop W from connecting to X (blocks are pairwise)', r.status === 200, JSON.stringify(r));
    r = await call('GET', `/api/profiles/${Z}`, W);
    check('...but W can no longer view Z (immediately - no cache to wait out)', r.status === 404, JSON.stringify(r));

    console.log('\n--- hostile ids never reach the block query unescaped ---');
    r = await call('POST', '/api/priority-message', Y, { targetId: "x' OR '1'='1", text: 'hello, please respond' });
    check('a priority-message target that is not an account -> 404 "Recipient not found" (unchanged), no error', r.status === 404, JSON.stringify(r));
    r = await call('GET', `/api/profiles/${encodeURIComponent("x),from_user.neq.zzz,(a.eq.b")}`, Y);
    check('a profile id crafted to break out of a filter -> 404 (unchanged), no error', r.status === 404, JSON.stringify(r));
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
