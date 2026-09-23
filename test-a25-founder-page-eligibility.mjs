// Regression test for audit finding A25 - GET /founders/:id (a public, unauthenticated, crawlable SEO
// page) gated only on `profile_score >= 60`, `trust_score >= 10` and `banned` - never on `deleted_at`,
// `email_verified` or `onboarding_stage`, none of which PROFILE_PUBLIC_FIELDS even selected.
//
//   anonymizeUser() (the soft-delete function) blanks bio/photos/skills/interests/location and sets
//   name:'Deleted User', but never touches profile_score or trust_score - so a deleted account that
//   had profile_score >= 60 before deletion keeps that stale value forever, clears the gate, and gets
//   a 200 page rendering "Deleted User - Startup Founder in India" with no photo/bio, unconditionally
//   marked <meta name="robots" content="index, follow, max-snippet:-1">. An unverified or onboarding-
//   incomplete account can equally clear profile_score >= 60 (a function of filled-in fields, unrelated
//   to verification) and get an identical 200, indexable page, despite not meeting BYN's own locked
//   "active user" definition (isActiveUser: email_verified && onboarding_stage==='complete') enforced
//   everywhere else in the product.
//
//   Production data (72 currently eligible under the old rule) showed isActiveUser() alone would only
//   catch 3 of the 5 affected accounts - the 2 deleted ones remain "active" under it, since deletion
//   never resets email_verified/onboarding_stage. deleted_at must be an independent condition, not
//   assumed covered by an active-user check.
//
// DECISION: one strict predicate, all five conditions required; every failure - nonexistent, malformed,
// unverified, incomplete, deleted, banned, or below either score threshold - is externally IDENTICAL:
// a plain 404 with no page body, no canonical tag, nothing indexable. "Does not exist" and "exists but
// ineligible" must not be distinguishable from the outside. The 70 + photo threshold from A13 is a
// SEPARATE, unrelated rule (profileGuard/onboarding completion) - this keeps the founder-specific 60
// threshold exactly as it was; no threshold is raised, no photo requirement is added. Indexing/SEO
// expansion (sitemap entries, internal links) is explicitly out of scope - this only proves the
// existing "not in the sitemap, not linked from anywhere" state is unchanged by this fix.
//
// How it runs (nothing can touch production): the REAL server.js (or $SERVER_JS) against a
// PostgREST-compatible translator over a REAL PostgreSQL (embedded-postgres, UTF-8); empty cwd (no
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
  const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a25-pg-'));
  const pgPort = await freePort();
  const epg = new EmbeddedPostgres({ databaseDir: dbDir, user: 'postgres', password: 'pw', port: pgPort, persistent: false, initdbFlags: ['--encoding=UTF8'], onLog: () => {}, onError: () => {} });
  await epg.initialise(); await epg.start(); await epg.createDatabase('byn');
  pool = new pg.Pool({ host: '127.0.0.1', port: pgPort, user: 'postgres', password: 'pw', database: 'byn', max: 10 });
  const q = (sql, args) => pool.query(sql, args); const one = async (sql, args) => (await q(sql, args)).rows[0];
  await q(DDL);

  const shared = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a25-shared-'));
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
  const port = await freePort(); const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a25-'));
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, SYSTEMROOT: process.env.SYSTEMROOT, TEMP: os.tmpdir(), TMP: os.tmpdir(), HOME: cwd, USERPROFILE: cwd,
    SUPABASE_URL: `http://127.0.0.1:${dbPort}`, SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key', JWT_SECRET, ADMIN_SECRET: 'test-only-admin-secret', PORT: String(port), RESEND_API_KEY: 'test-only-resend-key' };
  let out = ''; const child = spawn(process.execPath, ['-r', stub, SERVER_JS], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  let exited = null; child.on('exit', c => { exited = c; });
  await waitFor(() => /Server on port/.test(out) || exited !== null, 60000, 200);
  const base = `http://127.0.0.1:${port}`;
  const tok = id => jwt.sign({ id, email: `${id}@example.test`, name: 'T' }, JWT_SECRET, { expiresIn: '1h' });
  let ipN = 0;
  const call = async (method, p, as, body) => { const r = await fetch(base + p, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(as ? { Authorization: `Bearer ${tok(as)}` } : {}), 'X-Forwarded-For': `10.21.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: body !== undefined ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch {} return { status: r.status, body: j }; };

  const uuid = () => crypto.randomUUID();
  // A user with every dimension the A25 predicate checks independently overridable. Defaults are the
  // fully-eligible case; each test overrides exactly one dimension at a time.
  const mkUser = async (name, o = {}) => {
    const id = uuid();
    await q(`INSERT INTO users (id,email,name,bio,location,intent,photos,interests,skills,linkedin,
               profile_score,trust_score,banned,deleted_at,email_verified,onboarding_stage,last_active)
             VALUES ($1,$2,$3,'A complete biography text','Pune','explore-network','["1","2","3","4"]'::jsonb,'["ai"]'::jsonb,'["react"]'::jsonb,'https://linkedin.com/in/x',
               $4,$5,$6,$7,$8,$9,now())`,
      [id, `${id}@example.test`, name,
       o.profile_score ?? 70, o.trust_score ?? 20, o.banned ?? false, o.deleted_at ?? null,
       o.email_verified ?? true, o.onboarding_stage ?? 'complete']);
    return id;
  };
  // Raw (non-JSON) fetch - /founders/:id returns HTML on success and JSON on 404, so the JSON-parsing
  // `call` helper above can't inspect the 200 body; this one can, for the handful of checks that need to.
  const rawGet = async pathname => {
    const r = await fetch(base + pathname, { headers: { 'X-Forwarded-For': `10.21.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` } });
    const text = await r.text();
    return { status: r.status, contentType: r.headers.get('content-type') || '', text };
  };
  const founders = id => call('GET', `/founders/${id}`, null);

  try {
    check('server booted', /Server on port/.test(out) && exited === null, out.slice(-300));

    console.log('\n--- eligible: every condition satisfied -> 200, indexable page ---');
    const eligible = await mkUser('Eligible Founder');
    let r = await rawGet(`/founders/${eligible}`);
    check('a fully eligible profile -> 200, HTML', r.status === 200 && r.contentType.includes('text/html'), JSON.stringify([r.status, r.contentType]));
    check('the page is marked indexable and canonical to this id (unchanged behaviour for the eligible case)', r.text.includes('name="robots" content="index, follow') && r.text.includes(`/founders/${eligible}`) && r.text.includes('rel="canonical"'), r.text.slice(0, 50));

    console.log('\n--- the full ineligibility matrix - every one of these must be 404, none of them 200 ---');
    const cases = [
      ['unverified',            { email_verified: false }],
      ['onboarding incomplete', { onboarding_stage: 'profile' }],
      ['soft-deleted (the exact bug: high scores survive anonymizeUser)', { deleted_at: new Date().toISOString() }],
      ['banned',                { banned: true }],
      ['profile_score just under 60', { profile_score: 59 }],
      ['trust_score just under 10 (already-existing check, must stay)', { trust_score: 9 }],
    ];
    for (const [label, overrides] of cases) {
      const u = await mkUser(`Case ${label}`, overrides);
      const rr = await founders(u);
      check(`${label} -> 404`, rr.status === 404, JSON.stringify([label, rr.status, rr.body]));
    }
    r = await founders(uuid());   // well-formed UUID, no such row
    check('a nonexistent (but well-formed) id -> 404', r.status === 404, JSON.stringify(r));
    r = await founders('not-a-uuid-at-all');
    check('a malformed id -> 404 (no DB query even attempted, unchanged)', r.status === 404, JSON.stringify(r));

    console.log('\n--- "does not exist" and "exists but ineligible" must be externally IDENTICAL - no state leak ---');
    const deletedUser = await mkUser('Leaked State Check', { deleted_at: new Date().toISOString() });
    const bannedUser = await mkUser('Leaked State Check 2', { banned: true });
    const [rNonexistent, rDeleted, rBanned, rMalformed] = await Promise.all([
      founders(uuid()), founders(deletedUser), founders(bannedUser), founders('nope')
    ]);
    check('every ineligible/nonexistent case returns the exact same status and body shape - a caller cannot distinguish "never existed" from "exists but excluded"',
      [rNonexistent, rDeleted, rBanned, rMalformed].every(x => x.status === 404 && JSON.stringify(x.body) === JSON.stringify({ error: 'Not found' })),
      JSON.stringify([rNonexistent, rDeleted, rBanned, rMalformed]));
    const raw404 = await rawGet(`/founders/${deletedUser}`);
    check('a 404 response carries no HTML at all - no canonical tag, no robots meta, nothing indexable (it is a JSON error body)', raw404.contentType.includes('application/json') && !raw404.text.includes('canonical') && !raw404.text.includes('robots'), JSON.stringify([raw404.contentType, raw404.text.slice(0, 80)]));

    console.log('\n--- indexing/SEO expansion is explicitly out of scope - the sitemap is unaffected either way ---');
    const sm = await rawGet('/sitemap.xml');
    check('sitemap.xml still contains ZERO /founders/ entries - eligible or not, this fix does not start listing anyone (separate, later SEO work)', sm.status === 200 && !sm.text.includes('/founders/'), sm.text.includes('/founders/'));

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
