// Regression test for audit finding A7 (stopgap) - POST /api/report/illegal-content
// must NOT restrict anyone.
//
// THE EXPLOIT (reproduced against the pre-fix code): any authenticated account - even a
// brand-new, unverified, nameless one - could submit ONE report with category CSAM or
// Terrorism against an arbitrary user id and the route immediately set users.banned = true
// on the target. No target validation, no self/admin guard, no review, no expiry. It could
// ban an admin, a soft-deleted account, or the reporter themselves.
//
// Stopgap invariant: the endpoint records the report (and surfaces severe categories in the
// log for manual review) but never changes any account's banned state. Restricting an
// account is a moderator action (POST /api/admin/ban) until the reviewed hold/threshold
// workflow replaces this.
//
// How it runs (nothing can touch production):
//   * a REAL PostgreSQL server (embedded-postgres) in a throwaway dir, in TWO schema shapes:
//       - production-shaped: reports WITHOUT `type`, no audit_logs table (the live database today)
//       - migrated: reports.type + audit_logs present (the shape after migration 023)
//   * the REAL server.js (or the file named by SERVER_JS) runs against a PostgREST-compatible
//     translator in front of that Postgres; empty cwd (no .env), whitelisted env,
//     `resend` stubbed;
//   * distinct X-Forwarded-For per request (trust proxy = 1) so the per-IP report limiter
//     (5/hour) never masks the behaviour under test.
//
// Requires (test-only, not project dependencies):   npm install --no-save embedded-postgres pg
// Usage:  node test-a7-stopgap-no-auto-ban.mjs            (tests ./server.js)
//         SERVER_JS=<path> node test-a7-stopgap-no-auto-ban.mjs
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

// -- production-shaped baseline (what the live database looks like today) --------
const BASELINE = `
CREATE TABLE users (
  id text PRIMARY KEY, email text, password text, name text, bio text, headline text, photos jsonb DEFAULT '[]', instagram text DEFAULT '', linkedin text DEFAULT '',
  website text DEFAULT '', location text DEFAULT '', lat numeric, lng numeric, remote boolean DEFAULT false, skills jsonb DEFAULT '[]', interests jsonb DEFAULT '[]',
  currently_exploring text DEFAULT '', working_on text DEFAULT '', interested_in text DEFAULT '', intent text DEFAULT 'explore-network', role text DEFAULT 'user',
  premium boolean DEFAULT false, premium_expires_at timestamptz, premium_plan text, premium_since timestamptz, trust_score int DEFAULT 10, profile_score int DEFAULT 30,
  is_profile_complete boolean DEFAULT false, verification jsonb DEFAULT '{"status":"none","confidence":0}', banned boolean DEFAULT false, deleted_at timestamptz,
  email_verified boolean DEFAULT true, onboarding_stage text DEFAULT 'complete', password_set boolean DEFAULT true, password_changed_at timestamptz, push_token text,
  last_active timestamptz, created_at timestamptz DEFAULT now());
CREATE INDEX users_deleted_at_idx ON users(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE TABLE reports (id text PRIMARY KEY, from_user text NOT NULL, target_id text NOT NULL, reason text NOT NULL, created_at timestamptz DEFAULT now());
`;
// the two objects the migrated shape adds (inline so this test does not depend on any migration file)
const MIGRATED_EXTRA = `
ALTER TABLE reports ADD COLUMN type text;
CREATE TABLE audit_logs (id BIGSERIAL PRIMARY KEY, admin_id TEXT NOT NULL, action TEXT NOT NULL, target_id TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
`;

// -- PostgREST-compatible translator over the real Postgres -------------------------
let pool;
class PgLike extends Error { constructor(status, code, message) { super(message); this.status = status; this.pgCode = code; } }
const NON_FILTER = new Set(['select', 'order', 'limit', 'offset', 'columns', 'on_conflict']);
const STRICT_MISSING_TABLES = new Set(['audit_logs']);   // real PostgREST answers PGRST205; every other absent table is treated as empty
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
      const inner = v.replace(/^\(|\)$/g, '').split(/,(?![^(]*\))/).map(c => { const m = /^([a-z_]+)\.(not\.)?([a-z]+)\.(.*)$/.exec(c); if (!m) throw new PgLike(400, 'PGRST100', `bad or() condition ${c}`); return cond(table, cols, args, m[1], !!m[2], m[3], m[4]); });
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
      if (!cols) {
        if (STRICT_MISSING_TABLES.has(table)) return send(404, { code: 'PGRST205', message: `Could not find the table 'public.${table}' in the schema cache`, details: null, hint: null });
        return req.method === 'GET' || req.method === 'HEAD' ? send(200, [], { 'Content-Range': '*/0' }) : (res.writeHead(req.method === 'POST' ? 201 : 204), res.end());
      }
      const knownCols = payload => { for (const c of Object.keys(payload)) if (!cols.has(c)) throw new PgLike(400, 'PGRST204', `Could not find the '${c}' column of '${table}' in the schema cache`); };
      const cast = (c, v) => cols.get(c) === 'jsonb' ? JSON.stringify(v) : v;
      if (req.method === 'GET' || req.method === 'HEAD') {
        const args = []; const w = where(table, cols, url.searchParams, args); const ob = orderBy(cols, url.searchParams); const lim = url.searchParams.get('limit') ? `LIMIT ${parseInt(url.searchParams.get('limit'), 10)}` : '';
        const rows = (await pool.query(`SELECT to_jsonb(t) AS r FROM "${table}" t ${w} ${ob} ${lim}`, args)).rows.map(r => r.r);
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
  const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a7-pg-'));
  const pgPort = await freePort();
  const epg = new EmbeddedPostgres({ databaseDir: dbDir, user: 'postgres', password: 'pw', port: pgPort, persistent: false, onLog: () => {}, onError: () => {} });
  await epg.initialise(); await epg.start(); await epg.createDatabase('byn');
  pool = new pg.Pool({ host: '127.0.0.1', port: pgPort, user: 'postgres', password: 'pw', database: 'byn', max: 10 });
  const q = (sql, args) => pool.query(sql, args); const one = async (sql, args) => (await q(sql, args)).rows[0];

  const shared = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a7-shared-'));
  const stub = path.join(shared, 'stub-resend.cjs');
  fs.writeFileSync(stub, `const Module = require('module'); const orig = Module._load;
Module._load = function (request) { if (request === 'resend') { return { Resend: class { constructor() { this.emails = { send: async () => ({ data: { id: 'stub' }, error: null }) }; } } }; } return orig.apply(this, arguments); };`);
  await new Promise(r => translator.listen(0, '127.0.0.1', r)); const dbPort = translator.address().port;
  async function boot() {
    const port = await freePort(); const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a7-'));
    const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, SYSTEMROOT: process.env.SYSTEMROOT, TEMP: os.tmpdir(), TMP: os.tmpdir(), HOME: cwd, USERPROFILE: cwd,
      SUPABASE_URL: `http://127.0.0.1:${dbPort}`, SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key', JWT_SECRET, ADMIN_SECRET: 'test-only-admin-secret', PORT: String(port), RESEND_API_KEY: 'test-only-resend-key' };
    let out = ''; const child = spawn(process.execPath, ['-r', stub, SERVER_JS], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
    let exited = null; child.on('exit', c => { exited = c; });
    await waitFor(() => /Server on port/.test(out) || exited !== null, 60000, 200);
    const base = `http://127.0.0.1:${port}`;
    let ipN = 0;   // distinct client IP per call: the per-IP limiter must not mask the behaviour under test
    const call = async (method, p, { token, body } = {}) => {
      const res = await fetch(base + p, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), 'X-Forwarded-For': `10.8.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: body !== undefined ? JSON.stringify(body) : undefined });
      let j = null; try { j = await res.json(); } catch {} return { status: res.status, body: j };
    };
    return { call, logs: () => out, up: () => /Server on port/.test(out) && exited === null, async stop() { const gone = new Promise(r => { if (exited !== null) r(); else child.once('exit', r); }); child.kill(); await Promise.race([gone, sleep(5000)]); try { fs.rmSync(cwd, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); } catch {} } };
  }
  const tok = id => jwt.sign({ id, email: `${id}@example.test`, name: 'T' }, JWT_SECRET, { expiresIn: '1h' });
  const mk = (id, o = {}) => q(`INSERT INTO users (id,email,name,role,last_active,trust_score,email_verified,onboarding_stage,deleted_at) VALUES ($1,$2,$3,$4,now(),40,$5,$6,$7)`,
    [id, `${id}@example.test`, o.name ?? 'Test User', o.role || 'user', o.verified ?? true, o.stage || 'complete', o.deleted ? new Date().toISOString() : null]);
  const bannedIds = async () => (await q(`SELECT id FROM users WHERE banned = true ORDER BY id`)).rows.map(r => r.id);
  const hasTable = async t => !!(await one(`SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`, [t]));

  async function runShape(shape) {
    const migrated = shape === 'migrated';
    console.log(`\n=== schema shape: ${migrated ? 'MIGRATED (reports.type + audit_logs present)' : 'PRODUCTION-SHAPED (no reports.type, no audit_logs)'} ===`);
    await q('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'); await q(BASELINE); if (migrated) await q(MIGRATED_EXTRA);
    for (const id of ['admin1', 'reporter', 'victim_csam', 'victim_terror', 'victim_admin_target', 'selfie', 'victim_of_newbie', 'victim_fraud', 'plain_target', 'victim_plain_ban'])
      await mk(id, { role: id === 'admin1' || id === 'victim_admin_target' ? 'admin' : 'user' });
    await mk('newbie', { verified: false, stage: 'acquisition', name: '' });   // brand-new, unverified, nameless, onboarding not started
    await mk('victim_deleted', { deleted: true, name: 'Deleted User' });
    const S = await boot();
    check('server booted', S.up(), S.logs().slice(-300));
    const rep = (as, body) => S.call('POST', '/api/report/illegal-content', { token: tok(as), body });
    check('precondition: nobody is banned', (await bannedIds()).length === 0, JSON.stringify(await bannedIds()));

    // ---- the exploit path: authenticated account -> arbitrary target -> CSAM / Terrorism ----
    const csam = await rep('reporter', { targetId: 'victim_csam', category: 'CSAM', description: 'x' });
    const terr = await rep('reporter', { targetId: 'victim_terror', category: 'Terrorism', description: 'x' });
    check('CSAM report against an arbitrary user: target is NOT banned', (await bannedIds()).indexOf('victim_csam') === -1, `banned=${JSON.stringify(await bannedIds())}`);
    check('Terrorism report against an arbitrary user: target is NOT banned', (await bannedIds()).indexOf('victim_terror') === -1, `banned=${JSON.stringify(await bannedIds())}`);
    const me1 = await S.call('GET', '/api/me', { token: tok('victim_csam') });
    check('...the reported user can still authenticate (GET /api/me -> 200, not 403 "Account restricted")', me1.status === 200, JSON.stringify(me1));

    // ---- the aggravated variants ----
    await rep('reporter', { targetId: 'victim_admin_target', category: 'CSAM' });
    const meAdmin = await S.call('GET', '/api/me', { token: tok('victim_admin_target') });
    check('CSAM report against an ADMIN account: admin is NOT banned / locked out', !(await bannedIds()).includes('victim_admin_target') && meAdmin.status === 200, `status=${meAdmin.status}`);
    await rep('selfie', { targetId: 'selfie', category: 'CSAM', description: 'self' });
    const meSelf = await S.call('GET', '/api/me', { token: tok('selfie') });
    check('SELF-report (CSAM): the reporter does not ban themselves', !(await bannedIds()).includes('selfie') && meSelf.status === 200, `status=${meSelf.status}`);
    await rep('newbie', { targetId: 'victim_of_newbie', category: 'Terrorism', description: 'from a brand-new unverified nameless account' });
    check('report from an UNVERIFIED, nameless, onboarding-not-started account: target NOT banned', !(await bannedIds()).includes('victim_of_newbie'), JSON.stringify(await bannedIds()));
    await rep('reporter', { targetId: 'victim_deleted', category: 'CSAM' });
    check('CSAM report against a soft-deleted account: not flagged banned', !(await bannedIds()).includes('victim_deleted'), JSON.stringify(await bannedIds()));
    const ghost = await rep('reporter', { targetId: 'no-such-user', category: 'CSAM' });
    // (originally only "no crash"; the A7 safeguards then made a nonexistent target a clean 404)
    check('CSAM report against a NONEXISTENT id: rejected (404), nobody restricted', ghost.status === 404 && !(await bannedIds()).length, `status=${ghost.status}`);
    if (migrated) {
      const auto = (await q(`SELECT target_id FROM audit_logs WHERE action = 'dsa_auto_ban'`)).rows.map(r => r.target_id);
      check('no "dsa_auto_ban" audit row is written for any report (no automatic ban happens, so none is claimed)', auto.length === 0, JSON.stringify(auto));
    } else check('(audit_logs absent in this shape - nothing to assert there)', !(await hasTable('audit_logs')));
    check('OVERALL INVARIANT: after all of the above, NO account has banned = true', (await bannedIds()).length === 0, JSON.stringify(await bannedIds()));

    // ---- what must keep working ----
    if (migrated) {
      const rows = (await q(`SELECT from_user, target_id, reason, type FROM reports ORDER BY created_at`)).rows;
      check('report path intact: CSAM report -> 200 {ok:true, message}', csam.status === 200 && csam.body?.ok === true && /Report received/.test(csam.body?.message || ''), JSON.stringify(csam));
      check('report path intact: Terrorism report -> 200', terr.status === 200 && terr.body?.ok === true, JSON.stringify(terr));
      check("report path intact: reports are still PERSISTED with type='illegal_content' and the [DSA:<category>] reason",
        rows.some(r => r.target_id === 'victim_csam' && r.from_user === 'reporter' && r.type === 'illegal_content' && r.reason === '[DSA:CSAM] x')
        && rows.some(r => r.target_id === 'victim_terror' && r.reason === '[DSA:Terrorism] x'), JSON.stringify(rows.slice(0, 3)));
      const fraud = await rep('reporter', { targetId: 'victim_fraud', category: 'Fraud', description: 'scam' });
      check('lower-severity category (Fraud): 200, persisted, target not banned (unchanged behaviour)', fraud.status === 200 && (await one(`SELECT count(*)::int c FROM reports WHERE target_id='victim_fraud' AND reason='[DSA:Fraud] scam'`)).c === 1 && !(await bannedIds()).includes('victim_fraud'), JSON.stringify(fraud));
    }
    const badCat = await rep('reporter', { targetId: 'victim_fraud', category: 'Not A Category' });
    check('invalid category -> 400 with the category list (unchanged)', badCat.status === 400 && Array.isArray(badCat.body?.categories), JSON.stringify(badCat));
    const noTok = await S.call('POST', '/api/report/illegal-content', { body: { targetId: 'victim_fraud', category: 'CSAM' } });
    check('unauthenticated -> 401 (unchanged)', noTok.status === 401, JSON.stringify(noTok));
    // Where the report was recorded it is flagged for manual review; where the insert itself failed
    // (production-shaped schema under the A6 code) the failure is logged instead - either way it is not silent.
    const dsaLog = S.logs().split('\n').filter(l => /\[DSA\]/.test(l));
    const flagged = /\[DSA\][^\n]*(CSAM|Terrorism)[^\n]*(no automatic|manual review)/i.test(S.logs());
    const persistFailLogged = /\[DSA\] FAILED to persist[^\n]*(CSAM|Terrorism)/.test(S.logs());
    check('a severe-category report is surfaced in the server log for manual review', migrated ? flagged : (flagged || persistFailLogged), dsaLog.slice(0, 3).join(' | ') || '(no [DSA] log line)');

    // the legitimate restriction path is untouched: an admin can still ban / unban
    const admin = tok('admin1');
    await S.call('POST', '/api/admin/ban', { token: admin, body: { targetId: 'victim_plain_ban', banned: true } });
    const afterBan = (await bannedIds()).includes('victim_plain_ban');
    const meBanned = await S.call('GET', '/api/me', { token: tok('victim_plain_ban') });
    await S.call('POST', '/api/admin/ban', { token: admin, body: { targetId: 'victim_plain_ban', banned: false } });
    check('admin ban still works (moderator path unaffected): banned -> 403 on next request; unban restores', afterBan && meBanned.status === 403 && !(await bannedIds()).includes('victim_plain_ban'), `banned=${afterBan} status=${meBanned.status}`);
    // ordinary (social) report path is a different route and must be untouched
    const social = await S.call('POST', '/api/report', { token: tok('reporter'), body: { targetId: 'plain_target', reason: 'rude' } });
    const socialTrust = (await one(`SELECT trust_score FROM users WHERE id='plain_target'`)).trust_score;
    // A22: POST /api/report no longer writes trust_score directly (see test-a22-moderation-events.mjs) -
    // trust stays at mk()'s starting value of 40.
    if (migrated) check('ordinary social report unchanged: 200, trust_score untouched (A22)', social.status === 200 && socialTrust === 40, JSON.stringify(social));
    // Its dedupe now filters on reports.type (the A7 safeguards), so on a schema WITHOUT that column it fails CLOSED:
    // a loud 5xx with no row and no penalty, never a silent fail-open (see test-a7-report-safeguards.mjs).
    else check('ordinary social report on a schema without reports.type fails CLOSED: 5xx, no penalty applied', social.status >= 500 && socialTrust === 40, JSON.stringify([social.status, socialTrust]));
    await S.stop();
  }

  try {
    console.log(`server under test: ${SERVER_JS}`);
    await runShape('production');
    await runShape('migrated');
  } finally {
    try { await pool.end(); } catch {}
    await new Promise(r => translator.close(r));
    try { await epg.stop(); } catch {}
    await sleep(500);
    for (const d of [dbDir, shared]) { try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch { /* temp only */ } }
  }
  console.log(`\n=== RESULTS: ${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
