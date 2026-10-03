// Regression test: a failed Supabase write must never be reported as a successful mutation.
//
// Four write paths used to ignore the {error} that supabase-js returns instead of throwing:
//
//   POST   /api/me/photos   the upload already happened (multer), then the users UPDATE was ignored
//                           and the route answered 200 with the NEW photo list - the client saw the
//                           photo as saved, the database never got it.
//   DELETE /api/me/photos   same, and worse: it then deleted the stored asset, leaving the database
//                           still pointing at a photo that no longer exists.
//   PUT    /api/me/photos   (reorder) same: 200 with the new order, database unchanged.
//   PUT    /api/me          this one already failed loudly (the discarded error left `updated` null,
//                           so trustSteps(null) threw a TypeError -> generic 500), but for the
//                           wrong reason: the real database error was never logged, only the
//                           misleading TypeError. It is fixed for the same reason - the write result
//                           is now checked where it happens.
//
// Invariant: when the users UPDATE fails, the route answers non-2xx, does NOT return the success
// payload, leaves the stored row untouched, and logs the REAL error. Success behaviour is checked
// first for each route and is unchanged.
//
// How it runs (nothing can touch production): the REAL server.js (or $SERVER_JS) against a
// PostgREST-compatible translator over a REAL PostgreSQL (embedded-postgres, UTF-8); empty cwd (no
// .env), whitelisted env. Failures are injected in the translator (PATCH on `users` only, so every
// read, including auth's own, still works). The upload routes write to public/uploads next to
// server.js (gitignored); this test removes whatever it created.
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
const UPLOADS_DIR = path.join(path.dirname(SERVER_JS), 'public', 'uploads');
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
`;

// ---- PostgREST-compatible translator over the real Postgres (select= lists, and(...) inside or(...)) ----
let pool;
let faultOn = null;
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
      if (faultOn && faultOn(req.method, table, url)) return send(500, { code: 'XX000', message: 'injected fault', details: null, hint: null });
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
  const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-wf-pg-'));
  const pgPort = await freePort();
  const epg = new EmbeddedPostgres({ databaseDir: dbDir, user: 'postgres', password: 'pw', port: pgPort, persistent: false, initdbFlags: ['--encoding=UTF8'], onLog: () => {}, onError: () => {} });
  await epg.initialise(); await epg.start(); await epg.createDatabase('byn');
  pool = new pg.Pool({ host: '127.0.0.1', port: pgPort, user: 'postgres', password: 'pw', database: 'byn', max: 10 });
  const q = (sql, args) => pool.query(sql, args); const one = async (sql, args) => (await q(sql, args)).rows[0];
  await q(DDL);

  const shared = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-wf-shared-'));
  const stub = path.join(shared, 'stub-resend.cjs');
  fs.writeFileSync(stub, `const Module = require('module'); const orig = Module._load;
Module._load = function (request) { if (request === 'resend') { return { Resend: class { constructor() { this.emails = { send: async () => ({ data: { id: 'stub' }, error: null }) }; } } }; } return orig.apply(this, arguments); };`);
  await new Promise(r => translator.listen(0, '127.0.0.1', r)); const dbPort = translator.address().port;
  const port = await freePort(); const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-wf-'));
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, SYSTEMROOT: process.env.SYSTEMROOT, TEMP: os.tmpdir(), TMP: os.tmpdir(), HOME: cwd, USERPROFILE: cwd,
    SUPABASE_URL: `http://127.0.0.1:${dbPort}`, SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key', JWT_SECRET, ADMIN_SECRET: 'test-only-admin-secret', PORT: String(port), RESEND_API_KEY: 'test-only-resend-key' };
  const uploadsBefore = new Set(fs.existsSync(UPLOADS_DIR) ? fs.readdirSync(UPLOADS_DIR) : []);
  let out = ''; const child = spawn(process.execPath, ['-r', stub, SERVER_JS], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  let exited = null; child.on('exit', c => { exited = c; });
  await waitFor(() => /Server on port/.test(out) || exited !== null, 60000, 200);
  const base = `http://127.0.0.1:${port}`;
  const tok = id => jwt.sign({ id, email: `${id}@example.test`, name: 'T' }, JWT_SECRET, { expiresIn: '1h' });
  let ipN = 0;
  const nextIp = () => `10.23.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}`;
  const call = async (method, p, as, body) => { const r = await fetch(base + p, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(as ? { Authorization: `Bearer ${tok(as)}` } : {}), 'X-Forwarded-For': nextIp() }, body: body !== undefined ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch {} return { status: r.status, body: j }; };
  const upload = async as => {
    const form = new FormData();
    form.append('photo', new Blob([Buffer.from('not really a jpeg, the route only checks mimetype and extension')], { type: 'image/jpeg' }), 'test.jpg');
    const r = await fetch(base + '/api/me/photos', { method: 'POST', headers: { Authorization: `Bearer ${tok(as)}`, 'X-Forwarded-For': nextIp() }, body: form });
    let j = null; try { j = await r.json(); } catch {}
    return { status: r.status, body: j };
  };

  const uuid = () => crypto.randomUUID();
  const P1 = 'https://img.test/p1.jpg', P2 = 'https://img.test/p2.jpg';
  const mkUser = async (name, photos = [P1, P2]) => {
    const id = uuid();
    await q(`INSERT INTO users (id,email,name,bio,photos,email_verified,onboarding_stage,banned) VALUES ($1,$2,$3,'Original bio text',$4::jsonb,true,'complete',false)`,
      [id, `${id}@example.test`, name, JSON.stringify(photos)]);
    return id;
  };
  const photosOf = async id => (await one(`SELECT photos FROM users WHERE id=$1`, [id])).photos;
  const failWrites = () => { faultOn = (method, table) => method === 'PATCH' && table === 'users'; };
  const allowWrites = () => { faultOn = null; };
  const isNon2xx = s => typeof s === 'number' && (s < 200 || s >= 300);

  try {
    check('server booted', /Server on port/.test(out) && exited === null, out.slice(-300));

    console.log('\n=== POST /api/me/photos (add) ===');
    let u = await mkUser('Add Photo');
    let r = await upload(u);
    check('success path: 200, the new photo is in the response and in the database', r.status === 200 && Array.isArray(r.body?.photos) && r.body.photos.length === 3 && (await photosOf(u)).length === 3, JSON.stringify(r));
    u = await mkUser('Add Photo Fail');
    failWrites(); r = await upload(u); allowWrites();
    check('failed write: non-2xx', isNon2xx(r.status), JSON.stringify(r));
    check('failed write: the success payload (new photo list / scores) is NOT returned', !r.body?.photos && !r.body?.url, JSON.stringify(r.body));
    check('failed write: the stored photo list is unchanged', JSON.stringify(await photosOf(u)) === JSON.stringify([P1, P2]), JSON.stringify(await photosOf(u)));
    check('failed write: the real error is logged', /Add photo failed:[^\n]*injected fault/.test(out), out.split('\n').filter(l => /Add photo/.test(l)).join(' | ') || '(nothing logged)');

    console.log('\n=== DELETE /api/me/photos ===');
    u = await mkUser('Delete Photo');
    r = await call('DELETE', '/api/me/photos', u, { url: P1 });
    check('success path: 200, photo removed from the response and the database', r.status === 200 && JSON.stringify(r.body?.photos) === JSON.stringify([P2]) && JSON.stringify(await photosOf(u)) === JSON.stringify([P2]), JSON.stringify(r));
    u = await mkUser('Delete Photo Fail');
    failWrites(); r = await call('DELETE', '/api/me/photos', u, { url: P1 }); allowWrites();
    check('failed write: non-2xx', isNon2xx(r.status), JSON.stringify(r));
    check('failed write: the success payload (the shortened photo list) is NOT returned', !r.body?.photos, JSON.stringify(r.body));
    check('failed write: the photo is still in the database', JSON.stringify(await photosOf(u)) === JSON.stringify([P1, P2]), JSON.stringify(await photosOf(u)));
    check('failed write: the real error is logged', /Delete photo failed:[^\n]*injected fault/.test(out), out.split('\n').filter(l => /Delete photo/.test(l)).join(' | ') || '(nothing logged)');

    console.log('\n=== PUT /api/me/photos (reorder) ===');
    u = await mkUser('Reorder Photo');
    r = await call('PUT', '/api/me/photos', u, { photos: [P2, P1] });
    check('success path: 200, new order in the response and the database', r.status === 200 && JSON.stringify(r.body?.photos) === JSON.stringify([P2, P1]) && JSON.stringify(await photosOf(u)) === JSON.stringify([P2, P1]), JSON.stringify(r));
    u = await mkUser('Reorder Photo Fail');
    failWrites(); r = await call('PUT', '/api/me/photos', u, { photos: [P2, P1] }); allowWrites();
    check('failed write: non-2xx', isNon2xx(r.status), JSON.stringify(r));
    check('failed write: the success payload (the new order) is NOT returned', !r.body?.photos, JSON.stringify(r.body));
    check('failed write: the stored order is unchanged', JSON.stringify(await photosOf(u)) === JSON.stringify([P1, P2]), JSON.stringify(await photosOf(u)));
    check('failed write: the real error is logged', /Reorder photos failed:[^\n]*injected fault/.test(out), out.split('\n').filter(l => /Reorder/.test(l)).join(' | ') || '(nothing logged)');

    console.log('\n=== PUT /api/me ===');
    u = await mkUser('Update Me');
    r = await call('PUT', '/api/me', u, { bio: 'A brand new bio' });
    check('success path: 200, the new bio is in the response and the database', r.status === 200 && r.body?.bio === 'A brand new bio' && (await one(`SELECT bio FROM users WHERE id=$1`, [u])).bio === 'A brand new bio', JSON.stringify(r).slice(0, 200));
    u = await mkUser('Update Me Fail');
    failWrites(); r = await call('PUT', '/api/me', u, { bio: 'This must not be reported as saved' }); allowWrites();
    check('failed write: non-2xx', isNon2xx(r.status), JSON.stringify(r));
    check('failed write: the updated profile is NOT returned', !r.body?.bio && !r.body?.trust_steps, JSON.stringify(r.body));
    check('failed write: the stored bio is unchanged', (await one(`SELECT bio FROM users WHERE id=$1`, [u])).bio === 'Original bio text', JSON.stringify(await one(`SELECT bio FROM users WHERE id=$1`, [u])));
    check('failed write: the REAL error is logged (was: a misleading TypeError from trustSteps(null), the database error lost)', /Update me failed:[^\n]*injected fault/.test(out) && !/Update me error: TypeError/.test(out), out.split('\n').filter(l => /Update me|TypeError/.test(l)).join(' | ') || '(nothing logged)');
    check('failed write: the response does not leak the internal error', !/injected fault/.test(JSON.stringify(r.body)), JSON.stringify(r.body));

  } finally {
    const gone = new Promise(res => { if (exited !== null) res(); else child.once('exit', res); }); child.kill(); await Promise.race([gone, sleep(5000)]);
    try { await pool.end(); } catch {}
    await new Promise(r => translator.close(r));
    try { await epg.stop(); } catch {}
    await sleep(500);
    if (fs.existsSync(UPLOADS_DIR)) for (const f of fs.readdirSync(UPLOADS_DIR)) if (!uploadsBefore.has(f)) { try { fs.rmSync(path.join(UPLOADS_DIR, f), { force: true }); } catch { /* test upload only */ } }
    for (const d of [dbDir, shared, cwd]) { try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch { /* temp only */ } }
  }
  console.log(`\n=== RESULTS: ${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
