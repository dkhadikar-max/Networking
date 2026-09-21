// Regression test for audit finding A7 (safeguards) - reports and moderation writes.
//
// Builds on the stopgap (POST /api/report/illegal-content no longer restricts anyone). These
// are the technical safeguards that hold whatever moderation policy is chosen:
//
//   1. a user cannot report themselves (the social route already refused; this one did not)
//   2. targetId must be a sane string naming a user that EXISTS and is NOT soft-deleted - a
//      nonexistent / deleted / malformed target used to be accepted ("Report received") and
//      stored as an orphan row
//   3. the admin ban write reports its own failure: a failed UPDATE used to answer {ok:true}
//      (and write an audit row) for a ban that never happened
//   4. reporting an admin (or an already-banned user) is recorded and restricts nobody
//   5. duplicate illegal-content reports (same reporter + target + category) collapse into one
//      row; and the ORDINARY report route's dedupe stops being defeated by them:
//        - it used maybeSingle() on (reporter, target) without looking at `type`, so ONE
//          illegal-content row made a social report "already reported", and TWO made
//          maybeSingle() error -> the dedupe silently failed open -> unlimited -10 trust
//          penalties (trust floored at 0 => hidden profile)
//        - a lookup failure must fail closed (5xx, nothing recorded, no penalty), not open
//
// How it runs (nothing can touch production): a REAL PostgreSQL (embedded-postgres, throwaway
// dir) in two schema shapes - MIGRATED (reports.type + audit_logs, i.e. after migration 023) and
// PRODUCTION-SHAPED (neither) - behind a PostgREST-compatible translator; the real server.js
// (or $SERVER_JS) runs with an empty cwd (no .env), whitelisted env, `resend` stubbed; a distinct
// X-Forwarded-For per request so the per-IP report limiter never masks the behaviour under test.
//
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
const MIGRATED_EXTRA = `
ALTER TABLE reports ADD COLUMN type text;
CREATE TABLE audit_logs (id BIGSERIAL PRIMARY KEY, admin_id TEXT NOT NULL, action TEXT NOT NULL, target_id TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
`;
// simulates a failing write to ONE user's banned flag (a trigger raising an error, like an RLS/constraint/outage failure)
const FAILING_BAN = `
CREATE FUNCTION refuse_ban_of_cursed() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NEW.id = 'cursed' AND NEW.banned IS TRUE THEN RAISE EXCEPTION 'simulated write failure'; END IF; RETURN NEW; END $$;
CREATE TRIGGER refuse_ban_of_cursed BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION refuse_ban_of_cursed();
`;

// -- PostgREST-compatible translator over the real Postgres -------------------------
let pool;
class PgLike extends Error { constructor(status, code, message) { super(message); this.status = status; this.pgCode = code; } }
const NON_FILTER = new Set(['select', 'order', 'limit', 'offset', 'columns', 'on_conflict']);
const STRICT_MISSING_TABLES = new Set(['audit_logs']);
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
  const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a7s-pg-'));
  const pgPort = await freePort();
  const epg = new EmbeddedPostgres({ databaseDir: dbDir, user: 'postgres', password: 'pw', port: pgPort, persistent: false, onLog: () => {}, onError: () => {} });
  await epg.initialise(); await epg.start(); await epg.createDatabase('byn');
  pool = new pg.Pool({ host: '127.0.0.1', port: pgPort, user: 'postgres', password: 'pw', database: 'byn', max: 10 });
  const q = (sql, args) => pool.query(sql, args); const one = async (sql, args) => (await q(sql, args)).rows[0];

  const shared = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a7s-shared-'));
  const stub = path.join(shared, 'stub-resend.cjs');
  fs.writeFileSync(stub, `const Module = require('module'); const orig = Module._load;
Module._load = function (request) { if (request === 'resend') { return { Resend: class { constructor() { this.emails = { send: async () => ({ data: { id: 'stub' }, error: null }) }; } } }; } return orig.apply(this, arguments); };`);
  await new Promise(r => translator.listen(0, '127.0.0.1', r)); const dbPort = translator.address().port;
  async function boot() {
    const port = await freePort(); const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a7s-'));
    const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, SYSTEMROOT: process.env.SYSTEMROOT, TEMP: os.tmpdir(), TMP: os.tmpdir(), HOME: cwd, USERPROFILE: cwd,
      SUPABASE_URL: `http://127.0.0.1:${dbPort}`, SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key', JWT_SECRET, ADMIN_SECRET: 'test-only-admin-secret', PORT: String(port), RESEND_API_KEY: 'test-only-resend-key' };
    let out = ''; const child = spawn(process.execPath, ['-r', stub, SERVER_JS], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
    let exited = null; child.on('exit', c => { exited = c; });
    await waitFor(() => /Server on port/.test(out) || exited !== null, 60000, 200);
    const base = `http://127.0.0.1:${port}`; let ipN = 0;
    const call = async (method, p, { token, body } = {}) => {
      const res = await fetch(base + p, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), 'X-Forwarded-For': `10.6.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: body !== undefined ? JSON.stringify(body) : undefined });
      let j = null; try { j = await res.json(); } catch {} return { status: res.status, body: j };
    };
    return { call, logs: () => out, up: () => /Server on port/.test(out) && exited === null, async stop() { const gone = new Promise(r => { if (exited !== null) r(); else child.once('exit', r); }); child.kill(); await Promise.race([gone, sleep(5000)]); try { fs.rmSync(cwd, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); } catch {} } };
  }
  const tok = id => jwt.sign({ id, email: `${id}@example.test`, name: 'T' }, JWT_SECRET, { expiresIn: '1h' });
  const mk = (id, o = {}) => q(`INSERT INTO users (id,email,name,role,last_active,trust_score,banned,deleted_at) VALUES ($1,$2,$3,$4,now(),40,$5,$6)`,
    [id, `${id}@example.test`, o.deleted ? 'Deleted User' : 'Test User', o.role || 'user', !!o.banned, o.deleted ? new Date().toISOString() : null]);
  const trust = async id => (await one(`SELECT trust_score FROM users WHERE id=$1`, [id])).trust_score;
  const banned = async id => (await one(`SELECT banned FROM users WHERE id=$1`, [id])).banned;
  const nReports = async (where, args = []) => Number((await one(`SELECT count(*) c FROM reports WHERE ${where}`, args)).c);

  async function runShape(shape) {
    const migrated = shape === 'migrated';
    console.log(`\n=== schema shape: ${migrated ? 'MIGRATED (reports.type + audit_logs present)' : 'PRODUCTION-SHAPED (no reports.type, no audit_logs)'} ===`);
    await q('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'); await q(BASELINE); if (migrated) await q(MIGRATED_EXTRA); await q(FAILING_BAN);
    for (const id of ['admin1', 'admin_target', 'reporter', 'reporter2', 'selfie', 'tgt', 'tgt2', 'soc_a', 'soc_b', 'soc_c', 'soc_d', 't_spoof', 'cursed', 'plain_ban'])
      await mk(id, { role: id.startsWith('admin') ? 'admin' : 'user' });
    await mk('t_banned', { banned: true }); await mk('t_deleted', { deleted: true });
    const S = await boot();
    check('server booted', S.up(), S.logs().slice(-300));
    const rep = (as, body) => S.call('POST', '/api/report/illegal-content', { token: tok(as), body });
    const soc = (as, body) => S.call('POST', '/api/report', { token: tok(as), body });

    if (!migrated) {
      // ---- fail closed when the reports lookup itself fails (schema without reports.type) ----
      const t0 = await trust('tgt');
      const s1 = await soc('soc_a', { targetId: 'tgt', reason: 'rude' });
      check('social report, dedupe lookup FAILS (no reports.type): 5xx, not a silent fail-open', s1.status >= 500, JSON.stringify(s1));
      check('...no report row recorded and NO trust penalty applied', (await nReports(`from_user='soc_a'`)) === 0 && (await trust('tgt')) === t0, `rows=${await nReports(`from_user='soc_a'`)} trust=${await trust('tgt')}`);
      const i1 = await rep('reporter', { targetId: 'tgt', category: 'CSAM', description: 'x' });
      check('illegal-content report, reports lookup/insert FAILS: 5xx REPORT_NOT_PERSISTED, nobody restricted', i1.status >= 500 && i1.body?.code === 'REPORT_NOT_PERSISTED' && !(await banned('tgt')), JSON.stringify(i1));
      await S.stop(); return;
    }

    // ---- 1. self-report ----
    const self = await rep('selfie', { targetId: 'selfie', category: 'CSAM', description: 'self' });
    check('1. SELF-report -> 400 "Cannot report yourself"', self.status === 400 && /yourself/i.test(self.body?.error || ''), JSON.stringify(self));
    check('...nothing stored, reporter not restricted', (await nReports(`from_user='selfie'`)) === 0 && !(await banned('selfie')), `rows=${await nReports(`from_user='selfie'`)}`);

    // ---- 2. target validation ----
    const ghost = await rep('reporter', { targetId: 'no-such-user-id', category: 'Fraud', description: 'x' });
    const deleted = await rep('reporter', { targetId: 't_deleted', category: 'Fraud', description: 'x' });
    check('2. NONEXISTENT target -> 404, nothing stored', ghost.status === 404 && (await nReports(`target_id='no-such-user-id'`)) === 0, JSON.stringify(ghost));
    check('2. SOFT-DELETED target -> 404, nothing stored', deleted.status === 404 && (await nReports(`target_id='t_deleted'`)) === 0, JSON.stringify(deleted));
    check('...a deleted target is indistinguishable from a nonexistent one (same status and message)', ghost.status === deleted.status && ghost.body?.error === deleted.body?.error, JSON.stringify([ghost.body, deleted.body]));
    for (const [label, targetId] of [['numeric id', 12345], ['object id', { a: 1 }], ['array id', ['x']], ['boolean id', true], ['oversized id (5000 chars)', 'A'.repeat(5000)]]) {
      const x = await rep('reporter', { targetId, category: 'Fraud', description: 'x' });
      check(`2. malformed target (${label}) -> 400, nothing stored`, x.status === 400, JSON.stringify(x));
    }
    check('2. no orphan/garbage rows were created by any rejected report', (await nReports(`from_user='reporter'`)) === 0, `rows=${await nReports(`from_user='reporter'`)}`);
    const noCat = await rep('reporter', { targetId: 'tgt', category: 'Not A Category' });
    check('invalid category -> 400 with the category list (unchanged)', noCat.status === 400 && Array.isArray(noCat.body?.categories), JSON.stringify(noCat));

    // ---- 4. reporting an admin / banned user is recorded and restricts nobody ----
    const ra = await rep('reporter', { targetId: 'admin_target', category: 'CSAM', description: 'admin' });
    const meAdmin = await S.call('GET', '/api/me', { token: tok('admin_target') });
    check('4. report against an ADMIN -> 200, recorded, admin not restricted', ra.status === 200 && (await nReports(`target_id='admin_target'`)) === 1 && !(await banned('admin_target')) && meAdmin.status === 200, JSON.stringify(ra));
    const rb = await rep('reporter', { targetId: 't_banned', category: 'Fraud', description: 'x' });
    check('4. report against an already-BANNED user -> 200 and recorded (not silently dropped)', rb.status === 200 && (await nReports(`target_id='t_banned'`)) === 1, JSON.stringify(rb));

    // ---- valid path unchanged ----
    const ok1 = await rep('reporter', { targetId: 'tgt', category: 'Fraud', description: 'scam listing' });
    const row1 = await one(`SELECT type, reason, from_user FROM reports WHERE target_id='tgt' AND from_user='reporter'`);
    check('valid report -> 200 {ok, message}, persisted with type=illegal_content and [DSA:cat] reason', ok1.status === 200 && ok1.body?.ok === true && /Report received/.test(ok1.body?.message || '') && row1?.type === 'illegal_content' && row1?.reason === '[DSA:Fraud] scam listing', JSON.stringify([ok1, row1]));
    check('...a first report is not flagged as a duplicate', !ok1.body?.duplicate, JSON.stringify(ok1.body));

    // ---- 5a. illegal-content duplicates collapse ----
    const dup = await rep('reporter', { targetId: 'tgt', category: 'Fraud', description: 'same again' });
    check('5. SAME reporter + target + category again -> 200 (idempotent) flagged duplicate', dup.status === 200 && dup.body?.ok === true && dup.body?.duplicate === true, JSON.stringify(dup));
    check('...and it collapsed: still exactly ONE row (the original)', (await nReports(`from_user='reporter' AND target_id='tgt' AND type='illegal_content'`)) === 1, `rows=${await nReports(`from_user='reporter' AND target_id='tgt'`)}`);
    const diffCat = await rep('reporter', { targetId: 'tgt', category: 'Hate Speech', description: 'other category' });
    const diffRep = await rep('reporter2', { targetId: 'tgt', category: 'Fraud', description: 'other reporter' });
    check('5. a DIFFERENT category, or a DIFFERENT reporter, is a genuinely new report (two more rows)', diffCat.status === 200 && diffRep.status === 200 && !diffCat.body?.duplicate && !diffRep.body?.duplicate && (await nReports(`target_id='tgt' AND type='illegal_content'`)) === 3, `rows=${await nReports(`target_id='tgt' AND type='illegal_content'`)}`);
    check('duplicate reports restrict nobody, however many (no ban, no trust change)', !(await banned('tgt')) && (await trust('tgt')) === 40, `banned=${await banned('tgt')} trust=${await trust('tgt')}`);

    // ---- 5b. the ORDINARY report route's dedupe vs illegal-content rows ----
    await rep('soc_a', { targetId: 'tgt2', category: 'Fraud', description: 'one illegal row' });
    const a1 = await soc('soc_a', { targetId: 'tgt2', reason: 'rude' });
    check('5. ONE illegal-content row no longer makes the reporter\'s first ORDINARY report "already reported" (200)', a1.status === 200, JSON.stringify(a1));
    const a2 = await soc('soc_a', { targetId: 'tgt2', reason: 'rude again' });
    check('...a second ordinary report is still refused (400 already reported)', a2.status === 400 && /already reported/i.test(a2.body?.error || ''), JSON.stringify(a2));
    check('...and exactly ONE trust penalty was applied (40 -> 30)', (await trust('tgt2')) === 30, `trust=${await trust('tgt2')}`);

    await mk('tgt3'); await rep('soc_b', { targetId: 'tgt3', category: 'Fraud', description: 'a' }); await rep('soc_b', { targetId: 'tgt3', category: 'Violence', description: 'b' });
    const seq = []; for (let i = 0; i < 4; i++) seq.push((await soc('soc_b', { targetId: 'tgt3', reason: 'x' + i })).status);
    check('5. TWO illegal-content rows no longer defeat the dedupe (was: maybeSingle() errored -> fail-open -> every report accepted)', seq[0] === 200 && seq.slice(1).every(s => s === 400), JSON.stringify(seq));
    check('...trust is penalised exactly once (40 -> 30), not driven to 0', (await trust('tgt3')) === 30, `trust=${await trust('tgt3')}`);

    await mk('tgt4'); const p1 = await soc('soc_c', { targetId: 'tgt4', reason: 'rude' }), p2 = await soc('soc_c', { targetId: 'tgt4', reason: 'rude again' });
    check('ordinary dedupe unchanged when there are no illegal rows: 200 then 400, one penalty', p1.status === 200 && p2.status === 400 && (await trust('tgt4')) === 30, JSON.stringify([p1.status, p2.status, await trust('tgt4')]));
    await mk('tgt5'); const sp1 = await soc('soc_d', { targetId: 'tgt5', reason: '[DSA:Fraud] pretending to be an illegal-content report' }), sp2 = await soc('soc_d', { targetId: 'tgt5', reason: '[DSA:Fraud] and again' });
    check('an ordinary report whose text imitates "[DSA:...]" cannot dodge the dedupe (keyed on the server-set type, not the text)', sp1.status === 200 && sp2.status === 400 && (await trust('tgt5')) === 30, JSON.stringify([sp1.status, sp2.status, await trust('tgt5')]));
    const sIn = await soc('soc_a', { targetId: 'soc_a', reason: 'self' });
    check('ordinary route: self-report still refused (unchanged)', sIn.status === 400, JSON.stringify(sIn));

    // ---- 3. the admin ban write reports its own failure ----
    const admin = tok('admin1');
    const bad = await S.call('POST', '/api/admin/ban', { token: admin, body: { targetId: 'cursed', banned: true } });
    check('3. admin ban whose UPDATE FAILS -> 5xx (was: {ok:true} for a ban that never happened)', bad.status >= 500 && bad.body?.ok !== true, JSON.stringify(bad));
    check('...the target is not banned and NO "ban" audit row was written for it', !(await banned('cursed')) && Number((await one(`SELECT count(*) c FROM audit_logs WHERE action='ban' AND target_id='cursed'`)).c) === 0, `banned=${await banned('cursed')}`);
    const good = await S.call('POST', '/api/admin/ban', { token: admin, body: { targetId: 'plain_ban', banned: true } });
    const meBanned = await S.call('GET', '/api/me', { token: tok('plain_ban') });
    const undo = await S.call('POST', '/api/admin/ban', { token: admin, body: { targetId: 'plain_ban', banned: false } });
    check('admin ban / unban still work: ban -> 200, target gets 403, audit row written, unban -> 200', good.status === 200 && meBanned.status === 403 && undo.status === 200 && !(await banned('plain_ban')) && Number((await one(`SELECT count(*) c FROM audit_logs WHERE action='ban' AND target_id='plain_ban'`)).c) === 1, JSON.stringify([good.status, meBanned.status, undo.status]));
    const noTarget = await S.call('POST', '/api/admin/ban', { token: admin, body: { targetId: 'nobody', banned: true } });
    check('admin ban of a nonexistent user -> 404 (unchanged)', noTarget.status === 404, JSON.stringify(noTarget));

    // ---- invariants carried over from the stopgap ----
    check('OVERALL: no report of any kind restricted any account (only the admin ban above did, and it was undone)', Number((await one(`SELECT count(*) c FROM users WHERE banned AND id <> 't_banned'`)).c) === 0, JSON.stringify((await q(`SELECT id FROM users WHERE banned`)).rows));
    const noTok = await S.call('POST', '/api/report/illegal-content', { body: { targetId: 'tgt', category: 'Fraud' } });
    check('unauthenticated -> 401 (unchanged)', noTok.status === 401, JSON.stringify(noTok));
    check('the [DSA] log line carries the report id for traceability', /\[DSA\] report [^\n]*report=[0-9a-f-]{36}/.test(S.logs()), S.logs().split('\n').filter(l => /\[DSA\] report/.test(l)).slice(0, 2).join(' | '));
    await S.stop();
  }

  try {
    console.log(`server under test: ${SERVER_JS}`);
    await runShape('migrated');
    await runShape('production');
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
