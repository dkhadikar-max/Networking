// Regression test for audit finding A19a - GET /api/discover ignores the `limit` and `offset` query
// parameters the frontend sends.
//
//   frontend/components/discover/DiscoverFeed.tsx always calls `/api/discover?limit=10&offset=N`, paging
//   forward as the viewer swipes through cards (`buildUrl`, `load`). frontend/app/onboarding/page.tsx calls
//   `/api/discover?limit=3` to preview a few matches right after onboarding. The handler destructured
//   `skill, intent, location, remote, interest, sort, radius, worldwide` from req.query but never `limit` or
//   `offset` - it always returned the full ranked list truncated only to `remaining` (the viewer's daily
//   swipe budget: 30 free / 200 premium), from position 0, on every call. So:
//     * a plain first load could return up to 30 (or 200) full profile objects in one response instead of
//       the 10 requested - a large, silent over-fetch of exactly the payload the endpoint already computes
//       (works, matchReasons, insight) for every candidate;
//     * "load more" (offset=10, 20, ...) returned the SAME top-ranked window every time - not the next page -
//       so real pagination only ever happened as a side effect of previously swiped candidates being excluded
//       from the next call, never because of the requested offset;
//     * onboarding's `limit=3` preview silently received up to 30 profiles (it happens to still work because
//       the client itself slices to 3, but the endpoint was not honouring its own contract).
//   Two callers intentionally send NEITHER parameter and must be unaffected: the NetworkApp and NetworkMobile
//   apps call `/api/discover` with no query string at all and page purely client-side over one response
//   (see NetworkApp/src/screens/DiscoverScreen.js, NetworkMobile/src/screens/DiscoverScreen.js) - for them,
//   "return everything up to the daily remaining, in one call" is the intended contract, not a bug.
//
// Invariant enforced here: `limit` and `offset`, when given, select a window of the SAME ranked candidate
// list the unparameterised call would have produced (same order, no gaps, no duplicates across consecutive
// pages), still bounded by the viewer's daily remaining; when neither is given, behaviour is byte-for-byte
// what it was before this fix (every profile up to remaining, from position 0) - the mobile apps' contract.
//
// NOT covered here (found during this investigation, explicitly out of scope for this fix - the underlying
// candidate query is itself hard-capped at .limit(200) rows ordered by last_active, with no offset ever
// applied to it; a candidate ranked outside that window is unreachable regardless of what limit/offset the
// caller sends. Raising or removing that cap is a separate, larger change and is not made here.)
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
CREATE TABLE user_reviews (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, reviewer_id text NOT NULL, reviewed_id text NOT NULL, rating int NOT NULL, tags jsonb DEFAULT '[]', created_at timestamptz DEFAULT now());
CREATE TABLE works (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, user_id text NOT NULL, title text NOT NULL, description text DEFAULT '', url text DEFAULT '', image text DEFAULT '', created_at timestamptz DEFAULT now());
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
  const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a19a-pg-'));
  const pgPort = await freePort();
  const epg = new EmbeddedPostgres({ databaseDir: dbDir, user: 'postgres', password: 'pw', port: pgPort, persistent: false, initdbFlags: ['--encoding=UTF8'], onLog: () => {}, onError: () => {} });
  await epg.initialise(); await epg.start(); await epg.createDatabase('byn');
  pool = new pg.Pool({ host: '127.0.0.1', port: pgPort, user: 'postgres', password: 'pw', database: 'byn', max: 10 });
  const q = (sql, args) => pool.query(sql, args); const one = async (sql, args) => (await q(sql, args)).rows[0];
  await q(DDL);

  const shared = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a19a-shared-'));
  const stub = path.join(shared, 'stub-resend.cjs');
  fs.writeFileSync(stub, `const Module = require('module'); const orig = Module._load;
Module._load = function (request) { if (request === 'resend') { return { Resend: class { constructor() { this.emails = { send: async () => ({ data: { id: 'stub' }, error: null }) }; } } }; } return orig.apply(this, arguments); };`);
  await new Promise(r => translator.listen(0, '127.0.0.1', r)); const dbPort = translator.address().port;
  const port = await freePort(); const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a19a-'));
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, SYSTEMROOT: process.env.SYSTEMROOT, TEMP: os.tmpdir(), TMP: os.tmpdir(), HOME: cwd, USERPROFILE: cwd,
    SUPABASE_URL: `http://127.0.0.1:${dbPort}`, SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key', JWT_SECRET, ADMIN_SECRET: 'test-only-admin-secret', PORT: String(port), RESEND_API_KEY: 'test-only-resend-key' };
  let out = ''; const child = spawn(process.execPath, ['-r', stub, SERVER_JS], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  let exited = null; child.on('exit', c => { exited = c; });
  await waitFor(() => /Server on port/.test(out) || exited !== null, 60000, 200);
  const base = `http://127.0.0.1:${port}`;
  const tok = id => jwt.sign({ id, email: `${id}@example.test`, name: 'T' }, JWT_SECRET, { expiresIn: '1h' });
  let ipN = 0;
  const call = async (method, p, as, body) => { const r = await fetch(base + p, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(as ? { Authorization: `Bearer ${tok(as)}` } : {}), 'X-Forwarded-For': `10.14.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: body !== undefined ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch {} return { status: r.status, body: j }; };

  const uuid = () => crypto.randomUUID();
  const MIN_AGO = m => new Date(Date.now() - m * 60000).toISOString();
  // The viewer: intentionally NO skills / interests / intent / location / lat / lng, so matchScore(me, *)
  // never varies by candidate on any of those axes - only the recency-based "active" boost (+8) does, and
  // every candidate below is set active, so every candidate ties at the SAME matchScore. A stable sort over
  // a tie preserves the array's incoming order (Node's Array#sort is a stable sort), which is exactly the
  // DB query's `order('last_active', desc)` - so the ranked list is fully deterministic: most-recent first.
  const mkViewer = async name => {
    const id = uuid();
    await q(`INSERT INTO users (id,email,name,bio,headline,location,photos,interests,skills,linkedin,trust_score,email_verified,onboarding_stage,banned,last_active)
             VALUES ($1,$2,$3,'A complete biography text','','','["1","2","3","4"]'::jsonb,'[]'::jsonb,'[]'::jsonb,'https://linkedin.com/in/x',10,true,'complete',false,now())`,
      [id, `${id}@example.test`, name]);
    return id;
  };
  // `rank` 1 = most recent (returned first); candidates never overlap the viewer on skills/interests/intent
  // (it does not matter what they have - the viewer has none), and all sit inside the 24h "active" window,
  // `rank` minutes apart, so the DB order and the final ranked order coincide (see mkViewer above).
  const mkCandidate = async (name, rank) => {
    const id = uuid();
    await q(`INSERT INTO users (id,email,name,bio,headline,location,photos,interests,skills,linkedin,trust_score,email_verified,onboarding_stage,banned,last_active)
             VALUES ($1,$2,$3,'A complete biography text','','Pune','["1"]'::jsonb,'["ai"]'::jsonb,'["react"]'::jsonb,'https://linkedin.com/in/x',10,true,'complete',false,$4)`,
      [id, `${id}@example.test`, name, MIN_AGO(rank)]);
    return id;
  };
  const swipe = (from, to, dir = 'left') => q(`INSERT INTO swipes (from_user, to_user, direction) VALUES ($1,$2,$3)`, [from, to, dir]);
  const discover = (as, qs = '') => call('GET', `/api/discover${qs}`, as);
  const ids = body => (body?.profiles || []).map(p => p.id);

  try {
    check('server booted', /Server on port/.test(out) && exited === null, out.slice(-300));

    // ---- 15 candidates, ranked 1 (most recent) .. 15 (least recent) ----
    const viewer = await mkViewer('Viewer');
    const cand = [];
    for (let i = 1; i <= 15; i++) cand.push(await mkCandidate(`Candidate ${i}`, i));

    console.log('\n--- callers that send NEITHER limit NOR offset are unaffected (NetworkApp / NetworkMobile / test.js contract) ---');
    let r = await discover(viewer);
    check('no limit/offset: every one of the 15 candidates, ranked most-recent-first, unpaginated - unchanged from before this fix', r.status === 200 && JSON.stringify(ids(r.body)) === JSON.stringify(cand), JSON.stringify([ids(r.body).length, ids(r.body).slice(0, 3)]));
    check('remaining / daily_limit are still reported', typeof r.body?.remaining === 'number' && typeof r.body?.daily_limit === 'number', JSON.stringify([r.body?.remaining, r.body?.daily_limit]));

    console.log('\n--- limit alone: the first N of the ranked list, not the full 15 (the bug: this used to ignore limit entirely) ---');
    r = await discover(viewer, '?limit=5');
    check('limit=5: exactly the first 5 ranked candidates (was: all 15)', r.status === 200 && JSON.stringify(ids(r.body)) === JSON.stringify(cand.slice(0, 5)), JSON.stringify(ids(r.body)));
    r = await discover(viewer, '?limit=3');
    check('limit=3 (onboarding\'s own call shape): exactly 3 (was: all 15)', r.status === 200 && ids(r.body).length === 3 && JSON.stringify(ids(r.body)) === JSON.stringify(cand.slice(0, 3)), JSON.stringify(ids(r.body)));

    console.log('\n--- limit + offset: consecutive pages tile the SAME ranked list with no gaps, no overlap, no reshuffling (the bug: offset was a total no-op - every page was page 1) ---');
    const page1 = await discover(viewer, '?limit=5&offset=0');
    const page2 = await discover(viewer, '?limit=5&offset=5');
    const page3 = await discover(viewer, '?limit=5&offset=10');
    const page4 = await discover(viewer, '?limit=5&offset=15');
    check('page 1 (offset=0): ranks 1-5', JSON.stringify(ids(page1.body)) === JSON.stringify(cand.slice(0, 5)), JSON.stringify(ids(page1.body)));
    check('page 2 (offset=5): ranks 6-10 - a DIFFERENT window, not the same one again', JSON.stringify(ids(page2.body)) === JSON.stringify(cand.slice(5, 10)), JSON.stringify(ids(page2.body)));
    check('page 3 (offset=10): ranks 11-15, the last real page', JSON.stringify(ids(page3.body)) === JSON.stringify(cand.slice(10, 15)), JSON.stringify(ids(page3.body)));
    check('page 4 (offset=15): nothing left - empty, not an error, not the list again', page4.status === 200 && ids(page4.body).length === 0, JSON.stringify([page4.status, ids(page4.body)]));
    const union = [...page1.body.profiles, ...page2.body.profiles, ...page3.body.profiles].map(p => p.id);
    check('the three pages together are exactly the 15 candidates, each exactly once (no duplicates, none skipped)', JSON.stringify(union) === JSON.stringify(cand), JSON.stringify(union));

    console.log('\n--- offset alone (no limit): everything from that position to the end ---');
    r = await discover(viewer, '?offset=12');
    check('offset=12, no limit: ranks 13-15 (the tail), not empty and not the full list', JSON.stringify(ids(r.body)) === JSON.stringify(cand.slice(12)), JSON.stringify(ids(r.body)));

    console.log('\n--- malformed / edge-case values degrade sanely, never 500 (still the full 15-candidate pool at this point) ---');
    r = await discover(viewer, '?limit=0');
    check('limit=0 -> treated as "use the default", not "return nothing" (matches the repo\'s existing limit-parsing convention elsewhere, e.g. circles feed)', r.status === 200 && ids(r.body).length > 0, JSON.stringify([r.status, ids(r.body).length]));
    r = await discover(viewer, '?limit=abc&offset=xyz');
    check('non-numeric limit/offset -> 200 with a sane default, not a crash', r.status === 200 && ids(r.body).length > 0, JSON.stringify(r.status));
    r = await discover(viewer, '?offset=-5');
    check('a negative offset is clamped to 0, not treated as "before the start" - the full 15 again', JSON.stringify(ids(r.body)) === JSON.stringify(cand), JSON.stringify(ids(r.body)));
    r = await discover(viewer, '?limit=99999');
    check('an oversized limit does not crash and stays bounded by the real candidate pool', r.status === 200 && ids(r.body).length === 15, JSON.stringify(ids(r.body).length));

    console.log('\n--- pagination stays inside the daily-remaining cap ---');
    for (let i = 0; i < 12; i++) await swipe(viewer, cand[i]);                                        // 12 of this free user's 30 swipes used
    r = await discover(viewer, '?limit=10&offset=0');
    const notSwiped = cand.slice(12);                                                                  // the 3 unswiped candidates remain eligible
    check('after 12 swipes: only the 3 still-eligible (unswiped) candidates come back, still ranked - not the swiped ones', JSON.stringify(ids(r.body)) === JSON.stringify(notSwiped), JSON.stringify([ids(r.body), r.body?.remaining]));
    check('remaining reflects the 12 swipes used (30 - 12 = 18)', r.body?.remaining === 18, JSON.stringify(r.body?.remaining));

    console.log('\n--- filters, sort and the daily-limit short-circuit are unaffected by paginating ---');
    r = await discover(viewer, '?skill=react&limit=2&offset=1');
    check('a skill filter narrows the pool FIRST, then limit/offset windows the filtered+ranked result (all candidates have "react", so this is just pagination over the same 3 eligible)', r.status === 200 && JSON.stringify(ids(r.body)) === JSON.stringify(notSwiped.slice(1, 3)), JSON.stringify(ids(r.body)));
    const maxedOut = await mkViewer('Maxed Out');
    for (let i = 0; i < 30; i++) { const c = await mkCandidate(`Filler ${i}`, 100 + i); await swipe(maxedOut, c); }
    r = await discover(maxedOut, '?limit=5&offset=0');
    check('daily limit already reached: { limited: true, profiles: [] } regardless of limit/offset (short-circuits before either is read)', r.status === 200 && r.body?.limited === true && ids(r.body).length === 0, JSON.stringify(r.body));

    console.log('\n--- the endpoint\'s own contract is otherwise unchanged ---');
    r = await discover(viewer, '?limit=1');
    const p0 = (r.body?.profiles || [])[0] || {};
    check('a profile still carries matchScore, insight, matchReasons, works, distance - the same shape as before', 'matchScore' in p0 && 'insight' in p0 && Array.isArray(p0.matchReasons) && Array.isArray(p0.works) && 'distance' in p0, Object.keys(p0).join(','));
    r = await call('GET', '/api/discover', null);
    check('no token -> 401', r.status === 401, JSON.stringify(r).slice(0, 100));

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
