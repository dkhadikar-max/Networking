// Regression test for audit finding A6 — three production-schema defects whose
// handlers reported success while persisting nothing:
//
//   A6a  reports.type is missing.
//        POST /api/report/illegal-content inserts {..., type:'illegal_content'};
//        PostgREST rejects the unknown column, the INSERT error was never checked,
//        and the endpoint answered "Report received" — the DSA Art. 16 report was
//        never stored. GET /api/admin/dsa-report filters on the same column, so it
//        silently returned zeros. (Its "social" query, .not('type','eq',...), would
//        also have dropped every NULL-type row even once the column existed.)
//   A6b  audit_logs does not exist.
//        auditLog() swallowed the error; GET /api/admin/audit only ever read an
//        in-memory buffer, so admin history was lost on every restart.
//   A6c  users.deletion_scheduled_at is missing.
//        The GDPR retention job's queries all error out (unchecked), so it has
//        never scheduled or performed a single deletion.
//
// Invariant enforced here: a success-looking response must correspond to durable
// database state — and if persistence fails, the caller gets an error, not "ok".
//
// How it runs (nothing can touch production):
//   * a REAL PostgreSQL server (embedded-postgres) holds a production-shaped
//     baseline (`reports` without `type`, `users` without `deletion_scheduled_at`,
//     no `audit_logs`), then migrations/023_*.sql is applied VERBATIM when present;
//   * the REAL, UNMODIFIED server.js runs against a PostgREST-compatible
//     translator in front of that Postgres — including PostgREST's own error shapes
//     (PGRST204 unknown column, PGRST205 unknown table, 42703 unknown filter column);
//   * empty working dir (no .env), whitelisted env, `resend` stubbed to record e-mails;
//   * the retention job runs for real at server boot, against disposable local rows.
//
// Requires (test-only, not project dependencies):
//   npm install --no-save embedded-postgres pg
//
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
const SERVER_JS = path.join(here, 'server.js');
const JWT_SECRET = 'test-only-jwt-secret';
const MIGRATION = fs.readdirSync(path.join(here, 'migrations')).filter(f => /^023_.*\.sql$/.test(f)).map(f => path.join(here, 'migrations', f))[0];

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}  ${String(detail ?? '').slice(0, 300)}`); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise((resolve, reject) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); }); s.on('error', reject); });
async function waitFor(fn, ms = 15000, step = 250) { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) return v; await sleep(step); } }

// ── production-shaped baseline (what the live database looks like today) ─────
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
const REVERT = `DROP TABLE IF EXISTS audit_logs; ALTER TABLE reports DROP COLUMN IF EXISTS type; DROP INDEX IF EXISTS users_deletion_scheduled_at_idx; ALTER TABLE users DROP COLUMN IF EXISTS deletion_scheduled_at;`;

// ── PostgREST-compatible translator over the real Postgres ────────────────────
let pool;
class PgLike extends Error { constructor(status, code, message) { super(message); this.status = status; this.pgCode = code; } }
const NON_FILTER = new Set(['select', 'order', 'limit', 'offset', 'columns', 'on_conflict']);
const STRICT_MISSING_TABLES = new Set(['audit_logs']);   // real PostgREST answers PGRST205 for these; every other absent table is treated as empty
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
const requestLog = [];
const translator = http.createServer((req, res) => {
  const chunks = []; req.on('data', c => chunks.push(c));
  req.on('end', async () => {
    const url = new URL(req.url, 'http://mock'); const table = url.pathname.replace(/^\/rest\/v1\//, '');
    const raw = Buffer.concat(chunks).toString('utf8'); let body = null; try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
    const wantObject = (req.headers.accept || '').includes('vnd.pgrst.object+json'); const prefer = req.headers.prefer || '';
    const send = (status, payload, extra = {}) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...extra }); res.end(payload === undefined ? undefined : JSON.stringify(payload)); };
    const objectOr406 = list => list.length === 1 ? send(200, list[0]) : send(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: null, hint: null });
    requestLog.push({ method: req.method, table });
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

// ── server process helper ────────────────────────────────────────────────────
async function main() {
  const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a6-pg-'));
  const pgPort = await freePort();
  const epg = new EmbeddedPostgres({ databaseDir: dbDir, user: 'postgres', password: 'pw', port: pgPort, persistent: false, onLog: () => {}, onError: () => {} });
  await epg.initialise(); await epg.start(); await epg.createDatabase('byn'); await epg.createDatabase('ddl');
  const mkPool = db => new pg.Pool({ host: '127.0.0.1', port: pgPort, user: 'postgres', password: 'pw', database: db, max: 10 });
  const ddlPool = mkPool('ddl'); pool = mkPool('byn');
  const q = (sql, args) => pool.query(sql, args); const one = async (sql, args) => (await q(sql, args)).rows[0];
  console.log(`=== real Postgres up; migration 023 ${MIGRATION ? 'PRESENT (' + path.basename(MIGRATION) + ')' : 'NOT PRESENT (current code / current production schema)'} ===`);

  const shared = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a6-shared-'));
  const emailLog = path.join(shared, 'emails.log'); const stub = path.join(shared, 'stub-resend.cjs');
  fs.writeFileSync(stub, `const Module = require('module'); const fs = require('fs'); const orig = Module._load;
Module._load = function (request) { if (request === 'resend') { return { Resend: class { constructor() { this.emails = { send: async (p) => { fs.appendFileSync(${JSON.stringify(emailLog)}, JSON.stringify({ to: p.to, subject: p.subject }) + '\\n'); return { data: { id: 'stub' }, error: null }; } }; } } }; } return orig.apply(this, arguments); };`);
  const emailsTo = to => fs.existsSync(emailLog) ? fs.readFileSync(emailLog, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(e => e.to === to).length : 0;

  await new Promise(r => translator.listen(0, '127.0.0.1', r)); const dbPort = translator.address().port;
  async function boot() {
    const port = await freePort(); const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a6-'));
    const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, SYSTEMROOT: process.env.SYSTEMROOT, TEMP: os.tmpdir(), TMP: os.tmpdir(), HOME: cwd, USERPROFILE: cwd,
      SUPABASE_URL: `http://127.0.0.1:${dbPort}`, SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key', JWT_SECRET, ADMIN_SECRET: 'test-only-admin-secret', PORT: String(port), RESEND_API_KEY: 'test-only-resend-key' };
    let out = ''; const child = spawn(process.execPath, ['-r', stub, SERVER_JS], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
    let exited = null; child.on('exit', c => { exited = c; });
    await waitFor(() => /Server on port/.test(out) || exited !== null, 60000, 200);
    const base = `http://127.0.0.1:${port}`;
    const call = async (method, p, { token, body } = {}) => { const res = await fetch(base + p, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined }); let j = null; try { j = await res.json(); } catch {} return { status: res.status, body: j }; };
    return { call, logs: () => out, up: () => /Server on port/.test(out) && exited === null, async stop() { const gone = new Promise(r => { if (exited !== null) r(); else child.once('exit', r); }); child.kill(); await Promise.race([gone, sleep(5000)]); try { fs.rmSync(cwd, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); } catch {} } };
  }
  const tok = id => jwt.sign({ id, email: `${id}@example.test`, name: 'T' }, JWT_SECRET, { expiresIn: '1h' });
  const MONTH = 30 * 864e5;
  const mkUser = async (id, over = {}) => q(`INSERT INTO users (id, email, name, role, last_active, trust_score) VALUES ($1,$2,$3,$4,$5,$6)`, [id, over.email || `${id}@example.test`, over.name || 'Test User', over.role || 'user', over.last_active === undefined ? new Date().toISOString() : over.last_active, over.trust ?? 40]);
  const hasCol = async (t, c) => !!(await one(`SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name=$2`, [t, c]));
  const hasTable = async t => !!(await one(`SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`, [t]));

  try {
    // ════════ DDL SAFETY (isolated database: nothing else depends on it) ════════
    console.log('\n=== migration safety: applied to a production-shaped baseline in its own database ===');
    if (!MIGRATION) { check('migration 023 exists', false, 'migrations/023_*.sql not found'); }
    else {
      const sql = fs.readFileSync(MIGRATION, 'utf8');
      await ddlPool.query(BASELINE);
      await ddlPool.query(`INSERT INTO users (id, email, name, last_active) VALUES ('old_u','old@example.test','Old','2026-01-01T00:00:00Z'); INSERT INTO reports (id, from_user, target_id, reason) VALUES ('old_r','a','b','old social report')`);
      const snap = async () => ({
        cols: (await ddlPool.query(`SELECT table_name||'.'||column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,'') AS s FROM information_schema.columns WHERE table_schema='public' ORDER BY 1`)).rows.map(r => r.s),
        idx: (await ddlPool.query(`SELECT indexdef AS s FROM pg_indexes WHERE schemaname='public' ORDER BY 1`)).rows.map(r => r.s),
        rows: [(await ddlPool.query('SELECT count(*) c FROM users')).rows[0].c, (await ddlPool.query('SELECT count(*) c FROM reports')).rows[0].c],
        data: JSON.stringify((await ddlPool.query(`SELECT to_jsonb(u) j FROM users u ORDER BY id`)).rows.concat((await ddlPool.query(`SELECT to_jsonb(r) j FROM reports r ORDER BY id`)).rows)),
      });
      const before = await snap();
      await ddlPool.query(sql);
      const after = await snap();
      const addedCols = after.cols.filter(c => !before.cols.includes(c)), removedCols = before.cols.filter(c => !after.cols.includes(c));
      const addedIdx = after.idx.filter(c => !before.idx.includes(c)), removedIdx = before.idx.filter(c => !after.idx.includes(c));
      console.log('     added columns:', JSON.stringify(addedCols.map(c => c.split(':').slice(0, 1)[0] + ' ' + c.split(':')[1] + (c.split(':')[2] === 'NO' ? ' NOT NULL' : ''))));
      console.log('     added indexes:', JSON.stringify(addedIdx.map(i => i.replace(/^CREATE (UNIQUE )?INDEX /, '').split(' ON ')[0])));
      check('adds reports.type as nullable text, no default', addedCols.includes('reports.type:text:YES:'), JSON.stringify(addedCols));
      check('adds users.deletion_scheduled_at as nullable timestamptz, no default', addedCols.includes('users.deletion_scheduled_at:timestamp with time zone:YES:'), JSON.stringify(addedCols));
      check('creates audit_logs (id bigint identity, admin_id, action, target_id, created_at timestamptz NOT NULL DEFAULT now())',
        ['audit_logs.id:bigint:NO:', 'audit_logs.admin_id:text:NO:', 'audit_logs.action:text:NO:', 'audit_logs.target_id:text:YES:', 'audit_logs.created_at:timestamp with time zone:NO:now()'].every(c => addedCols.some(a => a.startsWith(c.replace(/:$/, '')))), JSON.stringify(addedCols.filter(c => c.startsWith('audit_logs'))));
      check('adds exactly those columns — nothing else (no other table touched)', addedCols.every(c => /^(reports\.type|users\.deletion_scheduled_at|audit_logs\.)/.test(c)) && addedCols.length === 7, JSON.stringify(addedCols));
      check('removes/renames no column, drops no index', removedCols.length === 0 && removedIdx.length === 0, JSON.stringify({ removedCols, removedIdx }));
      check('adds only indexes on audit_logs and users.deletion_scheduled_at', addedIdx.length >= 2 && addedIdx.every(i => /ON public\.audit_logs|ON public\.users .*deletion_scheduled_at/.test(i)), JSON.stringify(addedIdx));
      check('an index serves the newest-first read (audit_logs by created_at DESC)', addedIdx.some(i => /audit_logs .*\(created_at DESC/.test(i)), JSON.stringify(addedIdx));
      check('existing rows are byte-for-byte unchanged (counts + data; old report has type NULL)', JSON.stringify(before.rows) === JSON.stringify(after.rows) && (await ddlPool.query(`SELECT type FROM reports WHERE id='old_r'`)).rows[0].type === null && (await ddlPool.query(`SELECT deletion_scheduled_at FROM users WHERE id='old_u'`)).rows[0].deletion_scheduled_at === null);
      let again = null; try { await ddlPool.query(sql); } catch (e) { again = e; }
      const afterTwice = await snap();
      check('idempotent: applying it a second time succeeds and changes nothing', again === null && JSON.stringify(afterTwice.cols) === JSON.stringify(after.cols) && JSON.stringify(afterTwice.idx) === JSON.stringify(after.idx) && afterTwice.data === after.data, again && again.message);
      check('audit_logs has row-level security enabled (like every other table)', (await ddlPool.query(`SELECT relrowsecurity FROM pg_class WHERE relname='audit_logs'`)).rows[0].relrowsecurity === true);
    }

    // ════════ FUNCTIONAL: server + real Postgres ════════
    await pool.query(BASELINE);
    if (MIGRATION) await pool.query(fs.readFileSync(MIGRATION, 'utf8'));
    const hasDeletionCol = await hasCol('users', 'deletion_scheduled_at');
    const past19m = new Date(Date.now() - 19 * MONTH).toISOString();
    await mkUser('admin1', { role: 'admin' }); await mkUser('reporter'); await mkUser('victim'); await mkUser('victim2'); await mkUser('leaver'); await mkUser('rep_social');
    // retention cast (disposable local rows only)
    await mkUser('r1_inactive', { last_active: past19m });                 // -> must be scheduled + warned once
    await mkUser('r2_active');                                             // -> untouched
    await mkUser('r3_admin_inactive', { role: 'admin', last_active: past19m });   // -> untouched (admins are exempt)
    await mkUser('r6_never_seen', { last_active: null });                  // -> untouched
    if (hasDeletionCol) {
      await mkUser('r4_due', { last_active: past19m });       await q(`UPDATE users SET deletion_scheduled_at = now() - interval '1 day' WHERE id='r4_due'`);       // -> anonymized
      await mkUser('r5_future', { last_active: past19m });    await q(`UPDATE users SET deletion_scheduled_at = now() + interval '10 days' WHERE id='r5_future'`);   // -> untouched
      await mkUser('r7_returned');                            await q(`UPDATE users SET deletion_scheduled_at = now() - interval '1 day' WHERE id='r7_returned'`);   // INFO only (see report)
    }
    const admin = tok('admin1'), reporter = tok('reporter'), repSocial = tok('rep_social'), leaver = tok('leaver');

    console.log('\n=== boot #1 (schema as configured) ===');
    let s = await boot();
    check('server booted', s.up(), s.logs().slice(-300));
    await sleep(hasDeletionCol ? 0 : 4000);

    console.log('\n--- A6a: reports.type ---');
    const rFraud = await s.call('POST', '/api/report/illegal-content', { token: reporter, body: { targetId: 'victim', category: 'Fraud', description: 'scam listing' } });
    const rHate  = await s.call('POST', '/api/report/illegal-content', { token: reporter, body: { targetId: 'victim2', category: 'Hate Speech', description: 'abusive' } });
    const rBadCat = await s.call('POST', '/api/report/illegal-content', { token: reporter, body: { targetId: 'victim', category: 'Not A Category' } });
    const rNoTarget = await s.call('POST', '/api/report/illegal-content', { token: reporter, body: { category: 'Fraud' } });
    const rows = (await q(`SELECT * FROM reports WHERE from_user='reporter' ORDER BY created_at`)).rows;
    check('valid report -> 200 "Report received"', rFraud.status === 200 && rFraud.body?.ok === true, JSON.stringify(rFraud));
    check('...and it is PERSISTED (the success response corresponds to a durable row)', rows.some(r => r.target_id === 'victim' && r.reason === '[DSA:Fraud] scam listing'), `rows=${rows.length}`);
    check("...with type = 'illegal_content' persisted", rows.length >= 1 && rows.every(r => r.type === 'illegal_content'), JSON.stringify(rows.map(r => r.type)));
    check('second valid report (Hate Speech) is 200 and persisted too', rHate.status === 200 && rows.some(r => r.target_id === 'victim2' && r.reason.startsWith('[DSA:Hate Speech]')), JSON.stringify(rHate));
    check('invalid category -> 400 with the category list (unchanged)', rBadCat.status === 400 && Array.isArray(rBadCat.body?.categories), JSON.stringify(rBadCat));
    check('missing targetId -> 400 (unchanged)', rNoTarget.status === 400, JSON.stringify(rNoTarget));
    check('rejected requests stored nothing', rows.length === 2, `rows=${rows.length}`);
    const social1 = await s.call('POST', '/api/report', { token: repSocial, body: { targetId: 'victim', reason: 'rude' } });
    const social2 = await s.call('POST', '/api/report', { token: repSocial, body: { targetId: 'victim', reason: 'rude again' } });
    const socialType = (await hasCol('reports', 'type')) ? (await one(`SELECT type FROM reports WHERE from_user='rep_social'`)).type : undefined;   // undefined while the column does not exist
    // A22: POST /api/report no longer writes trust_score directly - stays at mkUser's default of 40.
    check('existing social report unchanged: 200, stored WITHOUT a type (NULL), trust_score untouched (A22)', social1.status === 200 && socialType === null && (await one(`SELECT trust_score FROM users WHERE id='victim'`)).trust_score === 40, JSON.stringify({ status: social1.status, socialType }));
    check('existing social-report dedupe unchanged: second report of the same target -> 400', social2.status === 400, JSON.stringify(social2));
    const dsa = await s.call('GET', '/api/admin/dsa-report', { token: admin });
    check('admin DSA report: sees both illegal-content reports with their targets', dsa.status === 200 && dsa.body?.illegal_content_reports === 2 && (dsa.body?.report_log || []).map(r => r.target_id).sort().join() === 'victim,victim2', JSON.stringify(dsa.body).slice(0, 200));
    check('admin DSA report: category breakdown is right', dsa.body?.illegal_content_by_category?.Fraud === 1 && dsa.body?.illegal_content_by_category?.['Hate Speech'] === 1, JSON.stringify(dsa.body?.illegal_content_by_category));
    check('admin DSA report: the NULL-type social report is counted as social (not silently dropped)', dsa.body?.social_reports === 1, `social_reports=${dsa.body?.social_reports}`);

    console.log('\n--- A6b: audit_logs ---');
    const ban = await s.call('POST', '/api/admin/ban', { token: admin, body: { targetId: 'victim', banned: true } });
    await sleep(150);
    const unban = await s.call('POST', '/api/admin/ban', { token: admin, body: { targetId: 'victim', banned: false } });
    await sleep(150);
    const ver = await s.call('POST', '/api/admin/verify', { token: admin, body: { targetId: 'victim2' } });
    await sleep(150);
    const upg = await s.call('POST', '/api/admin/upgrade', { token: admin, body: { targetId: 'victim2', premium: true } });
    const leave = await s.call('DELETE', '/api/me', { token: leaver });
    const auditRows = (await hasTable('audit_logs')) ? (await q(`SELECT * FROM audit_logs ORDER BY id`)).rows : [];
    check('admin actions succeed (ban, unban, verify, upgrade) and self-delete succeeds', [ban, unban, ver, upg, leave].every(r => r.status === 200), JSON.stringify([ban.status, unban.status, ver.status, upg.status, leave.status]));
    check('every action left a PERSISTED audit row: ban, unban, verify, grant_premium, self_delete', ['ban', 'unban', 'verify', 'grant_premium', 'self_delete'].every(a => auditRows.some(r => r.action === a)), JSON.stringify(auditRows.map(r => r.action)));
    check('audit rows carry the right fields (admin_id, target_id, created_at)', auditRows.some(r => r.action === 'ban' && r.admin_id === 'admin1' && r.target_id === 'victim' && !!r.created_at) && auditRows.some(r => r.action === 'self_delete' && r.admin_id === 'leaver' && r.target_id === 'leaver'), JSON.stringify(auditRows.slice(0, 2)));
    const audit1 = await s.call('GET', '/api/admin/audit', { token: admin });
    check('GET /api/admin/audit -> 200, newest first, same shape as before {adminId, action, targetId, at}', audit1.status === 200 && Array.isArray(audit1.body) && audit1.body[0]?.action === 'self_delete' && audit1.body[1]?.action === 'grant_premium' && ['adminId', 'action', 'targetId', 'at'].every(k => k in (audit1.body[0] || {})), JSON.stringify(audit1.body).slice(0, 240));
    // pagination / ordering: 210 more, older rows -> the endpoint returns exactly the 200 newest, strictly newest-first
    if (await hasTable('audit_logs')) {
      await q(`INSERT INTO audit_logs (admin_id, action, target_id, created_at) SELECT 'admin1', 'bulk', 'bulk_' || g, now() - (g || ' hours')::interval FROM generate_series(1, 210) g`);
      await q(`INSERT INTO audit_logs (admin_id, action, target_id, created_at) VALUES ('admin1','tie_a','t', '2030-01-01T00:00:00Z'), ('admin1','tie_b','t', '2030-01-01T00:00:00Z')`);   // identical timestamps -> tie-break by id
    }
    const audit2 = await s.call('GET', '/api/admin/audit', { token: admin });
    const times = (audit2.body || []).map(e => new Date(e.at).getTime());
    check('with 200+ rows: returns exactly the 200 newest', audit2.status === 200 && audit2.body?.length === 200, `len=${audit2.body?.length}`);
    check('...strictly newest-first (non-increasing timestamps)', times.length === 200 && times.every((t, i) => i === 0 || times[i - 1] >= t));
    check('...identical timestamps are ordered deterministically (later insert first)', audit2.body?.[0]?.action === 'tie_b' && audit2.body?.[1]?.action === 'tie_a', JSON.stringify(audit2.body?.slice(0, 2)));
    check('...the real events are in the window; the oldest bulk rows are cut off', (audit2.body || []).some(e => e.action === 'ban') && !(audit2.body || []).some(e => e.targetId === 'bulk_210'));

    console.log('\n--- A6c: retention job (runs at boot against disposable local rows) ---');
    const scheduled = await waitFor(async () => (hasDeletionCol && (await one(`SELECT deletion_scheduled_at FROM users WHERE id='r1_inactive'`)).deletion_scheduled_at) || null, hasDeletionCol ? 20000 : 3000);
    const st = async id => hasDeletionCol ? one(`SELECT id, email, name, deleted_at, deletion_scheduled_at FROM users WHERE id=$1`, [id]) : one(`SELECT id, email, name, deleted_at FROM users WHERE id=$1`, [id]);
    const r1 = await st('r1_inactive');
    const daysAhead = scheduled ? (new Date(scheduled).getTime() - Date.now()) / 864e5 : null;
    check('the retention job can operate: inactive account was SCHEDULED (deletion_scheduled_at ~ now + 30 days)', !!scheduled && Math.abs(daysAhead - 30) < 0.5, `scheduled=${scheduled}`);
    check('...and got exactly one warning e-mail', emailsTo('r1_inactive@example.test') === 1, `emails=${emailsTo('r1_inactive@example.test')}`);
    check('...but was NOT deleted (still within its 30-day notice)', r1.deleted_at === null && r1.name === 'Test User');
    for (const id of ['r2_active', 'r3_admin_inactive', 'r6_never_seen']) {
      const r = await st(id);
      check(`unaffected: ${id} (not scheduled, not deleted, no e-mail)`, r.deleted_at === null && (r.deletion_scheduled_at ?? null) === null && emailsTo(`${id}@example.test`) === 0, JSON.stringify(r));
    }
    if (hasDeletionCol) {
      await waitFor(async () => (await st('r4_due')).deleted_at, 15000);
      const r4 = await st('r4_due'), r5 = await st('r5_future');
      check('scheduled + past its date (r4): eligible per the existing logic -> anonymized', !!r4.deleted_at && r4.name === 'Deleted User' && /^deleted-r4_due@/.test(r4.email), JSON.stringify(r4));
      check('scheduled but not yet due (r5): untouched, no e-mail', r5.deleted_at === null && r5.name === 'Test User' && emailsTo('r5_future@example.test') === 0, JSON.stringify(r5));
      check('the "Warned/Deleted" summary is logged', /\[Retention\] Warned: 1, Deleted: (1|2)/.test(s.logs()), s.logs().split('\n').filter(l => /Retention/.test(l)).join(' | '));
      const r7 = await st('r7_returned');
      console.log(`  INFO  (existing logic, not changed here) an account scheduled for deletion that has since become ACTIVE again (r7): deleted=${!!r7.deleted_at}`);
    }

    console.log('\n=== boot #2: restart (audit history must survive; retention must be idempotent) ===');
    await s.stop(); s = await boot();
    check('server booted again', s.up(), s.logs().slice(-300));
    const audit3 = await s.call('GET', '/api/admin/audit', { token: admin });
    check('audit history SURVIVES the restart (the ban/verify/upgrade events are still served)', audit3.status === 200 && ['ban', 'unban', 'verify', 'grant_premium', 'self_delete'].every(a => (audit3.body || []).some(e => e.action === a)), `status=${audit3.status} actions=${(audit3.body || []).slice(0, 8).map(e => e.action)}`);
    await sleep(hasDeletionCol ? 4000 : 0);
    check('retention is idempotent: the restart did not warn the same account again', emailsTo('r1_inactive@example.test') === (hasDeletionCol ? 1 : 0), `emails=${emailsTo('r1_inactive@example.test')}`);
    await s.stop();

    console.log('\n=== boot #3: schema MISALIGNED (the objects are missing) — failures must be loud, not "ok" ===');
    await mkUser('r8_inactive', { last_active: past19m }); await mkUser('victim3'); await mkUser('leaver2');
    await pool.query(REVERT);
    s = await boot();
    check('server booted against the misaligned schema', s.up(), s.logs().slice(-300));
    const bad1 = await s.call('POST', '/api/report/illegal-content', { token: reporter, body: { targetId: 'victim3', category: 'CSAM', description: 'x' } });
    check('illegal-content report whose INSERT fails -> 5xx with a clear error, NOT "Report received"', bad1.status >= 500 && bad1.body?.ok !== true && bad1.body?.code === 'REPORT_NOT_PERSISTED', JSON.stringify(bad1));
    check('...and no side effect ran for an unrecorded report (target NOT auto-banned)', (await one(`SELECT banned FROM users WHERE id='victim3'`)).banned === false);
    const bad2 = await s.call('GET', '/api/admin/dsa-report', { token: admin });
    check('admin DSA report against a broken schema -> 5xx, not a 200 full of zeros', bad2.status >= 500, JSON.stringify(bad2).slice(0, 200));
    const bad3 = await s.call('POST', '/api/admin/ban', { token: admin, body: { targetId: 'victim3', banned: true } });
    check('admin action whose audit row cannot be persisted -> 5xx AUDIT_PERSIST_FAILED (not a silent "ok")', bad3.status >= 500 && bad3.body?.code === 'AUDIT_PERSIST_FAILED' && bad3.body?.ok !== true, JSON.stringify(bad3));
    check('...the response says the action itself WAS applied (so the admin is not misled either way)', (await one(`SELECT banned FROM users WHERE id='victim3'`)).banned === true && /applied/i.test(bad3.body?.error || ''), JSON.stringify(bad3.body));
    const bad4 = await s.call('GET', '/api/admin/audit', { token: admin });
    check('GET /api/admin/audit with no table -> 5xx (no more silently serving a partial in-memory list)', bad4.status >= 500, JSON.stringify(bad4).slice(0, 200));
    const leave2 = await s.call('DELETE', '/api/me', { token: tok('leaver2') });
    check("a user's own erasure still succeeds even if its audit row cannot be written (legal obligation first)...", leave2.status === 200 && (await one(`SELECT deleted_at FROM users WHERE id='leaver2'`)).deleted_at !== null, JSON.stringify(leave2));
    check('...but the failed audit write is logged loudly, not swallowed', /\[audit\][^\n]*(persist|FAILED)/i.test(s.logs()) && /audit_logs/.test(s.logs()), s.logs().split('\n').filter(l => /audit/i.test(l)).slice(0, 3).join(' | '));
    await sleep(4000);
    check('retention against a schema without the column: logs a CLEAR error naming it (was: silent)', /\[Retention\][^\n]*deletion_scheduled_at/.test(s.logs()), s.logs().split('\n').filter(l => /Retention/.test(l)).join(' | ') || '(nothing logged)');
    check('...and takes no destructive action: no e-mail, nothing anonymized', emailsTo('r8_inactive@example.test') === 0 && (await one(`SELECT deleted_at FROM users WHERE id='r8_inactive'`)).deleted_at === null);
    await s.stop();
  } finally {
    try { await pool.end(); await ddlPool.end(); } catch {}
    await new Promise(r => translator.close(r));
    try { await epg.stop(); } catch {}
    await sleep(500);
    for (const d of [dbDir, shared]) { try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch { /* temp only */ } }
  }

  console.log(`\n=== RESULTS: ${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('SCRIPT ERROR', e); process.exit(1); });
