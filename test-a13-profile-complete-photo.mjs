// Regression test for audit finding A13 - "complete" did not require a photo.
//
//   calcProfileScore() gives 70 without any photo (interests 20 + intent 20 + bio/name/location 10 each),
//   which is exactly PROFILE_COMPLETION_THRESHOLD - and every "is this profile complete?" decision in
//   server.js was a scattered `score >= 70`. So an account could finish onboarding, be flagged
//   is_profile_complete and pass profileGuard (swipe / connect) with NO photo, while Discover - which needs a
//   photo both to browse and to be shown - stayed closed to it.
//
// Decision (product owner): profile completion becomes an explicit invariant, separate from the score:
//
//       isProfileComplete(user) = calcProfileScore(user) >= 70  AND  the user has at least 1 photo
//
// profile_score stays a pure points measure (a photo still just adds points; the score is NOT capped or
// distorted to manufacture the dependency). ONE predicate replaces the eleven scattered `>= 70` checks:
// onboarding completion, profileGuard, syncProfileScore, register / login / GET /api/me / profile-status /
// PUT /api/me, and the photo add / delete / reorder endpoints. (The "finish your profile" push nudge is
// made photo-aware too.)
//
// How it runs (nothing can touch production): the REAL server.js (or $SERVER_JS) against a PostgREST-compatible
// translator over a REAL PostgreSQL (embedded-postgres, UTF-8); empty cwd (no .env), whitelisted env. The real
// photo UPLOAD endpoint writes into the repo's public/uploads, so photos are set directly in the database and
// the delete / reorder endpoints are driven for real; the upload route is covered by a source-level check.
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
ALTER TABLE users ADD COLUMN failed_login_attempts int DEFAULT 0, ADD COLUMN lockout_until timestamptz, ADD COLUMN onboarding_completed_at timestamptz, ADD COLUMN profession text, ADD COLUMN industry text, ADD COLUMN experience_level text;
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
  const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a13-pg-'));
  const pgPort = await freePort();
  const epg = new EmbeddedPostgres({ databaseDir: dbDir, user: 'postgres', password: 'pw', port: pgPort, persistent: false, initdbFlags: ['--encoding=UTF8'], onLog: () => {}, onError: () => {} });
  await epg.initialise(); await epg.start(); await epg.createDatabase('byn');
  pool = new pg.Pool({ host: '127.0.0.1', port: pgPort, user: 'postgres', password: 'pw', database: 'byn', max: 10 });
  const q = (sql, args) => pool.query(sql, args); const one = async (sql, args) => (await q(sql, args)).rows[0];
  await q(DDL);

  const shared = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a13-shared-'));
  const stub = path.join(shared, 'stub-resend.cjs');
  fs.writeFileSync(stub, `const Module = require('module'); const orig = Module._load;
Module._load = function (request) { if (request === 'resend') { return { Resend: class { constructor() { this.emails = { send: async () => ({ data: { id: 'stub' }, error: null }) }; } } }; } return orig.apply(this, arguments); };`);
  await new Promise(r => translator.listen(0, '127.0.0.1', r)); const dbPort = translator.address().port;
  const port = await freePort(); const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a13-'));
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, SYSTEMROOT: process.env.SYSTEMROOT, TEMP: os.tmpdir(), TMP: os.tmpdir(), HOME: cwd, USERPROFILE: cwd,
    SUPABASE_URL: `http://127.0.0.1:${dbPort}`, SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key', JWT_SECRET, ADMIN_SECRET: 'test-only-admin-secret', PORT: String(port), RESEND_API_KEY: 'test-only-resend-key' };
  let out = ''; const child = spawn(process.execPath, ['-r', stub, SERVER_JS], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  let exited = null; child.on('exit', c => { exited = c; });
  await waitFor(() => /Server on port/.test(out) || exited !== null, 60000, 200);
  const base = `http://127.0.0.1:${port}`;
  const tok = id => jwt.sign({ id, email: `${id}@example.test`, name: 'T' }, JWT_SECRET, { expiresIn: '1h' });
  let ipN = 0;
  const call = async (method, p, as, body) => { const r = await fetch(base + p, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(as ? { Authorization: `Bearer ${tok(as)}` } : {}), 'X-Forwarded-For': `10.2.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: body !== undefined ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch {} return { status: r.status, body: j }; };

  const bcrypt = (await import('bcryptjs')).default;
  const uuid = () => crypto.randomUUID();
  const NAME = 'Full Name', BIO = 'A complete biography text';
  const HASH = await bcrypt.hash('correct-horse-9', 4);
  // a verified, onboarded account; by default "everything but a photo" (score 20+20+10+10+10 = exactly 70)
  const mkUser = async (o = {}) => {
    const id = o.id || uuid(); const has = k => k in o;
    await q(`INSERT INTO users (id,email,password,name,bio,location,intent,photos,interests,skills,linkedin,email_verified,onboarding_stage,is_profile_complete,profile_score,password_set,last_active)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,'[]'::jsonb,'',$10,$11,$12,$13,true,now())`,
      [id, `${id}@example.test`, HASH, has('name') ? o.name : NAME, has('bio') ? o.bio : BIO, has('location') ? o.location : 'Pune', has('intent') ? o.intent : 'explore-network',
       JSON.stringify(o.photos || []), JSON.stringify(has('interests') ? o.interests : ['ai', 'design', 'music']),
       has('verified') ? o.verified : true, has('stage') ? o.stage : 'complete', !!o.stored, o.storedScore ?? 0]);
    return id;
  };
  const row = id => one(`SELECT is_profile_complete, profile_score, onboarding_stage, photos, bio, location FROM users WHERE id=$1`, [id]);
  const setPhotos = (id, photos) => q(`UPDATE users SET photos=$2::jsonb WHERE id=$1`, [id, JSON.stringify(photos)]);
  const target = () => mkUser({ photos: ['t1', 't2', 't3', 't4'] });     // a live, active swipe/connect target

  try {
    check('server booted', /Server on port/.test(out) && exited === null, out.slice(-300));

    console.log('\n--- the score stays a POINTS measure: 70 without a photo is still 70, it is just not "complete" ---');
    const a = await mkUser();                                                    // no photo, score 70
    let r = await call('PUT', '/api/me', a, { bio: BIO });
    check('no photo: PUT /api/me reports profile_score 70 (the score is NOT capped or distorted)', r.status === 200 && r.body?.profile_score === 70, JSON.stringify([r.status, r.body?.profile_score]));
    check('...but is_profile_complete is FALSE (score >= 70 is no longer enough)', r.body?.is_profile_complete === false && (await row(a)).is_profile_complete === false, JSON.stringify([r.body?.is_profile_complete, await row(a)]));
    await setPhotos(a, ['https://img.test/a1.jpg']);
    r = await call('PUT', '/api/me', a, { bio: BIO });
    check('add ONE photo -> the photo just adds points (70 -> 80) and the profile is complete', r.status === 200 && r.body?.profile_score === 80 && r.body?.is_profile_complete === true && (await row(a)).is_profile_complete === true, JSON.stringify([r.body?.profile_score, r.body?.is_profile_complete]));

    console.log('\n--- exact boundary, WITH a photo: 70 is complete, 60 is not ---');
    const at70 = await mkUser({ photos: ['https://img.test/b1.jpg'], location: '' });   // 10 + 20 + 20 + 10 + 10 = 70 (no location)
    r = await call('PUT', '/api/me', at70, { bio: BIO });
    check('one photo + score exactly 70 -> complete', r.body?.profile_score === 70 && r.body?.is_profile_complete === true, JSON.stringify([r.body?.profile_score, r.body?.is_profile_complete]));
    const at60 = await mkUser({ photos: ['https://img.test/c1.jpg'], intent: null });   // 10 + 20 + 10 + 10 + 10 = 60 (no intent)
    r = await call('PUT', '/api/me', at60, { bio: BIO });
    check('a photo but score 60 -> NOT complete (the score threshold still applies)', r.body?.profile_score === 60 && r.body?.is_profile_complete === false, JSON.stringify([r.body?.profile_score, r.body?.is_profile_complete]));
    const full = await mkUser({ photos: ['1', '2', '3', '4'] });
    r = await call('PUT', '/api/me', full, { bio: BIO });
    check('four photos + a full profile (score 100) -> complete', r.body?.profile_score === 100 && r.body?.is_profile_complete === true, JSON.stringify([r.body?.profile_score, r.body?.is_profile_complete]));

    console.log('\n--- profileGuard (swipe / connect): the photo is part of "complete" ---');
    const noPhoto = await mkUser();                                              // verified + onboarded, score 70, NO photo
    const t1 = await target();
    let s = await call('POST', '/api/swipe', noPhoto, { targetId: t1, direction: 'right' });
    check('no photo, score 70: swipe -> 403 PROFILE_INCOMPLETE (it used to pass)', s.status === 403 && s.body?.code === 'PROFILE_INCOMPLETE', JSON.stringify(s));
    check('...and it says a PHOTO is what is missing (message + photo_required:true)', /photo/i.test(s.body?.error || '') && s.body?.photo_required === true, JSON.stringify(s.body));
    let c = await call('POST', '/api/connect', noPhoto, { userId: t1 });
    check('no photo, score 70: connect -> 403 PROFILE_INCOMPLETE, nothing written', c.status === 403 && c.body?.code === 'PROFILE_INCOMPLETE' && Number((await one(`SELECT count(*) c FROM swipes WHERE from_user=$1`, [noPhoto])).c) === 0, JSON.stringify(c));
    const lowScore = await mkUser({ photos: ['https://img.test/d1.jpg'], bio: '', location: '' });   // has a photo, score 60 -> incomplete for the OLD reason
    s = await call('POST', '/api/swipe', lowScore, { targetId: t1, direction: 'right' });
    check('a photo but score < 70: still 403 PROFILE_INCOMPLETE with the generic message and photo_required:false', s.status === 403 && s.body?.code === 'PROFILE_INCOMPLETE' && /complete your profile/i.test(s.body?.error || '') && s.body?.photo_required === false, JSON.stringify(s.body));
    await setPhotos(noPhoto, ['https://img.test/e1.jpg']);
    s = await call('POST', '/api/swipe', noPhoto, { targetId: t1, direction: 'right' });
    check('the moment a photo exists the SAME account can swipe (guard reads the current row)', s.status === 200, JSON.stringify(s));
    c = await call('POST', '/api/connect', noPhoto, { userId: await target() });
    check('...and connect', c.status === 200 && c.body?.ok === true, JSON.stringify(c));

    console.log('\n--- onboarding completion: the last step needs a photo ---');
    const ob = await mkUser({ stage: 'profile', bio: '', location: '', interests: [] });   // verified, at the profile step, name + intent set
    const body = { bio: 'Building a fintech startup, exploring new markets.', location: 'Mumbai', interests: ['AI/ML', 'Startups', 'SaaS'] };
    r = await call('POST', '/api/onboarding/profile', ob, body);                             // reaches score 70 with NO photo
    check('everything but a photo (score 70) -> 403 PROFILE_INCOMPLETE, onboarding does NOT complete (it used to)', r.status === 403 && r.body?.code === 'PROFILE_INCOMPLETE', JSON.stringify(r));
    check('...the 403 reports the score truthfully (70/70) and says a photo is required', r.body?.profile_score === 70 && r.body?.required_score === 70 && r.body?.photo_required === true, JSON.stringify([r.body?.profile_score, r.body?.required_score, r.body?.photo_required]));
    const photoItem = (r.body?.checklist || []).find(i => i.key === 'photos');
    check('...and the checklist item for photos is flagged required and reads as a requirement', !!photoItem && photoItem.required === true && /required/i.test(photoItem.label || ''), JSON.stringify(photoItem));
    let st = await row(ob);
    check('DB: stage stays "profile", is_profile_complete false - but what they typed WAS saved', st.onboarding_stage === 'profile' && st.is_profile_complete === false && st.bio.startsWith('Building a fintech') && st.location === 'Mumbai', JSON.stringify(st));
    await setPhotos(ob, ['https://img.test/f1.jpg']);
    r = await call('POST', '/api/onboarding/profile', ob, body);
    st = await row(ob);
    check('with a photo the same submission completes onboarding (200 stage complete, score 80)', r.status === 200 && r.body?.stage === 'complete' && r.body?.profile_score === 80 && st.onboarding_stage === 'complete' && st.is_profile_complete === true, JSON.stringify([r.status, r.body, st]));

    console.log('\n--- photo lifecycle: deleting the LAST photo makes the profile incomplete again ---');
    const lp = await mkUser({ photos: ['https://img.test/g1.jpg'] });
    r = await call('DELETE', '/api/me/photos', lp, { url: 'https://img.test/g1.jpg' });
    check('DELETE the only photo -> 200, photos [], profile_score 70, is_profile_complete FALSE', r.status === 200 && r.body?.photos?.length === 0 && r.body?.profile_score === 70 && r.body?.is_profile_complete === false, JSON.stringify(r.body));
    check('...persisted, and the account is blocked from swipe again', (await row(lp)).is_profile_complete === false && (await call('POST', '/api/swipe', lp, { targetId: await target(), direction: 'right' })).status === 403);
    const two = await mkUser({ photos: ['https://img.test/h1.jpg', 'https://img.test/h2.jpg'] });
    r = await call('DELETE', '/api/me/photos', two, { url: 'https://img.test/h1.jpg' });
    check('deleting ONE of two photos leaves the profile complete', r.status === 200 && r.body?.photos?.length === 1 && r.body?.is_profile_complete === true, JSON.stringify(r.body));
    const ord = await mkUser({ photos: ['https://img.test/i1.jpg', 'https://img.test/i2.jpg'] });
    r = await call('PUT', '/api/me/photos', ord, { photos: ['https://img.test/i2.jpg', 'https://img.test/i1.jpg'] });
    check('reordering photos keeps a photo-holding profile complete', r.status === 200 && r.body?.is_profile_complete === true && r.body?.photos?.[0] === 'https://img.test/i2.jpg', JSON.stringify(r.body));

    console.log('\n--- accounts already flagged complete WITHOUT a photo correct themselves on their next read ---');
    const legacy1 = await mkUser({ stored: true, storedScore: 70 });                 // stored: complete + score 70, but no photo
    r = await call('GET', '/api/me', legacy1);
    check('GET /api/me reports is_profile_complete FALSE for it and fixes the stored flag', r.status === 200 && r.body?.is_profile_complete === false && r.body?.profile_score === 70 && (await row(legacy1)).is_profile_complete === false, JSON.stringify([r.body?.is_profile_complete, await row(legacy1)]));
    const legacy2 = await mkUser({ stored: true, storedScore: 70 });
    const legacyEmail = (await one(`SELECT email FROM users WHERE id=$1`, [legacy2])).email;
    r = await call('POST', '/api/login', null, { email: legacyEmail, password: 'correct-horse-9' });
    check('login recomputes it too (200, stored flag corrected to false)', r.status === 200 && (await row(legacy2)).is_profile_complete === false, JSON.stringify([r.status, await row(legacy2)]));
    const legacy3 = await mkUser({ stored: true, storedScore: 70 });
    r = await call('GET', '/api/profile-status', legacy3);
    check('GET /api/profile-status: is_profile_complete false, and it says a photo is required', r.status === 200 && r.body?.is_profile_complete === false && r.body?.photo_required === true, JSON.stringify(r.body).slice(0, 200));
    const okUser = await mkUser({ stored: true, storedScore: 80, photos: ['https://img.test/j1.jpg'] });
    r = await call('GET', '/api/me', okUser);
    check('an account WITH a photo is untouched: still complete, score 80', r.body?.is_profile_complete === true && r.body?.profile_score === 80, JSON.stringify([r.body?.is_profile_complete, r.body?.profile_score]));

    console.log('\n--- ONE definition: no scattered thresholds are left in the source (server + web copy) ---');
    const src = fs.readFileSync(SERVER_JS, 'utf8');
    const code = src.replace(/(^|[ \t])\/\/[^\n]*/gm, '$1');            // judge CODE, not the comments that explain it
    check('no `score >= 70` / `ps >= 70` completeness decision remains in the code (was eleven)', (code.match(/\b(?:score|ps|profile_score)\s*>=\s*70\b/g) || []).length === 0, `remaining=${(code.match(/\b(?:score|ps|profile_score)\s*>=\s*70\b/g) || []).length}`);
    check('the threshold constant is compared in exactly ONE place (inside isProfileComplete)', (code.match(/>=\s*PROFILE_COMPLETION_THRESHOLD/g) || []).length === 1 && (code.match(/<\s*PROFILE_COMPLETION_THRESHOLD/g) || []).length === 0 && /function isProfileComplete\([^)]*\)\s*\{\s*return[^;]*>=\s*PROFILE_COMPLETION_THRESHOLD/.test(code), `compares=${(code.match(/>=\s*PROFILE_COMPLETION_THRESHOLD/g) || []).length}`);
    check('isProfileComplete is defined once and used at the decision sites (register, login, /me, profile-status, PUT /me, 3 photo endpoints, onboarding, guard, sync)', /function isProfileComplete\(/.test(src) && (src.match(/isProfileComplete\(/g) || []).length >= 11, `uses=${(src.match(/isProfileComplete\(/g) || []).length}`);
    const upload = src.slice(src.indexOf("app.post('/api/me/photos'"), src.indexOf("app.delete('/api/me/photos'"));
    check('POST /api/me/photos (the real upload route, not driven here) decides completeness with the shared predicate', /isProfileComplete\(merged\)/.test(upload), upload.slice(0, 80));
    const nudge = src.slice(src.indexOf('async function sendProfileNudges'), src.indexOf('// ── PUBLIC STATS'));
    check('the "finish your profile" push nudge is photo-aware (it no longer says "0 points away" to someone whose only gap is a photo)', /photos/.test(nudge) && /photo/i.test(nudge.replace(/photos/g, '')), nudge.slice(0, 120));
    const webPath = path.join(here, 'frontend/components/onboarding/ProfileCompletion.tsx');
    if (fs.existsSync(webPath)) {
      const web = fs.readFileSync(webPath, 'utf8');
      check('web onboarding no longer tells users they can continue without a photo', !/continue without a photo/i.test(web), '');
      check('...and states the requirement explicitly', /photo[^\n]{0,40}required|required[^\n]{0,40}photo/i.test(web), '');
    } else check('(frontend not present in this checkout - web copy check skipped)', true);
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
