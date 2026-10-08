// Regression test: three remaining surfaces did not honor ban / deletion / block state, unlike swipe,
// connect, priority-message, profile view, search and (now) circles.
//
//   GET /api/liked-me    listed (and counted) likers who were banned or deleted after they swiped,
//                        and ghost swipe rows whose users row is gone. A banned liker's real profile
//                        was shown to premium users; a free user's `count` included people who could
//                        never be shown.
//   POST /api/skip       (the web app's pass action) validated nothing about its target: no id shape
//                        check, no live-account check, no block check. A skip against a nonexistent,
//                        banned, deleted or blocked id was silently stored as a swipe row.
//   POST /api/block      validated the id's SHAPE but never that the target is a real, live account,
//                        so blocking a nonexistent / banned / deleted id stored a junk block row and
//                        answered ok.
//
// Decision (this commit): the same predicate everywhere - isLiveTarget (exists, not banned, not
// deleted), plus the symmetric block check on skip - with the same uniform "User not found" answer
// the other routes give, so nothing here reveals who was banned or who blocked whom.
//
// Deliberately NOT changed (pinned below so it stays a conscious decision):
//   * /api/skip gets NO activeGuard / profileGuard / trustGuard chain. Skip is a harmless left-swipe,
//     A10/A11 left it ungated on purpose, and the onboarding Discover preview may rely on it.
//   * liked-me does not add the broader "active user" (verified + onboarding-complete) rule - that
//     is an eligibility-policy question, not a ban/delete one.
//   * the unchecked writes inside /api/skip and /api/block (same class as the profile/photo fix) are
//     a separate change, covered by test-skip-block-write-failures.mjs.
//
// How it runs (nothing can touch production): the REAL server.js (or $SERVER_JS) against a
// PostgREST-compatible translator over a REAL PostgreSQL (embedded-postgres, UTF-8); empty cwd (no
// .env), whitelisted env. Requires (test-only): npm install --no-save embedded-postgres pg
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

    // ================= liked-me =================
    console.log('\n=== GET /api/liked-me ===');
    const live1 = await mkUser('Live Liker One'), live2 = await mkUser('Live Liker Two');
    const bannedLiker = await mkUser('Banned Liker', { banned: true });
    const deletedLiker = await mkUser('Deleted Liker', { deleted_at: new Date().toISOString(), photos: [] });
    const ghost = uuid();   // a swipe row whose users row does not exist
    const premiumViewer = await mkUser('Premium Viewer', { premium: true });
    const freeViewer = await mkUser('Free Viewer');
    for (const viewer of [premiumViewer, freeViewer]) for (const liker of [live1, live2, bannedLiker, deletedLiker, ghost]) await swipe(liker, viewer, 'right');

    let r = await call('GET', '/api/liked-me', premiumViewer);
    const ids = (r.body?.profiles || []).map(p => p.id).sort();
    check('premium: only the two live likers are listed (no banned, deleted or ghost liker)', r.status === 200 && JSON.stringify(ids) === JSON.stringify([live1, live2].sort()), JSON.stringify([r.status, ids]));
    check('premium: count matches what is actually shown (2, not 5)', r.body?.count === 2, JSON.stringify(r.body?.count));
    r = await call('GET', '/api/liked-me', freeViewer);
    check('free: premium_required, and the count is 2 - people who can never be shown are not counted', r.status === 200 && r.body?.premium_required === true && r.body?.count === 2, JSON.stringify(r.body));
    check('free: exactly two previews, and still no id leaked', Array.isArray(r.body?.previews) && r.body.previews.length === 2 && r.body.previews.every(p => !('id' in p) && p.photo), JSON.stringify(r.body?.previews));

    // ================= skip =================
    console.log('\n=== POST /api/skip ===');
    const skipper = await mkUser('Skipper');
    const liveT = await mkUser('Skip Live Target');
    r = await call('POST', '/api/skip', skipper, { targetId: liveT });
    check('a live target -> 200, a left swipe row is stored (unchanged)', r.status === 200 && (await swipeRows(skipper, liveT)) === 1 && (await one(`SELECT direction FROM swipes WHERE from_user=$1 AND to_user=$2`, [skipper, liveT])).direction === 'left', JSON.stringify(r));
    r = await call('POST', '/api/skip', skipper, { targetId: liveT });
    check('skipping the same target again -> 200, still exactly one row (unchanged)', r.status === 200 && (await swipeRows(skipper, liveT)) === 1, JSON.stringify(r));
    r = await call('POST', '/api/skip', skipper, { targetId: skipper });
    check('skipping yourself -> 200 ok, nothing stored (unchanged)', r.status === 200 && (await swipeRows(skipper, skipper)) === 0, JSON.stringify(r));
    r = await call('POST', '/api/skip', skipper, {});
    check('no targetId -> 400 (unchanged)', r.status === 400, JSON.stringify(r));

    const skipCases = [];
    const skipBanned = await mkUser('Skip Banned', { banned: true });
    const skipDeleted = await mkUser('Skip Deleted', { deleted_at: new Date().toISOString() });
    const skipBlockedByMe = await mkUser('Skip Blocked By Me'); await block(skipper, skipBlockedByMe);
    const skipBlockedMe = await mkUser('Skip Blocked Me'); await block(skipBlockedMe, skipper);
    const skipNonexistent = uuid();
    for (const [label, target] of [['nonexistent', skipNonexistent], ['banned', skipBanned], ['soft-deleted', skipDeleted], ['someone the caller BLOCKED', skipBlockedByMe], ['someone who BLOCKED the caller', skipBlockedMe]]) {
      r = await call('POST', '/api/skip', skipper, { targetId: target });
      skipCases.push(r);
      check(`${label} target -> 404 User not found, nothing stored`, r.status === 404 && r.body?.error === 'User not found' && (await swipeRows(skipper, target)) === 0, JSON.stringify([r, await swipeRows(skipper, target)]));
    }
    check('every refusal is byte-identical - a caller cannot tell "never existed" from "banned" from "blocked"', skipCases.every(x => JSON.stringify(x.body) === JSON.stringify(skipCases[0].body)), JSON.stringify(skipCases.map(x => x.body)));
    r = await call('POST', '/api/skip', skipper, { targetId: 'not-a-uuid' });
    check('a malformed id -> 400 Invalid user id, nothing stored', r.status === 400 && r.body?.error === 'Invalid user id' && (await swipeRows(skipper, 'not-a-uuid')) === 0, JSON.stringify(r));

    console.log('\n--- deliberate non-change: skip stays ungated for an unverified / onboarding-incomplete caller ---');
    const unverified = await mkUser('Unverified Skipper', { verified: false, stage: 'profile' });
    const anotherLive = await mkUser('Another Live Target');
    r = await call('POST', '/api/skip', unverified, { targetId: anotherLive });
    check('an unverified, onboarding-incomplete caller can still skip a live target (no activeGuard / profileGuard / trustGuard added)', r.status === 200 && (await swipeRows(unverified, anotherLive)) === 1, JSON.stringify(r));

    // ================= block =================
    console.log('\n=== POST /api/block ===');
    const blocker = await mkUser('Blocker');
    const victim = await mkUser('Block Live Target');
    const conn = uuid();
    await q(`INSERT INTO connections (id,user1,user2,active,status) VALUES ($1,$2,$3,true,'active')`, [conn, blocker, victim]);
    await q(`INSERT INTO messages (id,connection_id,sender_id,text) VALUES ($1,$2,$3,'hello')`, [uuid(), conn, victim]);
    await swipe(blocker, victim); await swipe(victim, blocker);
    r = await call('POST', '/api/block', blocker, { targetId: victim });
    check('a live target -> 200, block row stored', r.status === 200 && (await blockRows(blocker, victim)) === 1, JSON.stringify(r));
    check('...and the existing teardown is unchanged: connection, its messages and both swipes are gone',
      (await rows(`SELECT count(*) c FROM connections WHERE id=$1`, [conn])) === 0 && (await rows(`SELECT count(*) c FROM messages WHERE connection_id=$1`, [conn])) === 0 && (await swipeRows(blocker, victim)) === 0 && (await swipeRows(victim, blocker)) === 0, '');
    r = await call('POST', '/api/block', blocker, { targetId: victim });
    check('blocking the same user again -> 200, still exactly one block row (unchanged)', r.status === 200 && (await blockRows(blocker, victim)) === 1, JSON.stringify(r));
    r = await call('POST', '/api/block', blocker, { targetId: blocker });
    check('blocking yourself -> 400 (unchanged)', r.status === 400, JSON.stringify(r));
    r = await call('POST', '/api/block', blocker, { targetId: 'not-a-uuid' });
    check('a malformed id -> 400 (unchanged)', r.status === 400, JSON.stringify(r));

    const blockBanned = await mkUser('Block Banned', { banned: true });
    const blockDeleted = await mkUser('Block Deleted', { deleted_at: new Date().toISOString() });
    const blockNonexistent = uuid();
    const blockCases = [];
    for (const [label, target] of [['nonexistent', blockNonexistent], ['banned', blockBanned], ['soft-deleted', blockDeleted]]) {
      r = await call('POST', '/api/block', blocker, { targetId: target });
      blockCases.push(r);
      check(`${label} target -> 404 User not found, no junk block row stored`, r.status === 404 && r.body?.error === 'User not found' && (await blockRows(blocker, target)) === 0, JSON.stringify([r, await blockRows(blocker, target)]));
    }
    check('every refusal is byte-identical', blockCases.every(x => JSON.stringify(x.body) === JSON.stringify(blockCases[0].body)), JSON.stringify(blockCases.map(x => x.body)));

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
