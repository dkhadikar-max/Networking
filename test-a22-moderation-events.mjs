// Regression test for audit finding A22 - trust_score conflated a stateless profile-quality value
// (calcTrust) with an attempted persistent moderation penalty (POST /api/report writing
// trust_score = stored - 10 directly). Seven other write paths (PUT /api/me, photo upload/reorder/
// delete, onboarding profile, the peer-review bonus, admin verify, and POST /api/login's
// unconditional "refresh scores" on every login) each recompute calcTrust() from scratch and
// overwrite the column, silently erasing any report penalty - and trustGuard/discoverGuard (the
// actual swipe/connect/discover/search eligibility gates) never read the stored column at all, so a
// penalty never affected the reported user's own eligibility regardless of how long it survived.
//
// DECISION (Option B, the smaller change): calcTrust()/trust_score keep their EXACT existing role,
// formula, thresholds (trustGuard >=20, discoverGuard >=10) and every write path, unchanged.
// profile_score/calcProfileScore (A13's onboarding-completion system) is untouched, a separate
// concern. The only change: trust_score stops receiving report penalties. Moderation standing
// becomes a new, independent, event-backed record (migrations/025's moderation_events) instead.
//
// A22's qualifying trigger (deliberately narrow - see migrations/025's header for what is
// out of scope: severity/category, a review queue, standing derivation, circles ranking, and the
// six pre-existing trust_score/calcTrust anomalies found in production, which are NOT report-linked
// and are explicitly NOT to be inferred into moderation events):
//   valid ordinary report AND review_count(user_reviews) >= 3 AND avg_rating < 3.0
//     -> exactly one moderation_event, snapshotting report_id / review_count / avg_rating at the
//        moment the report qualified (never recalculated in place afterwards).
// A report that does not meet that bar creates no event and touches nothing else automatically.
//
// Invariant enforced here: POST /api/report NEVER writes trust_score, under any circumstances,
// while every EXISTING calcTrust() write path (registration, profile edit, photo changes,
// onboarding, review bonus, admin verify, login) continues to write it exactly as before - this is
// as much a regression guard for what must NOT change as it is a test of what's new.
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
  failed_login_attempts int DEFAULT 0, lockout_until timestamptz);
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
  const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a22-pg-'));
  const pgPort = await freePort();
  const epg = new EmbeddedPostgres({ databaseDir: dbDir, user: 'postgres', password: 'pw', port: pgPort, persistent: false, initdbFlags: ['--encoding=UTF8'], onLog: () => {}, onError: () => {} });
  await epg.initialise(); await epg.start(); await epg.createDatabase('byn');
  pool = new pg.Pool({ host: '127.0.0.1', port: pgPort, user: 'postgres', password: 'pw', database: 'byn', max: 10 });
  const q = (sql, args) => pool.query(sql, args); const one = async (sql, args) => (await q(sql, args)).rows[0];
  await q(DDL);

  const shared = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a22-shared-'));
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
  const port = await freePort(); const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a22-'));
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, SYSTEMROOT: process.env.SYSTEMROOT, TEMP: os.tmpdir(), TMP: os.tmpdir(), HOME: cwd, USERPROFILE: cwd,
    SUPABASE_URL: `http://127.0.0.1:${dbPort}`, SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key', JWT_SECRET, ADMIN_SECRET: 'test-only-admin-secret', PORT: String(port), RESEND_API_KEY: 'test-only-resend-key' };
  let out = ''; const child = spawn(process.execPath, ['-r', stub, SERVER_JS], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  let exited = null; child.on('exit', c => { exited = c; });
  await waitFor(() => /Server on port/.test(out) || exited !== null, 60000, 200);
  const base = `http://127.0.0.1:${port}`;
  const tok = id => jwt.sign({ id, email: `${id}@example.test`, name: 'T' }, JWT_SECRET, { expiresIn: '1h' });
  let ipN = 0;
  const call = async (method, p, as, body) => { const r = await fetch(base + p, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(as ? { Authorization: `Bearer ${tok(as)}` } : {}), 'X-Forwarded-For': `10.18.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: body !== undefined ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch {} return { status: r.status, body: j }; };

  const uuid = () => crypto.randomUUID();
  // A bare account, enough to be a report target/reporter (POST /api/report only requires auth).
  const mkTarget = async name => {
    const id = uuid();
    await q(`INSERT INTO users (id,email,name,email_verified,onboarding_stage,banned) VALUES ($1,$2,$3,true,'complete',false)`,
      [id, `${id}@example.test`, name]);
    return id;
  };
  const mkReview = (reviewer, reviewed, rating) => q(`INSERT INTO user_reviews (reviewer_id, reviewed_id, rating) VALUES ($1,$2,$3)`, [reviewer, reviewed, rating]);
  const report = (as, targetId, reason = 'inappropriate behavior') => call('POST', '/api/report', as, { targetId, reason });
  const trustOf = async id => Number((await one(`SELECT trust_score t FROM users WHERE id=$1`, [id])).t);
  const eventsFor = async id => (await q(`SELECT * FROM moderation_events WHERE user_id=$1 ORDER BY created_at`, [id])).rows;
  const reportIdFor = async (from, target) => (await one(`SELECT id FROM reports WHERE from_user=$1 AND target_id=$2`, [from, target])).id;

  try {
    check('server booted', /Server on port/.test(out) && exited === null, out.slice(-300));

    console.log('\n--- POST /api/report must NEVER write trust_score, under any circumstances ---');
    const reporter1 = await mkTarget('Reporter 1');
    const noReviewsTarget = await mkTarget('No Reviews Target');
    const before1 = await trustOf(noReviewsTarget);
    let r = await report(reporter1, noReviewsTarget);
    check('a report against a target with ZERO reviews -> 200', r.status === 200, JSON.stringify(r));
    check('trust_score is completely unchanged (was: -10, unconditionally, on every report)', await trustOf(noReviewsTarget) === before1, `before=${before1} after=${await trustOf(noReviewsTarget)}`);
    check('...and no moderation_event was created either (below the >=3-review corroboration bar)', (await eventsFor(noReviewsTarget)).length === 0, JSON.stringify(await eventsFor(noReviewsTarget)));

    console.log('\n--- below the corroboration bar: 1 or 2 reviews, even a bad average, creates no event ---');
    const oneReviewTarget = await mkTarget('One Review Target');
    await mkReview(await mkTarget('R'), oneReviewTarget, 1);
    const before2 = await trustOf(oneReviewTarget);
    await report(await mkTarget('Reporter 2'), oneReviewTarget);
    check('1 review (avg 1.0, clearly bad) is still below the >=3 sample-size bar -> no event', (await eventsFor(oneReviewTarget)).length === 0, JSON.stringify(await eventsFor(oneReviewTarget)));
    check('...and trust_score is still untouched', await trustOf(oneReviewTarget) === before2);

    const twoReviewTarget = await mkTarget('Two Review Target');
    await mkReview(await mkTarget('R'), twoReviewTarget, 1); await mkReview(await mkTarget('R'), twoReviewTarget, 1);
    await report(await mkTarget('Reporter 3'), twoReviewTarget);
    check('2 reviews (avg 1.0) - still below >=3 -> no event', (await eventsFor(twoReviewTarget)).length === 0, JSON.stringify(await eventsFor(twoReviewTarget)));

    console.log('\n--- at the bar (3 reviews) but a GOOD average: no event (the average must be < 3.0, not just the count) ---');
    const goodAvgTarget = await mkTarget('Good Average Target');
    await mkReview(await mkTarget('R'), goodAvgTarget, 3); await mkReview(await mkTarget('R'), goodAvgTarget, 3); await mkReview(await mkTarget('R'), goodAvgTarget, 3);
    await report(await mkTarget('Reporter 4'), goodAvgTarget);
    check('3 reviews averaging EXACTLY 3.0 -> no event (the condition is strictly < 3.0, not <=)', (await eventsFor(goodAvgTarget)).length === 0, JSON.stringify(await eventsFor(goodAvgTarget)));

    console.log('\n--- qualifying: a report + >=3 reviews averaging < 3.0 -> exactly one moderation_event ---');
    const qualifyingTarget = await mkTarget('Qualifying Target');
    await mkReview(await mkTarget('R'), qualifyingTarget, 1); await mkReview(await mkTarget('R'), qualifyingTarget, 2); await mkReview(await mkTarget('R'), qualifyingTarget, 3);   // avg 2.0
    const beforeQ = await trustOf(qualifyingTarget);
    const qualifyingReporter = await mkTarget('Qualifying Reporter');
    r = await report(qualifyingReporter, qualifyingTarget, 'harassed me in messages');
    check('the report itself still succeeds normally -> 200, ok:true', r.status === 200 && r.body?.ok === true, JSON.stringify(r));
    check('trust_score is STILL untouched by the qualifying report (this is the core A22 invariant)', await trustOf(qualifyingTarget) === beforeQ, `before=${beforeQ} after=${await trustOf(qualifyingTarget)}`);
    const events = await eventsFor(qualifyingTarget);
    check('exactly one moderation_event was created', events.length === 1, JSON.stringify(events));
    const ev = events[0] || {};
    const expectedReportId = await reportIdFor(qualifyingReporter, qualifyingTarget);
    check('the event snapshots the correct report_id, review_count and avg_rating at creation time', ev.source_id === expectedReportId && ev.review_count_at_creation === 3 && Number(ev.avg_rating_at_creation) === 2, JSON.stringify(ev));
    check('the event records who it is about and (where tracked) who reported them', ev.user_id === qualifyingTarget && ev.event_type === 'report_corroborated', JSON.stringify(ev));

    console.log('\n--- a LATER review changing the average does not retroactively alter the already-created event ---');
    await mkReview(await mkTarget('R'), qualifyingTarget, 5);   // pulls the average up to 2.75, still <3 but different
    const eventsAfter = await eventsFor(qualifyingTarget);
    check('still exactly one event, and its snapshot is UNCHANGED (2.0 / 3 reviews) - not recalculated in place', eventsAfter.length === 1 && Number(eventsAfter[0].avg_rating_at_creation) === 2 && eventsAfter[0].review_count_at_creation === 3, JSON.stringify(eventsAfter));

    console.log('\n--- a SECOND qualifying report against the SAME target creates its OWN, separate event ---');
    const secondReporter = await mkTarget('Second Reporter');
    await report(secondReporter, qualifyingTarget, 'also had a bad experience');
    const eventsFinal = await eventsFor(qualifyingTarget);
    check('now two events, one per qualifying report, each with its own source_id', eventsFinal.length === 2 && new Set(eventsFinal.map(e => e.source_id)).size === 2, JSON.stringify(eventsFinal.map(e => e.source_id)));

    console.log('\n--- existing calcTrust() write paths are completely unaffected by A22 (regression) ---');
    const editViewer = await mkTarget('Edit Viewer');
    // calcTrust(this bare profile + a linkedin url) = the linkedin/website/instagram component only
    // (+10) - PUT /api/me writes the ABSOLUTE calcTrust(merged) result, not a delta on top of
    // whatever was stored, so the new value is exactly 10 regardless of what was there before.
    r = await call('PUT', '/api/me', editViewer, { linkedin: 'https://linkedin.com/in/example' });
    check('PUT /api/me still recomputes and writes trust_score via calcTrust, unaffected by A22', r.status === 200 && (await trustOf(editViewer)) === 10, `trust_score=${await trustOf(editViewer)}`);

    console.log('\n--- POST /api/login\'s "Step 5: refresh scores" still recomputes trust_score exactly as before - A22 only stops REPORTS from writing it, not this ---');
    const loginId = uuid();
    const rawPw = 'a-real-password-123';
    await q(`INSERT INTO users (id,email,password,name,email_verified,onboarding_stage,banned,trust_score,location)
             VALUES ($1,$2,$3,$4,true,'complete',false,0,'Pune')`,
      [loginId, `${loginId}@example.test`, bcrypt.hashSync(rawPw, 4), 'Login Tester']);
    // trust_score was stored as 0, but calcTrust(this profile) - location set (+10) - is 10. Login's
    // own "refresh scores" step should still bring it up to 10, same behaviour as always.
    r = await call('POST', '/api/login', null, { email: `${loginId}@example.test`, password: rawPw });
    check('login succeeds', r.status === 200, JSON.stringify(r).slice(0, 200));
    check('...and trust_score was refreshed to match calcTrust(profile) on login, exactly as before A22 (only WHO can write it changed, not whether login itself still does)', await trustOf(loginId) === 10, `trust_score=${await trustOf(loginId)}`);

    console.log('\n--- unchanged behaviour: dedup, validation, self-report, block ---');
    r = await report(qualifyingReporter, qualifyingTarget, 'trying to report the same person again');
    check('a second report from the SAME reporter to the SAME target -> 400 "already reported" (unchanged, A21)', r.status === 400, JSON.stringify(r));
    r = await call('POST', '/api/report', qualifyingReporter, { targetId: qualifyingReporter, reason: 'x' });
    check('cannot report yourself -> 400 (unchanged)', r.status === 400, JSON.stringify(r));
    r = await call('POST', '/api/report', qualifyingReporter, { targetId: qualifyingTarget });
    check('missing reason -> 400 (unchanged)', r.status === 400, JSON.stringify(r));
    r = await call('POST', '/api/report', null, { targetId: qualifyingTarget, reason: 'x' });
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
