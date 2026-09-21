// Regression test for audit finding A8 - cleanPublic() leaked account internals of OTHER users.
//
//   cleanPublic() was a DENY-list ("copy the whole row, delete a few known-sensitive keys") that
//   never got the hardening clean() received. Four endpoints load `select('*')` for another user
//   and passed it through it:
//       GET /api/profiles/:id   GET /api/search   GET /api/liked-me   GET /api/connections/:id
//   so ANY logged-in user could read, for any other user: magic_link_token_hash (and the rest of
//   the magic-link/OTP rate-limit state), password_changed_at, premium_expires_at / premium_plan /
//   premium_since, referred_by, email_verified, onboarding_stage, password_set, consent_*,
//   deleted_at, do_not_sell, email_suppressed*, deletion_scheduled_at ... and, being a deny-list,
//   every column added to `users` in the future.
//
// Invariant enforced here: another user's object contains ONLY an explicit allow-list of public
// profile fields (+ the computed premium / is_recently_active / is_online) - on every endpoint that
// returns one - and nothing else, INCLUDING a column that does not exist yet. The public profile
// content the clients render is still there. The signed-in user's OWN object (GET /api/me,
// clean()) is unchanged: it still carries email_verified / onboarding_stage / password_set /
// premium_expires_at, which the SPA and the mobile app read from it.
//
// How it runs (nothing can touch production): the REAL server.js (or $SERVER_JS) against a
// PostgREST-compatible translator (which honors select= column lists, like real PostgREST) over a
// REAL PostgreSQL (embedded-postgres, throwaway dir); empty cwd (no .env), whitelisted env.
// Requires (test-only): npm install --no-save embedded-postgres pg
// Standalone script (repo convention); exit code = number of failed checks.

import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
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

// ---- the live `users` table: 74 columns (introspected from production, read-only) + one that does not exist yet ----
const USER_COLS = {
  id: 'text PRIMARY KEY', email: 'text', password: 'text', name: 'text', bio: 'text', headline: 'text',
  photos: "jsonb DEFAULT '[]'", instagram: 'text', linkedin: 'text', website: 'text', github: 'text', twitter: 'text', portfolio: 'text',
  location: 'text', lat: 'numeric', lng: 'numeric', remote: 'boolean DEFAULT false',
  skills: "jsonb DEFAULT '[]'", interests: "jsonb DEFAULT '[]'",
  currently_exploring: 'text', working_on: 'text', interested_in: 'text', intent: 'text',
  profession: 'text', industry: 'text', experience_level: 'text',
  role: "text DEFAULT 'user'", premium: 'boolean DEFAULT false', premium_expires_at: 'timestamptz', premium_plan: 'text', premium_since: 'timestamptz', is_premium: 'boolean DEFAULT false',
  trust_score: 'int DEFAULT 10', profile_score: 'int DEFAULT 30', is_profile_complete: 'boolean DEFAULT false',
  verification: `jsonb DEFAULT '{"status":"none","confidence":0}'`, banned: 'boolean DEFAULT false', deleted_at: 'timestamptz', deletion_scheduled_at: 'timestamptz',
  email_verified: 'boolean DEFAULT true', onboarding_stage: "text DEFAULT 'complete'", onboarding_completed_at: 'timestamptz',
  password_set: 'boolean DEFAULT true', password_changed_at: 'timestamptz', push_token: 'text', last_active: 'timestamptz', created_at: 'timestamptz DEFAULT now()',
  referred_by: 'text', consent_given_at: 'timestamptz', consent_version: 'text', do_not_sell: 'boolean',
  avg_reply_minutes: 'numeric', reply_count: 'int', response_rate: 'numeric',
  failed_login_attempts: 'int DEFAULT 0', lockout_until: 'timestamptz',
  otp_code: 'text', otp_expires_at: 'timestamptz', otp_last_sent_at: 'timestamptz', otp_hour_count: 'int', otp_hour_window_start: 'timestamptz', otp_day_count: 'int', otp_day_window_start: 'timestamptz',
  email_suppressed: 'boolean', email_suppressed_reason: 'text', email_suppressed_at: 'timestamptz',
  magic_link_token_hash: 'text', magic_link_expires_at: 'timestamptz', magic_link_used_at: 'timestamptz', magic_link_last_sent_at: 'timestamptz',
  magic_link_hour_count: 'int', magic_link_hour_window_start: 'timestamptz', magic_link_day_count: 'int', magic_link_day_window_start: 'timestamptz',
  future_secret_column: 'text',   // a column added LATER: an allow-list must not leak it, a deny-list would
};
const DDL = `
CREATE TABLE users (${Object.entries(USER_COLS).map(([c, t]) => `${c} ${t}`).join(', ')});
CREATE TABLE swipes (id text PRIMARY KEY, from_user text, to_user text, direction text, created_at timestamptz DEFAULT now());
CREATE TABLE connections (id text PRIMARY KEY, user1 text, user2 text, active boolean DEFAULT true, expires_at timestamptz, created_at timestamptz DEFAULT now(), user1_last_read_at timestamptz, user2_last_read_at timestamptz);
`;

// THE CONTRACT: the only keys another user's object may carry (public profile content + computed values)
const ALLOWED = ['id', 'name', 'bio', 'headline', 'photos', 'location', 'remote', 'intent', 'interests', 'skills', 'currently_exploring', 'working_on', 'interested_in',
  'profession', 'industry', 'experience_level', 'instagram', 'linkedin', 'website', 'github', 'twitter', 'portfolio',
  'verification', 'trust_score', 'profile_score', 'is_profile_complete', 'created_at',
  'premium', 'is_recently_active', 'is_online'];
// what the audit named, plus the rest of the account-internal columns
const MUST_NOT_LEAK = Object.keys(USER_COLS).filter(c => !ALLOWED.includes(c));

// ---- PostgREST-compatible translator over the real Postgres (now honoring select= column lists) ----
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
function where(table, cols, params, args) {
  const parts = [];
  for (const [k, v] of params) {
    if (NON_FILTER.has(k)) continue;
    if (k === 'or') {
      const inner = v.replace(/^\(|\)$/g, '').split(/,(?![^(]*\))/).map(c => { const m = /^([a-z_0-9]+)\.(not\.)?([a-z]+)\.(.*)$/.exec(c); if (!m) throw new PgLike(400, 'PGRST100', `bad or() condition ${c}`); return cond(table, cols, args, m[1], !!m[2], m[3], m[4]); });
      parts.push(`(${inner.join(' OR ')})`); continue;
    }
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
  const want = selectParam.split(',').map(s => s.trim()).filter(Boolean);
  const out = {}; for (const c of want) { if (!cols.has(c)) throw new PgLike(400, '42703', `column ${table}.${c} does not exist`); out[c] = row[c]; }
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
        const sel = url.searchParams.get('select');
        const rows = (await pool.query(`SELECT to_jsonb(t) AS r FROM "${table}" t ${w} ${ob} ${lim}`, args)).rows.map(r => pick(r.r, sel, cols, table));
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
  const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a8-pg-'));
  const pgPort = await freePort();
  const epg = new EmbeddedPostgres({ databaseDir: dbDir, user: 'postgres', password: 'pw', port: pgPort, persistent: false, onLog: () => {}, onError: () => {} });
  await epg.initialise(); await epg.start(); await epg.createDatabase('byn');
  pool = new pg.Pool({ host: '127.0.0.1', port: pgPort, user: 'postgres', password: 'pw', database: 'byn', max: 10 });
  const q = (sql, args) => pool.query(sql, args);
  await q(DDL);

  // ---- fixtures ----
  const FUTURE = new Date(Date.now() + 30 * 864e5).toISOString(), PAST = new Date(Date.now() - 30 * 864e5).toISOString(), NOW = new Date().toISOString();
  // every account-internal column of an ordinary account, filled with a recognisable value
  const internals = id => ({
    email: `${id}@example.test`, password: `LEAK_password_${id}`, push_token: `LEAK_push_token_${id}`, otp_code: `LEAK_otp_${id}`, otp_expires_at: FUTURE, otp_last_sent_at: NOW,
    otp_hour_count: 2, otp_hour_window_start: NOW, otp_day_count: 3, otp_day_window_start: NOW,
    magic_link_token_hash: `LEAK_magic_link_token_hash_${id}`, magic_link_expires_at: FUTURE, magic_link_used_at: NOW, magic_link_last_sent_at: NOW,
    magic_link_hour_count: 1, magic_link_hour_window_start: NOW, magic_link_day_count: 1, magic_link_day_window_start: NOW,
    password_changed_at: PAST, password_set: true, email_verified: true, onboarding_stage: 'complete', onboarding_completed_at: PAST,
    premium_plan: `LEAK_premium_plan_${id}`, premium_since: PAST, is_premium: true, referred_by: `LEAK_referrer_of_${id}`,
    consent_given_at: PAST, consent_version: `LEAK_consent_v_${id}`, do_not_sell: true,
    email_suppressed: false, email_suppressed_reason: `LEAK_suppressed_${id}`, email_suppressed_at: PAST,
    failed_login_attempts: 2, lockout_until: FUTURE, deletion_scheduled_at: FUTURE, role: 'user', banned: false,
    lat: 19.07, lng: 72.87, avg_reply_minutes: 12.5, reply_count: 7, response_rate: 0.8,
    future_secret_column: `LEAK_future_column_${id}`,
  });
  // public profile content, with distinctive values so "still present" is checkable
  const publicProfile = (id, name) => ({
    id, name, bio: `Bio of ${name}, long enough`, headline: `Headline ${id}`, photos: [`https://img.test/${id}-1.jpg`, `https://img.test/${id}-2.jpg`],
    location: 'Mumbai', remote: true, intent: 'collaborate', interests: ['ai', 'design', 'music'], skills: ['react', 'node'],
    currently_exploring: `exploring-${id}`, working_on: `working-${id}`, interested_in: `interested-${id}`,
    profession: `Engineer-${id}`, industry: `Fintech-${id}`, experience_level: 'senior',
    instagram: `https://instagram.test/${id}`, linkedin: `https://linkedin.test/${id}`, website: `https://site.test/${id}`, github: `https://github.test/${id}`, twitter: `https://twitter.test/${id}`, portfolio: `https://portfolio.test/${id}`,
    verification: { status: 'verified', confidence: 90 }, trust_score: 55, profile_score: 90, is_profile_complete: true, last_active: NOW, created_at: '2026-01-15T00:00:00.000Z',
    premium: true, premium_expires_at: FUTURE,
  });
  const insert = async row => { const keys = Object.keys(row); await q(`INSERT INTO users (${keys.map(k => `"${k}"`).join(',')}) VALUES (${keys.map((k, i) => `$${i + 1}${USER_COLS[k].startsWith('jsonb') ? '::jsonb' : ''}`).join(',')})`, keys.map(k => USER_COLS[k].startsWith('jsonb') ? JSON.stringify(row[k]) : row[k])); };
  const IDS = { viewer: 'viewer', target: 'target_pat', liker: 'liker_pat', conn: 'conn_pat', expired: 'expired_pat' };
  await insert({ ...internals(IDS.viewer), ...publicProfile(IDS.viewer, 'Viewer Vee'), premium: true, premium_expires_at: FUTURE });      // premium => liked-me returns full profiles
  await insert({ ...internals(IDS.target), ...publicProfile(IDS.target, 'Pat Target') });
  await insert({ ...internals(IDS.liker), ...publicProfile(IDS.liker, 'Pat Liker') });
  await insert({ ...internals(IDS.conn), ...publicProfile(IDS.conn, 'Pat Connection') });
  await insert({ ...internals(IDS.expired), ...publicProfile(IDS.expired, 'Pat Expired'), premium: true, premium_expires_at: PAST });     // premium flag set but EXPIRED
  await q(`INSERT INTO swipes (id, from_user, to_user, direction) VALUES ('sw1', $1, $2, 'right')`, [IDS.liker, IDS.viewer]);
  await q(`INSERT INTO connections (id, user1, user2, active, expires_at) VALUES ('c1', $1, $2, true, $3)`, [IDS.viewer, IDS.conn, FUTURE]);

  const shared = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a8-shared-'));
  const stub = path.join(shared, 'stub-resend.cjs');
  fs.writeFileSync(stub, `const Module = require('module'); const orig = Module._load;
Module._load = function (request) { if (request === 'resend') { return { Resend: class { constructor() { this.emails = { send: async () => ({ data: { id: 'stub' }, error: null }) }; } } }; } return orig.apply(this, arguments); };`);
  await new Promise(r => translator.listen(0, '127.0.0.1', r)); const dbPort = translator.address().port;
  const port = await freePort(); const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a8-'));
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, SYSTEMROOT: process.env.SYSTEMROOT, TEMP: os.tmpdir(), TMP: os.tmpdir(), HOME: cwd, USERPROFILE: cwd,
    SUPABASE_URL: `http://127.0.0.1:${dbPort}`, SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key', JWT_SECRET, ADMIN_SECRET: 'test-only-admin-secret', PORT: String(port), RESEND_API_KEY: 'test-only-resend-key' };
  let out = ''; const child = spawn(process.execPath, ['-r', stub, SERVER_JS], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  let exited = null; child.on('exit', c => { exited = c; });
  await waitFor(() => /Server on port/.test(out) || exited !== null, 60000, 200);
  const base = `http://127.0.0.1:${port}`;
  const token = jwt.sign({ id: IDS.viewer, email: `${IDS.viewer}@example.test`, name: 'V' }, JWT_SECRET, { expiresIn: '1h' });
  const get = async p => { const r = await fetch(base + p, { headers: { Authorization: `Bearer ${token}` } }); let j = null; try { j = await r.json(); } catch {} return { status: r.status, body: j }; };

  try {
    check('server booted', /Server on port/.test(out) && exited === null, out.slice(-300));

    // (endpoint, how to get its "other user" objects, keys the endpoint itself adds to them)
    const ENDPOINTS = [
      { name: 'GET /api/profiles/:id',     path: `/api/profiles/${IDS.target}`,   users: b => [b],                          added: ['works', 'connections_count', 'review_summary', 'is_connected', 'mutual_count', 'my_review'], full: true },
      { name: 'GET /api/search',           path: '/api/search?q=pat',             users: b => b,                            added: [], full: true },
      { name: 'GET /api/liked-me',         path: '/api/liked-me',                 users: b => b.profiles,                   added: [], full: true },
      { name: 'GET /api/connections/:id',  path: '/api/connections/c1',           users: b => [b.user],                     added: [], full: true },
      { name: 'GET /api/connections',      path: '/api/connections',              users: b => b.map(x => x.user),           added: [], full: false },
      { name: 'GET /api/discover',         path: '/api/discover?worldwide=true',  users: b => b.profiles,                   added: ['matchScore', 'insight', 'matchReasons', 'works', 'distance'], full: false },
    ];
    const seen = {};
    for (const ep of ENDPOINTS) {
      console.log(`\n--- ${ep.name} ---`);
      const r = await get(ep.path);
      check(`${ep.name} -> 200`, r.status === 200, JSON.stringify(r).slice(0, 200));
      const objs = (r.status === 200 ? ep.users(r.body) : []).filter(Boolean);
      seen[ep.name] = objs;
      check('returns at least one other-user object to inspect', objs.length >= 1, JSON.stringify(r.body).slice(0, 160));
      const leakedKeys = [...new Set(objs.flatMap(o => Object.keys(o).filter(k => MUST_NOT_LEAK.includes(k))))];
      check('NO account-internal field is present on any returned user (magic_link_*, otp_*, password_*, premium_expires_at, referred_by, email_verified, onboarding_stage, consent_*, deleted_at, ...)', leakedKeys.length === 0, `leaked keys: ${leakedKeys.join(', ')}`);
      const unexpected = [...new Set(objs.flatMap(o => Object.keys(o).filter(k => !ALLOWED.includes(k) && !ep.added.includes(k))))];
      check('every key is on the allow-list (or one the endpoint itself adds) - including a column that does not exist yet', unexpected.length === 0, `unexpected keys: ${unexpected.join(', ')}`);
      check('no sentinel value from any sensitive column appears anywhere in the response', !/LEAK_/.test(JSON.stringify(r.body)), (JSON.stringify(r.body).match(/LEAK_[a-z_]+/) || [''])[0]);
      const o0 = objs[0] || {};
      // discover and the chat list load a NARROWER column list than the other four endpoints (their own
      // select: DISCOVER_FIELDS / CONNECTION_USER_FIELDS), so these are legitimately absent there.
      const missing = ALLOWED.filter(k => !['is_recently_active', 'is_online'].includes(k) && !(k in o0));
      const expectedMissing = ep.name === 'GET /api/connections' ? ['bio', 'remote', 'interested_in', 'profession', 'industry', 'experience_level', 'github', 'twitter', 'portfolio'] : ep.name === 'GET /api/discover' ? ['headline', 'profession', 'industry', 'experience_level', 'github', 'twitter', 'portfolio'] : [];
      const trulyMissing = missing.filter(k => !expectedMissing.includes(k));
      check('the public profile content the clients render is STILL there', trulyMissing.length === 0, `missing: ${trulyMissing.join(', ')}`);
      check('...with the right values (name / bio / headline / links / photos / verification / scores)', o0.name && (o0.name.startsWith('Pat ')) && o0.id && JSON.stringify(o0.photos) === JSON.stringify([`https://img.test/${o0.id}-1.jpg`, `https://img.test/${o0.id}-2.jpg`]) && o0.trust_score === 55 && o0.profile_score === 90 && o0.verification?.status === 'verified' && o0.linkedin === `https://linkedin.test/${o0.id}`, JSON.stringify(o0).slice(0, 220));
      check("the 'already stripped' fields stay stripped (email, password, otp_code, push_token, lat, lng, role, banned, last_active)", !['email', 'password', 'otp_code', 'push_token', 'lat', 'lng', 'role', 'banned', 'last_active'].some(k => k in o0), Object.keys(o0).join(','));
      check('computed values intact: premium is a boolean, is_recently_active is a boolean', typeof o0.premium === 'boolean' && typeof o0.is_recently_active === 'boolean', `${o0.premium}/${o0.is_recently_active}`);
    }

    console.log('\n--- specifics ---');
    const chats = seen['GET /api/connections'][0] || {};
    check('the chat list keeps its computed is_online (the connections route computes it BEFORE cleanPublic)', chats.is_online === true, JSON.stringify(chats.is_online));
    const prof = seen['GET /api/profiles/:id'][0] || {};
    check('profile: premium is COMPUTED from the expiry, not the raw flag (an unexpired premium -> true)', prof.premium === true, String(prof.premium));
    const expiredRes = await get(`/api/profiles/${IDS.expired}`);
    check('profile: a user whose premium flag is set but EXPIRED shows premium=false (computed), and their premium_expires_at is not exposed', expiredRes.body?.premium === false && !('premium_expires_at' in (expiredRes.body || {})), JSON.stringify([expiredRes.body?.premium, 'premium_expires_at' in (expiredRes.body || {})]));
    check('profile: viewer-relative enrichment still works (works, connections_count, review_summary present)', Array.isArray(prof.works) && typeof prof.connections_count === 'number' && prof.review_summary && typeof prof.review_summary === 'object', JSON.stringify(Object.keys(prof)));
    const det = await get('/api/connections/c1');
    check('connection detail: the rest of the payload is unchanged (connection, lastMessage, icebreakers, unread_count)', det.body?.connection?.id === 'c1' && Array.isArray(det.body?.icebreakers) && 'unread_count' in det.body && 'hoursLeft' in det.body, JSON.stringify(Object.keys(det.body || {})));
    const nf = await get('/api/profiles/does_not_exist');
    check('unknown profile -> 404 (unchanged)', nf.status === 404, JSON.stringify(nf));

    console.log('\n--- the signed-in user\'s OWN object is unchanged (clean(), not cleanPublic) ---');
    const me = await get('/api/me');
    const meBody = me.body || {};
    check('GET /api/me still carries what the SPA and the mobile app read from it: email_verified, onboarding_stage, password_set, premium_expires_at, email', me.status === 200 && ['email_verified', 'onboarding_stage', 'password_set', 'premium_expires_at', 'email'].every(k => k in meBody), JSON.stringify(Object.keys(meBody)).slice(0, 200));
    check('...and still omits password, otp_code, push_token and the magic-link hash', !['password', 'otp_code', 'push_token', 'magic_link_token_hash'].some(k => k in meBody), Object.keys(meBody).join(','));
  } finally {
    const gone = new Promise(r => { if (exited !== null) r(); else child.once('exit', r); }); child.kill(); await Promise.race([gone, sleep(5000)]);
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
