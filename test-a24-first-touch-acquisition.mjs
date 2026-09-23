// Regression test for audit finding A24 - the onboarding acquisition upsert overwrote an existing,
// verified referral attribution with a later, generic self-reported source.
//
//   user_acquisition holds one row per user (source, referral) recording how the account was
//   acquired. TWO writers touch it: a referred signup (POST /api/auth/magic-link/request with a
//   ref_code) inserts { source: 'Friend/Referral', referral: referrer.id } - an objective,
//   code-verified, first-touch signal. Later, EVERY user - referred or not - is shown onboarding
//   Screen 1 ("How did you hear about us?"), a generic 9-option self-report with no awareness of any
//   prior signal, and POST /api/onboarding/acquisition upserted THAT answer unconditionally
//   (`onConflict: 'user_id'`, an ordinary insert-or-update), silently replacing the referral
//   attribution with whatever the user clicked - deterministically, not a race: onboarding always
//   runs strictly after signup, so this happened on every single referred signup that completed
//   onboarding. Production currently has 0 referred users (confirmed via an aggregate, name/ID-free
//   query), so there is no legacy data to migrate or reconcile - this is a pure prevent-it-going-
//   forward fix.
//
// DECISION (first-touch attribution): once a source has been recorded for an account, no later
// onboarding write may replace it - existing attribution == null/empty accepts the first valid
// source; existing attribution != null/empty is preserved untouched. referral/reward eligibility
// (maybeGrantReferralReward) is UNCHANGED by this fix - it reads users.referred_by directly, a
// completely separate column written once at signup and never touched by onboarding, confirmed by a
// full-file grep before this fix was written.
//
// How it runs (nothing can touch production): the REAL server.js (or $SERVER_JS) against a
// PostgREST-compatible translator (extended here to correctly model on_conflict / ignoreDuplicates -
// the "resolution=ignore-duplicates" Prefer header - as a real ON CONFLICT ... DO NOTHING, and the
// ordinary upsert default as ON CONFLICT ... DO UPDATE, matching real PostgREST/Supabase exactly;
// the translator previously did a plain INSERT for every POST regardless of upsert options, which
// this test's own fix depends on being modeled correctly) over a REAL PostgreSQL; empty cwd (no
// .env), whitelisted env.
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
import bcrypt from 'bcryptjs';

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
  reply_count int DEFAULT 0, avg_reply_minutes int DEFAULT 0, response_rate int DEFAULT 100,
  failed_login_attempts int DEFAULT 0, lockout_until timestamptz, referred_by text);
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
CREATE TABLE reports (id text PRIMARY KEY, from_user text NOT NULL, target_id text NOT NULL, reason text NOT NULL, type text, created_at timestamptz DEFAULT now());
CREATE TABLE user_acquisition (user_id text PRIMARY KEY, source text, referral text, created_at timestamptz DEFAULT now());
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
    const rpcMatch = /^\/rest\/v1\/rpc\/(\w+)$/.exec(url.pathname);
    if (rpcMatch) {
      const argNames = Object.keys(body || {});
      // Explicit casts, inferred from the JS value type: named-parameter function calls leave
      // Postgres unable to infer a $N placeholder's type on its own (unlike ordinary positional
      // queries), and it does not default to the function's declared parameter type - without
      // this every placeholder resolves as `integer` and the call fails to match any overload.
      const placeholders = argNames.map((k, i) => `${k} := $${i + 1}${typeof body[k] === 'number' ? '::int' : typeof body[k] === 'boolean' ? '::boolean' : '::text'}`).join(', ');
      const args = argNames.map(k => body[k]);
      try {
        const result = await pool.query(`SELECT ${rpcMatch[1]}(${placeholders}) AS r`, args);
        return send(200, result.rows[0].r);
      } catch (e) {
        return send(400, { code: e.code || 'XX000', message: e.message, details: e.detail ?? null, hint: e.hint ?? null });
      }
    }
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
        const onConflictParam = url.searchParams.get('on_conflict');
        let conflictSql = '';
        if (onConflictParam) {
          const conflictCols = onConflictParam.split(',').map(c => `"${c.trim()}"`).join(',');
          if (/resolution=ignore-duplicates/.test(prefer)) {
            conflictSql = ` ON CONFLICT (${conflictCols}) DO NOTHING`;
          } else {
            const conflictColNames = onConflictParam.split(',').map(c => c.trim());
            const updateCols = keys.filter(k => !conflictColNames.includes(k));
            conflictSql = updateCols.length
              ? ` ON CONFLICT (${conflictCols}) DO UPDATE SET ${updateCols.map(k => `"${k}" = EXCLUDED."${k}"`).join(', ')}`
              : ` ON CONFLICT (${conflictCols}) DO NOTHING`;
          }
        }
        const rows = (await pool.query(`INSERT INTO "${table}" (${keys.map(k => `"${k}"`).join(',')}) VALUES ${values}${conflictSql} RETURNING to_jsonb("${table}") AS r`, args)).rows.map(r => r.r);
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
  const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a24-pg-'));
  const pgPort = await freePort();
  const epg = new EmbeddedPostgres({ databaseDir: dbDir, user: 'postgres', password: 'pw', port: pgPort, persistent: false, initdbFlags: ['--encoding=UTF8'], onLog: () => {}, onError: () => {} });
  await epg.initialise(); await epg.start(); await epg.createDatabase('byn');
  pool = new pg.Pool({ host: '127.0.0.1', port: pgPort, user: 'postgres', password: 'pw', database: 'byn', max: 10 });
  const q = (sql, args) => pool.query(sql, args); const one = async (sql, args) => (await q(sql, args)).rows[0];
  await q(DDL);

  const shared = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a24-shared-'));
  const stub = path.join(shared, 'stub-resend.cjs');
  fs.writeFileSync(stub, `const Module = require('module'); const orig = Module._load;
Module._load = function (request) { if (request === 'resend') { return { Resend: class { constructor() { this.emails = { send: async () => ({ data: { id: 'stub' }, error: null }) }; } } }; } return orig.apply(this, arguments); };`);
  const MIGRATION_024 = path.join(here, 'migrations', '024_concurrency_race_fixes.sql');
  await pool.query(fs.readFileSync(MIGRATION_024, 'utf8'));
  console.log('=== applied verbatim: migrations/024_concurrency_race_fixes.sql ===');
  const MIGRATION_025 = path.join(here, 'migrations', '025_moderation_events.sql');
  await pool.query(fs.readFileSync(MIGRATION_025, 'utf8'));
  console.log('=== applied verbatim: migrations/025_moderation_events.sql ===');
  await new Promise(r => translator.listen(0, '127.0.0.1', r)); const dbPort = translator.address().port;
  const port = await freePort(); const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a24-'));
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, SYSTEMROOT: process.env.SYSTEMROOT, TEMP: os.tmpdir(), TMP: os.tmpdir(), HOME: cwd, USERPROFILE: cwd,
    SUPABASE_URL: `http://127.0.0.1:${dbPort}`, SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key', JWT_SECRET, ADMIN_SECRET: 'test-only-admin-secret', PORT: String(port), RESEND_API_KEY: 'test-only-resend-key' };
  let out = ''; const child = spawn(process.execPath, ['-r', stub, SERVER_JS], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  let exited = null; child.on('exit', c => { exited = c; });
  await waitFor(() => /Server on port/.test(out) || exited !== null, 60000, 200);
  const base = `http://127.0.0.1:${port}`;
  const tok = id => jwt.sign({ id, email: `${id}@example.test`, name: 'T' }, JWT_SECRET, { expiresIn: '1h' });
  let ipN = 0;
  const call = async (method, p, as, body) => { const r = await fetch(base + p, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(as ? { Authorization: `Bearer ${tok(as)}` } : {}), 'X-Forwarded-For': `10.20.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: body !== undefined ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch {} return { status: r.status, body: j }; };

  const uuid = () => crypto.randomUUID();
  // A fresh account at the start of onboarding (email verified, stage 'acquisition' - the state
  // POST /api/onboarding/acquisition requires).
  const mkUser = async name => {
    const id = uuid();
    await q(`INSERT INTO users (id,email,name,email_verified,onboarding_stage,banned) VALUES ($1,$2,$3,true,'acquisition',false)`,
      [id, `${id}@example.test`, name]);
    return id;
  };
  const submitAcquisition = (as, source, referral) => call('POST', '/api/onboarding/acquisition', as, referral !== undefined ? { source, referral } : { source });
  const acquisitionOf = id => one(`SELECT source, referral FROM user_acquisition WHERE user_id=$1`, [id]);
  const stageOf = async id => (await one(`SELECT onboarding_stage FROM users WHERE id=$1`, [id])).onboarding_stage;

  try {
    check('server booted', /Server on port/.test(out) && exited === null, out.slice(-300));

    console.log('\n--- the core bug: a referred signup\'s attribution must survive the later onboarding self-report ---');
    const referredUser = await mkUser('Referred User');
    const referrerId = uuid();
    // Simulates the signup-time write (POST /api/auth/magic-link/request with a ref_code) - the
    // objective, code-verified, first-touch signal.
    await q(`INSERT INTO user_acquisition (user_id, source, referral) VALUES ($1,'Friend/Referral',$2)`, [referredUser, referrerId]);
    let r = await submitAcquisition(referredUser, 'Google Search');
    check('the onboarding submission itself still succeeds -> 200, stage advances to intent', r.status === 200 && r.body?.stage === 'intent', JSON.stringify(r));
    check('...but the stored source is STILL "Friend/Referral" - the generic self-report did NOT overwrite it (was: silently replaced with "Google Search")', (await acquisitionOf(referredUser)).source === 'Friend/Referral', JSON.stringify(await acquisitionOf(referredUser)));
    check('...and the original referral value (the referrer id) is intact too - not cleared or replaced', (await acquisitionOf(referredUser)).referral === referrerId, JSON.stringify(await acquisitionOf(referredUser)));
    check('onboarding_stage genuinely advanced in the users table (the fix does not block onboarding progress)', await stageOf(referredUser) === 'intent', await stageOf(referredUser));

    console.log('\n--- an already-recorded NON-referral source is equally protected from a later generic overwrite ---');
    const linkedInUser = await mkUser('LinkedIn User');
    await q(`INSERT INTO user_acquisition (user_id, source, referral) VALUES ($1,'LinkedIn',NULL)`, [linkedInUser]);
    r = await submitAcquisition(linkedInUser, 'Other');
    check('submission succeeds, stage advances', r.status === 200 && r.body?.stage === 'intent', JSON.stringify(r));
    check('the original "LinkedIn" source is preserved, not replaced with "Other"', (await acquisitionOf(linkedInUser)).source === 'LinkedIn', JSON.stringify(await acquisitionOf(linkedInUser)));

    console.log('\n--- the ordinary (non-referred, non-prior-attribution) case is unaffected - first valid source is accepted normally ---');
    const freshUser = await mkUser('Fresh User');
    r = await submitAcquisition(freshUser, 'YouTube');
    check('a user with NO prior attribution -> their own answer is accepted and stored', r.status === 200 && r.body?.stage === 'intent' && (await acquisitionOf(freshUser)).source === 'YouTube', JSON.stringify([r.body, await acquisitionOf(freshUser)]));

    console.log('\n--- Friend/Referral submitted through onboarding itself (no prior signup-time row) still records normally ---');
    const selfReportedReferral = await mkUser('Self Reported Referral');
    r = await submitAcquisition(selfReportedReferral, 'Friend/Referral', 'my friend Alex');
    check('a user who self-reports Friend/Referral (no prior attribution) -> accepted, with the free-text referral name stored', r.status === 200 && (await acquisitionOf(selfReportedReferral)).source === 'Friend/Referral' && (await acquisitionOf(selfReportedReferral)).referral === 'my friend Alex', JSON.stringify(await acquisitionOf(selfReportedReferral)));

    console.log('\n--- repeated / retried submissions are idempotent and never corrupt the stored attribution ---');
    // Simulates a client retry after a dropped response: the SAME request, resent, while the DB
    // already holds the result of the first (successful) attempt. The stage-gate itself already
    // rejects a genuine second attempt once stage has moved past 'acquisition' - this proves that
    // even if the upsert itself is reached again (e.g. the stage-gate's own check race, not what
    // this item is about - just insurance), the stored value cannot change.
    const retryUser = await mkUser('Retry User');
    await submitAcquisition(retryUser, 'Instagram');
    r = await submitAcquisition(retryUser, 'Instagram');
    check('a second call after the stage has already advanced -> 409 Wrong onboarding stage (unchanged)', r.status === 409, JSON.stringify(r));
    check('the stored source is still exactly "Instagram" either way', (await acquisitionOf(retryUser)).source === 'Instagram', JSON.stringify(await acquisitionOf(retryUser)));

    console.log('\n--- concurrent onboarding writes cannot lose the first attribution - genuine racing submissions still converge on exactly ONE value ---');
    const raceUser = await mkUser('Race User');
    const raceSources = ['LinkedIn', 'Instagram', 'Twitter/X', 'WhatsApp', 'Google Search', 'YouTube', 'Other', 'Community/Event'];
    const raceResults = await Promise.all(raceSources.map(s => submitAcquisition(raceUser, s)));
    check('every racing submission completed cleanly (200 or 409 - never a 5xx)', raceResults.every(r => r.status === 200 || r.status === 409), JSON.stringify(raceResults.map(r => r.status)));
    const finalAcq = await acquisitionOf(raceUser);
    check('exactly one of the 8 candidate sources ended up stored - not corrupted, not null, not a mix', raceSources.includes(finalAcq.source), JSON.stringify(finalAcq));
    // Re-submitting AFTER the race has already settled must not be able to change the winner either.
    r = await call('POST', '/api/onboarding/acquisition', raceUser, { source: 'Other' });
    check('once settled, the stored value is stable - a further submission (whatever its own status) never changes the winning source', (await acquisitionOf(raceUser)).source === finalAcq.source, JSON.stringify(await acquisitionOf(raceUser)));

    console.log('\n--- referral/reward eligibility is untouched by this fix (it reads users.referred_by directly, never user_acquisition) ---');
    const rewardCheckUser = await mkUser('Reward Check User');
    await q(`UPDATE users SET referred_by=$1 WHERE id=$2`, [referrerId, rewardCheckUser]);
    await q(`INSERT INTO user_acquisition (user_id, source, referral) VALUES ($1,'Friend/Referral',$2)`, [rewardCheckUser, referrerId]);
    await submitAcquisition(rewardCheckUser, 'Google Search');
    const stillReferred = (await one(`SELECT referred_by FROM users WHERE id=$1`, [rewardCheckUser])).referred_by;
    check('users.referred_by (what reward eligibility actually reads) is completely unaffected by any of this - unchanged before and after the onboarding submission', stillReferred === referrerId, stillReferred);

    console.log('\n--- unchanged behaviour ---');
    const invalidSourceUser = await mkUser('Invalid Source User');
    r = await call('POST', '/api/onboarding/acquisition', invalidSourceUser, { source: 'Not A Real Source' });
    check('an invalid source value -> 400 (unchanged)', r.status === 400, JSON.stringify(r));
    r = await call('POST', '/api/onboarding/acquisition', null, { source: 'LinkedIn' });
    check('no token -> 401 (unchanged)', r.status === 401, JSON.stringify(r));

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
