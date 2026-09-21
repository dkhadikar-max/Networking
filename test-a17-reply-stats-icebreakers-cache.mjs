// Regression test for audit finding A17 - two handlers read the caller's profile from the auth-cache slice.
//
//   1. POST /api/messages/:connId  (reply tracking).  After a message is stored, a fire-and-forget block updates
//      the SENDER's users.reply_count and users.avg_reply_minutes from `req.userData.reply_count` /
//      `.avg_reply_minutes`. On a COLD cache auth() puts the full users row there; on a WARM hit (the web app
//      warms it with GET /api/me on every page load, for 30s) req.userData is the narrow cached slice - id, banned,
//      premium, password_changed_at, deleted_at, role - which carries NEITHER field. Both read as 0, so the block
//      computed a count of 1 and an average of just this one reply, and WROTE THAT over the stored values: three
//      replies gave reply_count 1, 1, 1, and a user with a real history was silently reset. It is persisted
//      corruption of the "replies in ~N min" figure other users see, not a display glitch.
//   2. GET /api/connections/:connId  (ice-breaker chips).  getIcebreakers(req.userData, other) reads the caller's
//      working_on / currently_exploring / location / skills / interests / intent - none of which the slice holds -
//      so a warm-cache caller got the generic chips instead of the personalised ones (same city, shared skills...).
//   (Same defect class as A2 / A15 / A16.)
//
// Invariant enforced here: a caller's reply statistics accumulate from their STORED values, whatever the state of
// their auth cache, and are never overwritten with a value computed from zero; the chips a caller gets depend
// only on their data. The extra lookup is made only when the cache is warm AND the value is needed (the reply
// stats only when the message actually is a reply), never on a cold request.
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
  last_active timestamptz, created_at timestamptz DEFAULT now(),
  reply_count int DEFAULT 0, avg_reply_minutes int DEFAULT 0, response_rate int DEFAULT 100);
CREATE TABLE swipes (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, from_user text NOT NULL, to_user text NOT NULL, direction text NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE connections (id text PRIMARY KEY, user1 text NOT NULL, user2 text NOT NULL, created_at timestamptz DEFAULT now(), expires_at timestamptz, first_response_deadline timestamptz,
  user1_responded boolean DEFAULT false, user2_responded boolean DEFAULT false, active boolean DEFAULT false, status text, user1_last_read_at timestamptz, user2_last_read_at timestamptz);
CREATE TABLE circle_posts (id text PRIMARY KEY, user_id text NOT NULL, text text, tags jsonb DEFAULT '[]', structured_meta jsonb DEFAULT '{}', links jsonb DEFAULT '[]', created_at timestamptz DEFAULT now(), group_id text);
CREATE TABLE circle_groups (id text PRIMARY KEY, privacy text DEFAULT 'public');
CREATE TABLE circle_group_members (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, group_id text, user_id text, role text);
CREATE TABLE messages (id text PRIMARY KEY, connection_id text NOT NULL, sender_id text NOT NULL, text text, created_at timestamptz DEFAULT now());
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
const translator = http.createServer((req, res) => {
  const chunks = []; req.on('data', c => chunks.push(c));
  req.on('end', async () => {
    const url = new URL(req.url, 'http://mock'); const table = url.pathname.replace(/^\/rest\/v1\//, ''); dbLog.push({ method: req.method, table, select: url.searchParams.get('select') });
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
  const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a17-pg-'));
  const pgPort = await freePort();
  const epg = new EmbeddedPostgres({ databaseDir: dbDir, user: 'postgres', password: 'pw', port: pgPort, persistent: false, initdbFlags: ['--encoding=UTF8'], onLog: () => {}, onError: () => {} });
  await epg.initialise(); await epg.start(); await epg.createDatabase('byn');
  pool = new pg.Pool({ host: '127.0.0.1', port: pgPort, user: 'postgres', password: 'pw', database: 'byn', max: 10 });
  const q = (sql, args) => pool.query(sql, args); const one = async (sql, args) => (await q(sql, args)).rows[0];
  await q(DDL);

  const shared = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a17-shared-'));
  const stub = path.join(shared, 'stub-resend.cjs');
  fs.writeFileSync(stub, `const Module = require('module'); const orig = Module._load;
Module._load = function (request) { if (request === 'resend') { return { Resend: class { constructor() { this.emails = { send: async () => ({ data: { id: 'stub' }, error: null }) }; } } }; } return orig.apply(this, arguments); };`);
  await new Promise(r => translator.listen(0, '127.0.0.1', r)); const dbPort = translator.address().port;
  const port = await freePort(); const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a17-'));
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, SYSTEMROOT: process.env.SYSTEMROOT, TEMP: os.tmpdir(), TMP: os.tmpdir(), HOME: cwd, USERPROFILE: cwd,
    SUPABASE_URL: `http://127.0.0.1:${dbPort}`, SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key', JWT_SECRET, ADMIN_SECRET: 'test-only-admin-secret', PORT: String(port), RESEND_API_KEY: 'test-only-resend-key' };
  let out = ''; const child = spawn(process.execPath, ['-r', stub, SERVER_JS], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  let exited = null; child.on('exit', c => { exited = c; });
  await waitFor(() => /Server on port/.test(out) || exited !== null, 60000, 200);
  const base = `http://127.0.0.1:${port}`;
  const tok = id => jwt.sign({ id, email: `${id}@example.test`, name: 'T' }, JWT_SECRET, { expiresIn: '1h' });
  let ipN = 0;
  const call = async (method, p, as, body) => { const r = await fetch(base + p, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(as ? { Authorization: `Bearer ${tok(as)}` } : {}), 'X-Forwarded-For': `10.10.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: body !== undefined ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch {} return { status: r.status, body: j }; };

  const uuid = () => crypto.randomUUID();
  const MIN_AGO = m => new Date(Date.now() - m * 60000).toISOString();
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // a user row; `o` sets the profile fields the ice-breakers read and the stored reply statistics
  const mkU = async (name, o = {}) => {
    const id = uuid();
    await q(`INSERT INTO users (id,email,name,bio,headline,location,intent,photos,interests,skills,working_on,currently_exploring,linkedin,trust_score,email_verified,onboarding_stage,banned,reply_count,avg_reply_minutes,response_rate,last_active)
             VALUES ($1,$2,$3,'A complete biography text','',$4,$5,'["1","2","3","4"]'::jsonb,$6::jsonb,$7::jsonb,$8,$9,'https://linkedin.com/in/x',10,true,'complete',false,$10,$11,$12,now())`,
      [id, `${id}@example.test`, name, o.location ?? '', o.intent ?? 'explore-network', JSON.stringify(o.interests || []), JSON.stringify(o.skills || []),
       o.working_on ?? '', o.exploring ?? '', o.reply_count ?? 0, o.avg ?? 0, o.rate ?? 50]);
    return id;
  };
  const mkConn = async (a, b) => {
    const id = uuid();
    await q(`INSERT INTO connections (id, user1, user2, expires_at, active, user1_responded, user2_responded) VALUES ($1,$2,$3,$4,true,true,true)`, [id, a, b, new Date(Date.now() + 86400000).toISOString()]);
    return id;
  };
  // a message the OTHER side sent `minAgo` minutes ago (written straight to the database - it is the sender's reply we test)
  const theirMsg = async (connId, fromId, minAgo) => q(`INSERT INTO messages (id, connection_id, sender_id, text, created_at) VALUES ($1,$2,$3,'hello?',$4)`, [uuid(), connId, fromId, MIN_AGO(minAgo)]);
  const stats = async id => (await q(`SELECT reply_count, avg_reply_minutes, response_rate FROM users WHERE id=$1`, [id])).rows[0];
  // the reply tracking runs AFTER the response, so poll until the stored value reaches what we expect (or give up)
  const until = async (id, pred, ms = 6000) => { const t0 = Date.now(); let s; while (Date.now() - t0 < ms) { s = await stats(id); if (pred(s)) return s; await sleep(100); } return s; };
  const send = (as, connId, text = 'a reply') => call('POST', `/api/messages/${connId}`, as, { text });
  const warm = as => call('GET', '/api/me', as);                                                     // what the web app does on every page load
  const statLookups = () => dbLog.filter(x => x.table === 'users' && x.method === 'GET' && /^reply_count,\s*avg_reply_minutes$/.test((x.select || '').trim())).length;
  const chipLookups = () => dbLog.filter(x => x.table === 'users' && x.method === 'GET' && /^id,\s*working_on,\s*currently_exploring,\s*location,\s*skills,\s*interests,\s*intent$/.test((x.select || '').trim())).length;

  try {
    check('server booted', /Server on port/.test(out) && exited === null, out.slice(-300));

    console.log('\n--- reply statistics: three replies in a row (the audit reproduced 1, 1, 1) ---');
    const partner = await mkU('Partner');
    const sender = await mkU('Sender', { reply_count: 0, avg: 0, rate: 50 });
    const conn = await mkConn(sender, partner);
    let n0 = statLookups();
    await theirMsg(conn, partner, 30);                                                               // the partner wrote 30 minutes ago
    let r = await send(sender, conn);                                                                // FIRST request by this user: cold cache
    let s = await until(sender, x => x.reply_count >= 1);
    check('reply 1 (COLD cache): reply_count 1, avg 30 - correct before and after the fix', r.status === 200 && s.reply_count === 1 && s.avg_reply_minutes === 30, JSON.stringify([r.status, s]));
    check('a COLD request does not look the caller up (req.userData already is the full row)', statLookups() === n0, `lookups=${statLookups() - n0}`);

    await theirMsg(conn, partner, 20);
    r = await send(sender, conn);                                                                    // the cache is warm now (populated by request 1)
    s = await until(sender, x => x.reply_count >= 2);
    check('reply 2 (WARM cache): reply_count 2 and avg 25 (was 1 and 20: rebuilt from zero)', s.reply_count === 2 && s.avg_reply_minutes === 25, JSON.stringify(s));
    check('...that took exactly one lookup of the stored statistics', statLookups() === n0 + 1, `lookups=${statLookups() - n0}`);

    await theirMsg(conn, partner, 10);
    r = await send(sender, conn);
    s = await until(sender, x => x.reply_count >= 3);
    check('reply 3 (WARM cache): reply_count 3 and avg 20 (was 1 and 10)', s.reply_count === 3 && s.avg_reply_minutes === 20, JSON.stringify(s));

    console.log('\n--- a user with a real history is never reset ---');
    const veteran = await mkU('Veteran', { reply_count: 5, avg: 40, rate: 50 });
    const conn2 = await mkConn(veteran, partner);
    await warm(veteran);                                                                             // warm cache, as on any page load
    await theirMsg(conn2, partner, 10);
    r = await send(veteran, conn2);
    s = await until(veteran, x => x.reply_count !== 5);
    check('warm cache, stored 5 replies averaging 40 min, a 10-min reply -> 6 replies averaging 35 (was overwritten with 1 reply / 10 min)', s.reply_count === 6 && s.avg_reply_minutes === 35, JSON.stringify(s));

    console.log('\n--- the statistics come from the CURRENT row, not a stale cache ---');
    const drift = await mkU('Drifter', { reply_count: 2, avg: 10, rate: 50 });
    const conn3 = await mkConn(drift, partner);
    await warm(drift);
    await q(`UPDATE users SET reply_count = 9, avg_reply_minutes = 20 WHERE id = $1`, [drift]);     // changed after the cache was filled
    await theirMsg(conn3, partner, 30);
    await send(drift, conn3);
    s = await until(drift, x => x.reply_count !== 9);
    check('stored 9 replies averaging 20, a 30-min reply -> 10 replies averaging 21', s.reply_count === 10 && s.avg_reply_minutes === 21, JSON.stringify(s));

    console.log('\n--- a message that is not a reply does not touch the statistics, and does not pay for the lookup ---');
    const opener = await mkU('Opener', { reply_count: 4, avg: 12, rate: 50 });
    const conn4 = await mkConn(opener, partner);
    await warm(opener); n0 = statLookups();
    r = await send(opener, conn4, 'first message in this thread');                                  // the partner never wrote: nothing to reply to
    s = await until(opener, x => x.response_rate !== 50);
    check('reply_count and avg_reply_minutes are left as stored (4 / 12); response_rate is still recomputed', r.status === 200 && s.reply_count === 4 && s.avg_reply_minutes === 12 && s.response_rate === 100, JSON.stringify([r.status, s]));
    check('...and no lookup of the statistics was made (nothing to compute)', statLookups() === n0, `lookups=${statLookups() - n0}`);

    console.log('\n--- the endpoint\'s own contract is unchanged ---');
    const msg = r.body || {};
    check('the response is the stored message (id and text)', r.status === 200 && !!msg.id && msg.text === 'first message in this thread', JSON.stringify(msg).slice(0, 200));
    r = await send(opener, uuid());
    check('a connection that does not exist -> 403', r.status === 403, JSON.stringify([r.status, r.body]));
    r = await send(opener, conn4, '   ');
    check('an empty message -> 400', r.status === 400, JSON.stringify([r.status, r.body]));
    r = await call('POST', `/api/messages/${conn4}`, null, { text: 'x' });
    check('no token -> 401', r.status === 401, JSON.stringify(r).slice(0, 100));

    console.log('\n--- ice-breakers: personalised chips must not depend on the state of the auth cache ---');
    const A = await mkU('Viewer A', { location: 'Pune', skills: ['react', 'node'], interests: ['ai'], intent: 'explore-network' });
    const B = await mkU('Other B', { location: 'Pune', skills: ['react'], interests: ['ai'], intent: 'explore-network' });
    const connAB = await mkConn(A, B);
    const detail = as => call('GET', `/api/connections/${connAB}`, as);
    const labels = body => (body?.icebreakers || []).map(c => c.label);
    const personalised = ['📍 Same city', '💼 Shared skills', '💡 Shared interests', '🎯 Shared intent'];
    n0 = chipLookups();
    r = await detail(A);                                                                              // FIRST request: cold
    const coldLabels = labels(r.body);
    check('COLD: four personalised chips - same city, shared skills, shared interests, shared intent', r.status === 200 && JSON.stringify(coldLabels) === JSON.stringify(personalised), JSON.stringify([r.status, coldLabels]));
    check('a COLD request does not look the caller up again', chipLookups() === n0, `lookups=${chipLookups() - n0}`);
    await warm(A);
    r = await detail(A);
    check('WARM: the SAME chips (was the four generic ones)', r.status === 200 && JSON.stringify(labels(r.body)) === JSON.stringify(coldLabels), JSON.stringify([r.status, labels(r.body)]));
    check('...and the chip text really is built from the caller\'s own data (city Pune, skill react, interest ai)', /Pune/.test(JSON.stringify(r.body?.icebreakers)) && /react/i.test(JSON.stringify(r.body?.icebreakers)), JSON.stringify(r.body?.icebreakers).slice(0, 300));
    check('...with exactly one lookup of the caller', chipLookups() === n0 + 1, `lookups=${chipLookups() - n0}`);
    await q(`UPDATE users SET location = 'Delhi' WHERE id = $1`, [A]);
    r = await detail(A);
    check('warm cache + the caller moved city -> the next request already has no "same city" chip (reads the CURRENT row)', r.status === 200 && !labels(r.body).includes('📍 Same city') && labels(r.body).includes('💼 Shared skills'), JSON.stringify(labels(r.body)));

    console.log('\n--- what the endpoint returns is otherwise unchanged ---');
    r = await detail(A);
    const ks = Object.keys(r.body || {}).sort();
    check('same top-level keys as before', JSON.stringify(ks) === JSON.stringify(['active', 'connection', 'hoursLeft', 'icebreakers', 'is_priority', 'lastMessage', 'msgCount', 'unread_count', 'user']), JSON.stringify(ks));
    check('the counterpart is the public view of B (no email, no password); the caller\'s own row is not echoed back', r.body?.user?.id === B && !('email' in (r.body?.user || {})) && !('password' in (r.body?.user || {})) && !JSON.stringify(r.body).includes(`${A}@example.test`), JSON.stringify(r.body?.user || {}).slice(0, 200));
    r = await call('GET', `/api/connections/${connAB}`, await mkU('Stranger'));
    check('someone outside the connection -> 403', r.status === 403, JSON.stringify([r.status, r.body]));
    r = await call('GET', `/api/connections/${connAB}`, null);
    check('no token -> 401', r.status === 401, JSON.stringify(r).slice(0, 100));

    console.log('\n--- source ratchet: no handler reads profile fields off req.userData without the _cached re-fetch ---');
    // Not a proof - a tripwire. auth()'s warm-cache slice carries only id / banned / premium / password_changed_at /
    // deleted_at / role. A2, A15, A16 and A17 were each a handler reading some other field off req.userData; this makes
    // the NEXT one fail here, at review time, instead of in production.
    const srcLines = fs.readFileSync(SERVER_JS, 'utf8').split(/\r?\n/);
    const isCommentLine = t => /^(\/\/|\*|\/\*)/.test(t);
    const codeOf = line => line.trim().replace(/\s\/\/.*$/, '');
    const sliceAccess = /req\.userData\??\.(?:id|banned|premium|password_changed_at|deleted_at|role|_cached)\b/g;   // the cached slice's own fields
    const offenders = [];
    let aliasReads = 0;
    srcLines.forEach((line, i) => {
      const t = line.trim(); if (isCommentLine(t)) return;
      const code = codeOf(line);
      if (!code.replace(sliceAccess, '').includes('req.userData')) return;          // nothing but slice fields
      if (/^req\.userData = /.test(code)) return;                                    // a write (auth() / a guard replacing the slice)
      aliasReads++;
      // the following ten CODE lines must test _cached (i.e. re-fetch the full row)...
      const window = [code, ...srcLines.slice(i + 1, i + 11).filter(l => !isCommentLine(l.trim())).map(codeOf)].join('\n');
      if (/\b_cached\b/.test(window)) return;
      // ...or the site is one of the vetted exceptions below
      if (code === 'const swiper = req.userData;') {                                 // swipe / connect read ONLY swiper.premium (in the slice)
        const fields = new Set(srcLines.filter(l => !isCommentLine(l.trim())).flatMap(l => [...l.matchAll(/\bswiper\.(\w+)/g)].map(m => m[1])));
        if ([...fields].every(f => f === 'premium')) return;
        offenders.push(`${i + 1}: ${code}   (swiper is read for more than .premium: ${[...fields].join(', ')})`); return;
      }
      if (code === 'const me = req.userData;') {                                     // discover: the route puts discoverGuard (fetches the full row) in front
        let j = i; while (j > 0 && !/^app\.(get|post|put|delete|patch)\(/.test(srcLines[j])) j--;
        if (/discoverGuard|activeGuard/.test(srcLines[j])) return;
        offenders.push(`${i + 1}: ${code}   (route without discoverGuard: ${srcLines[j].trim().slice(0, 80)})`); return;
      }
      if (code === ': Promise.resolve({ data: req.userData }),') return;             // the warm/cold branch right after meNeedsFetch (A17)
      if (code === 'const sender = req.userData;') {                                 // reply tracking (A17): the re-fetch sits a few statements further down
        const rest = srcLines.slice(i + 1, i + 41).filter(l => !isCommentLine(l.trim())).map(codeOf).join('\n');
        if (/\bsender\._cached\b/.test(rest)) return;
        offenders.push(`${i + 1}: ${code}   (no sender._cached re-fetch within 40 lines)`); return;
      }
      offenders.push(`${i + 1}: ${code}`);
    });
    check(`every req.userData read of a profile field re-fetches on _cached (or is one of the vetted exceptions) - ${aliasReads} sites examined`, offenders.length === 0, offenders.join(' | '));
    check('the two A17 handlers no longer take profile fields from the cache slice', !/getIcebreakers\(req\.userData/.test(srcLines.join('\n')) && !/const prev\s+=\s+sender\.avg_reply_minutes/.test(srcLines.join('\n')), 'old pattern still present');

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
