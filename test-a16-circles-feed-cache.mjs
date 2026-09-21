// Regression test for audit finding A16 - GET /api/circles/feed read the caller's profile from the auth cache slice.
//
//   The route took `const me = req.userData` and used me.lat / me.lng / me.location (the "near-me" filter) and, in
//   the default "for-you" mode, circleRelevanceScore(me, post), which needs me.skills / me.interests / me.lat /
//   me.lng / me.location. On a COLD cache auth() puts the full users row there; on a WARM cache hit (the web app
//   warms it with GET /api/me on every page load, for 30s) req.userData is the narrow cached slice - id, banned,
//   premium, password_changed_at, deleted_at, role - which carries NONE of those. So the same user got:
//     * near-me: the right nearby posts when cold, but { posts: [], noLocation: true } when warm - "you have no
//       location" - for a user who has one;
//     * for-you: a personalised ranking when cold (shared skills, interests, "looking for", proximity), and a
//       ranking with all of that silently dropped when warm.
//   (Same defect class as A2 / A15: a handler trusting req.userData for fields the cache does not hold.)
//
// Invariant enforced here: the feed a user gets depends only on their data, never on whether their auth cache is
// warm, and reflects the CURRENT row. modes that never read the caller (mode=all, group feeds) are unchanged and
// do not pay for an extra lookup.
//
// How it runs (nothing can touch production): the REAL server.js (or $SERVER_JS) against a PostgREST-compatible
// translator over a REAL PostgreSQL (embedded-postgres, UTF-8) - extended here with the embedded
// `author:users!fk(...)` join and `offset` this route uses; empty cwd (no .env), whitelisted env.
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
CREATE TABLE circle_posts (id text PRIMARY KEY, user_id text NOT NULL, text text, tags jsonb DEFAULT '[]', structured_meta jsonb DEFAULT '{}', links jsonb DEFAULT '[]', created_at timestamptz DEFAULT now(), group_id text);
CREATE TABLE circle_groups (id text PRIMARY KEY, privacy text DEFAULT 'public');
CREATE TABLE circle_group_members (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, group_id text, user_id text, role text);
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
  const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a16-pg-'));
  const pgPort = await freePort();
  const epg = new EmbeddedPostgres({ databaseDir: dbDir, user: 'postgres', password: 'pw', port: pgPort, persistent: false, initdbFlags: ['--encoding=UTF8'], onLog: () => {}, onError: () => {} });
  await epg.initialise(); await epg.start(); await epg.createDatabase('byn');
  pool = new pg.Pool({ host: '127.0.0.1', port: pgPort, user: 'postgres', password: 'pw', database: 'byn', max: 10 });
  const q = (sql, args) => pool.query(sql, args); const one = async (sql, args) => (await q(sql, args)).rows[0];
  await q(DDL);

  const shared = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a16-shared-'));
  const stub = path.join(shared, 'stub-resend.cjs');
  fs.writeFileSync(stub, `const Module = require('module'); const orig = Module._load;
Module._load = function (request) { if (request === 'resend') { return { Resend: class { constructor() { this.emails = { send: async () => ({ data: { id: 'stub' }, error: null }) }; } } }; } return orig.apply(this, arguments); };`);
  await new Promise(r => translator.listen(0, '127.0.0.1', r)); const dbPort = translator.address().port;
  const port = await freePort(); const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a16-'));
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, SYSTEMROOT: process.env.SYSTEMROOT, TEMP: os.tmpdir(), TMP: os.tmpdir(), HOME: cwd, USERPROFILE: cwd,
    SUPABASE_URL: `http://127.0.0.1:${dbPort}`, SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key', JWT_SECRET, ADMIN_SECRET: 'test-only-admin-secret', PORT: String(port), RESEND_API_KEY: 'test-only-resend-key' };
  let out = ''; const child = spawn(process.execPath, ['-r', stub, SERVER_JS], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  let exited = null; child.on('exit', c => { exited = c; });
  await waitFor(() => /Server on port/.test(out) || exited !== null, 60000, 200);
  const base = `http://127.0.0.1:${port}`;
  const tok = id => jwt.sign({ id, email: `${id}@example.test`, name: 'T' }, JWT_SECRET, { expiresIn: '1h' });
  let ipN = 0;
  const call = async (method, p, as, body) => { const r = await fetch(base + p, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(as ? { Authorization: `Bearer ${tok(as)}` } : {}), 'X-Forwarded-For': `10.9.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: body !== undefined ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch {} return { status: r.status, body: j }; };

  const uuid = () => crypto.randomUUID();
  const HOURS = h => new Date(Date.now() - h * 3600000).toISOString();
  const PUNE = { lat: 18.52, lng: 73.86 };
  // a user row; `o` sets location / coordinates / skills / interests / trust
  const mkU = async (name, o = {}) => {
    const id = o.id || uuid(); const has = k => k in o;
    await q(`INSERT INTO users (id,email,name,bio,headline,location,lat,lng,intent,photos,interests,skills,linkedin,trust_score,email_verified,onboarding_stage,banned,last_active)
             VALUES ($1,$2,$3,'A complete biography text','',$4,$5,$6,'explore-network','["1","2","3","4"]'::jsonb,$7::jsonb,$8::jsonb,'https://linkedin.com/in/x',$9,true,'complete',false,now())`,
      [id, `${id}@example.test`, name, has('location') ? o.location : '', o.lat ?? null, o.lng ?? null, JSON.stringify(o.interests || []), JSON.stringify(o.skills || []), o.trust ?? 10]);
    return id;
  };
  const mkPost = async (userId, text, o = {}) => {
    const id = uuid();
    await q(`INSERT INTO circle_posts (id, user_id, text, tags, structured_meta, links, created_at, group_id) VALUES ($1,$2,$3,'[]'::jsonb,$4::jsonb,'[]'::jsonb,$5,$6)`,
      [id, userId, text, JSON.stringify(o.meta || {}), HOURS(o.hoursAgo ?? 1), o.group || null]);
    return id;
  };
  const texts = body => (body?.posts || []).map(p => p.text);
  const sameSet = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  const feed = (as, qs = '') => call('GET', `/api/circles/feed${qs}`, as);

  try {
    check('server booted', /Server on port/.test(out) && exited === null, out.slice(-300));

    // ---- authors and their posts ----
    const aNear   = await mkU('Author Near',   { location: 'Pune',   lat: 18.53, lng: 73.85, trust: 10, skills: ['react'], interests: ['ai'] });   // ~1.5 km from Pune
    const aCity   = await mkU('Author City',   { location: 'PUNE' });                                                                               // same city string, NO coordinates
    const aMumbai = await mkU('Author Mumbai', { location: 'Mumbai', lat: 19.07, lng: 72.87 });                                                     // ~120 km
    const aDelhi  = await mkU('Author Delhi',  { location: 'Delhi',  lat: 28.61, lng: 77.20, trust: 60 });                                          // far, but a high-trust author
    await mkPost(aNear,   'POST-NEAR',   { hoursAgo: 5, meta: { looking_for: 'react developer' } });    // relevant to a react/ai viewer in Pune
    await mkPost(aCity,   'POST-CITY',   { hoursAgo: 3 });
    await mkPost(aMumbai, 'POST-MUMBAI', { hoursAgo: 4 });
    await mkPost(aDelhi,  'POST-DELHI',  { hoursAgo: 1 });                                               // newer + higher-trust author, but irrelevant to the viewer

    // ---- viewers: identical data on every request, only the state of THEIR auth cache differs ----
    const withCoords = await mkU('Viewer With Coords', { location: 'Pune', ...PUNE, skills: ['react'], interests: ['ai'] });
    const cityOnly   = await mkU('Viewer City Only',   { location: 'Pune', skills: ['react'], interests: ['ai'] });
    const nothing    = await mkU('Viewer Nothing');
    const warm = as => call('GET', '/api/me', as);                                                     // what the web app does on every page load

    console.log('\n--- near-me, a viewer with coordinates: cold, then warm ---');
    let r = await feed(withCoords, '?mode=near-me');                                                   // FIRST request: cold cache
    check('COLD: the posts within 150 km (Near ~1.5 km, Mumbai ~120 km); not Delhi, and not the author with no coordinates', r.status === 200 && sameSet(texts(r.body), ['POST-NEAR', 'POST-MUMBAI']) && !r.body?.noLocation, JSON.stringify([r.status, texts(r.body), r.body?.noLocation]));
    await warm(withCoords);
    r = await feed(withCoords, '?mode=near-me');
    check('WARM: the SAME posts (was { posts: [], noLocation: true } for a user who HAS a location)', r.status === 200 && sameSet(texts(r.body), ['POST-NEAR', 'POST-MUMBAI']) && !r.body?.noLocation, JSON.stringify([r.status, texts(r.body), r.body?.noLocation]));

    console.log('\n--- near-me, a viewer with a city but no coordinates: matched on the city string, cold and warm ---');
    r = await feed(cityOnly, '?mode=near-me');
    check('COLD: the posts whose author is in the same city (case-insensitive: "Pune" and "PUNE")', r.status === 200 && sameSet(texts(r.body), ['POST-NEAR', 'POST-CITY']), JSON.stringify([texts(r.body), r.body?.noLocation]));
    await warm(cityOnly);
    r = await feed(cityOnly, '?mode=near-me');
    check('WARM: the same two posts (was noLocation:true)', r.status === 200 && sameSet(texts(r.body), ['POST-NEAR', 'POST-CITY']) && !r.body?.noLocation, JSON.stringify([texts(r.body), r.body?.noLocation]));

    console.log('\n--- near-me, a viewer with NO location: noLocation, cold and warm alike (correct, unchanged) ---');
    r = await feed(nothing, '?mode=near-me');
    check('COLD: { posts: [], hasMore: false, noLocation: true }', r.status === 200 && r.body?.noLocation === true && (r.body?.posts || []).length === 0 && r.body?.hasMore === false, JSON.stringify(r.body));
    await warm(nothing);
    r = await feed(nothing, '?mode=near-me');
    check('WARM: the same', r.status === 200 && r.body?.noLocation === true && (r.body?.posts || []).length === 0, JSON.stringify(r.body));

    console.log('\n--- for-you ranking: personalisation must not disappear when the cache is warm ---');
    const viewerRank = await mkU('Viewer Ranking', { location: 'Pune', ...PUNE, skills: ['react'], interests: ['ai'] });
    r = await feed(viewerRank);                                                                        // default mode = for-you; cold
    const coldOrder = texts(r.body);
    check('COLD: the personalised order - the relevant nearby post (shared skill + interest + "looking for react" + ~1.5 km) is FIRST, ahead of the newer high-trust Delhi post', r.status === 200 && coldOrder[0] === 'POST-NEAR' && coldOrder.length === 4, JSON.stringify(coldOrder));
    await warm(viewerRank);
    r = await feed(viewerRank);
    check('WARM: the SAME order (was: all personalisation dropped, so the newer / higher-trust post ranked first)', JSON.stringify(texts(r.body)) === JSON.stringify(coldOrder), JSON.stringify(texts(r.body)));
    r = await feed(viewerRank);
    check('...and on the next warm request', JSON.stringify(texts(r.body)) === JSON.stringify(coldOrder), JSON.stringify(texts(r.body)));

    console.log('\n--- the feed reflects the CURRENT row, not a stale cache ---');
    await warm(withCoords);
    await q(`UPDATE users SET location='Delhi', lat=28.61, lng=77.20 WHERE id=$1`, [withCoords]);
    r = await feed(withCoords, '?mode=near-me');
    check('warm cache + the viewer moved to Delhi -> the very next near-me request already shows the Delhi post (and no longer the Pune ones)', r.status === 200 && sameSet(texts(r.body), ['POST-DELHI']), JSON.stringify(texts(r.body)));
    await q(`UPDATE users SET location='Pune', lat=18.52, lng=73.86 WHERE id=$1`, [withCoords]);
    r = await feed(withCoords, '?mode=near-me');
    check('...and back again', r.status === 200 && sameSet(texts(r.body), ['POST-NEAR', 'POST-MUMBAI']), JSON.stringify(texts(r.body)));

    console.log('\n--- modes that never read the caller are unchanged (and do not need the row) ---');
    const viewerAll = await mkU('Viewer All', { location: 'Pune', ...PUNE, skills: ['react'], interests: ['ai'] });
    r = await feed(viewerAll, '?mode=all');
    const allCold = texts(r.body);
    await warm(viewerAll);
    r = await feed(viewerAll, '?mode=all');
    check('mode=all: identical cold and warm (it never depended on the caller) - all four posts', allCold.length === 4 && JSON.stringify(texts(r.body)) === JSON.stringify(allCold), JSON.stringify([allCold, texts(r.body)]));

    console.log('\n--- WHICH requests look the caller up: only the modes that read the caller, and never on a cold request ---');
    const meLookups = () => dbLog.filter(x => x.table === 'users' && x.method === 'GET' && /^id,\s*skills,\s*interests,\s*lat,\s*lng,\s*location$/.test((x.select || '').trim())).length;
    const probe = await mkU('Viewer Probe', { location: 'Pune', ...PUNE, skills: ['react'], interests: ['ai'] });
    let n0 = meLookups();
    await feed(probe, '?mode=near-me');                                                                // FIRST request: cold - req.userData is already the full row
    check('a COLD request does not look the caller up again (req.userData is already the full row)', meLookups() === n0, `lookups=${meLookups() - n0}`);
    await warm(probe); n0 = meLookups();
    await feed(probe, '?mode=all');
    check('WARM mode=all: NO lookup (it never reads the caller)', meLookups() === n0, `lookups=${meLookups() - n0}`);
    await feed(probe, '?mode=near-me');
    check('WARM mode=near-me: exactly one lookup', meLookups() === n0 + 1, `lookups=${meLookups() - n0}`);
    await feed(probe);
    check('WARM for-you (the default): exactly one more lookup', meLookups() === n0 + 2, `lookups=${meLookups() - n0}`);

    console.log('\n--- group feeds: chronological, never ranked - so they never read the caller (unless near-me is asked for explicitly) ---');
    const gid = uuid();
    await q(`INSERT INTO circle_groups (id, privacy) VALUES ($1,'public')`, [gid]);
    await mkPost(aNear, 'GROUP-OLD', { hoursAgo: 9, group: gid });
    await mkPost(aDelhi, 'GROUP-NEW', { hoursAgo: 2, group: gid });
    await warm(probe); n0 = meLookups();
    r = await feed(probe, `?group_id=${gid}`);
    check('WARM group feed (default mode): NO lookup, and chronological (newest first), not personalised', meLookups() === n0 && r.status === 200 && JSON.stringify(texts(r.body)) === JSON.stringify(['GROUP-NEW', 'GROUP-OLD']), JSON.stringify([meLookups() - n0, r.status, texts(r.body)]));
    r = await feed(probe, `?group_id=${gid}&mode=all`);
    check('WARM group feed with mode=all: NO lookup', meLookups() === n0 && r.status === 200 && texts(r.body).length === 2, JSON.stringify([meLookups() - n0, r.status, texts(r.body)]));
    r = await feed(probe, `?group_id=${gid}&mode=near-me`);
    check('WARM group feed with an explicit mode=near-me: exactly one lookup (the near-me filter reads the caller) - only the Pune author\'s post', meLookups() === n0 + 1 && r.status === 200 && sameSet(texts(r.body), ['GROUP-OLD']), JSON.stringify([meLookups() - n0, r.status, texts(r.body)]));

    console.log('\n--- unchanged behaviour ---');
    r = await feed(withCoords, '?mode=near-me');
    const p0 = (r.body?.posts || [])[0] || {};
    check('the response shape is unchanged: posts carry like_count / liked_by_me, and the author is stripped of lat, lng, location, skills, interests and last_active', 'like_count' in p0 && 'liked_by_me' in p0 && !!p0.author && !['lat', 'lng', 'location', 'skills', 'interests', 'last_active'].some(k => k in p0.author) && 'name' in p0.author && 'hasMore' in (r.body || {}), JSON.stringify(Object.keys(p0.author || {})));
    r = await feed(withCoords, '?mode=all&limit=2');
    check('limit / hasMore still work (limit=2 of 4 -> 2 posts, hasMore true)', r.status === 200 && (r.body?.posts || []).length === 2 && r.body?.hasMore === true, JSON.stringify([(r.body?.posts || []).length, r.body?.hasMore]));
    r = await call('GET', '/api/circles/feed?mode=near-me', null);
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
