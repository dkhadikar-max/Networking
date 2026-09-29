// Regression test for two deferred A7 gaps in POST /api/report (the ordinary user-report channel,
// separate from POST /api/report/illegal-content's DSA path):
//
//   TARGET VALIDATION. Unlike swipe/connect (isLiveTarget, added at A11), /api/report never checked
//   that targetId corresponded to a real, live account. reports.target_id has no FK constraint, so a
//   report against a completely nonexistent id was silently accepted and stored as junk; a report
//   against an already-banned or already-soft-deleted account was equally accepted with no signal
//   that the target was already gone. Decision (this commit): match isLiveTarget's exact predicate
//   and uniform-404 posture used everywhere else (swipe/connect/priority-message/profile-view/
//   search) - nonexistent, banned, and soft-deleted targets are all refused identically, before the
//   dedupe check or any write.
//
//   RATE LIMITING. POST /api/report/illegal-content already has dsaReportLimiter (5/hour). The
//   ordinary POST /api/report had no rate limiter at all - a single authenticated account could fire
//   unlimited reports against unlimited different targets with no throttle. New reportLimiter, same
//   shape (5/hour) but its own separate quota so a burst of illegal-content reports never eats into
//   the ordinary-report budget or vice versa. Keyed by the AUTHENTICATED USER ID (req.user.id), not
//   IP - a genuinely per-user limit, since auth() already runs before this limiter in the chain and
//   an IP-based key would just invite rotating X-Forwarded-For to bypass it.
//
// How it runs (nothing can touch production): the REAL server.js (or $SERVER_JS) against a
// PostgREST-compatible translator over a REAL PostgreSQL (embedded-postgres, UTF-8); empty cwd (no
// .env), whitelisted env. A table this test never creates (user_reviews) is intentionally left
// undefined - the translator returns an empty list for an unknown table on GET, matching
// /api/report's own tolerance of "no reviews yet" (reviewCount stays 0, well under A22's
// moderation-event threshold, so that unrelated code path is never exercised here).
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
  last_active timestamptz, created_at timestamptz DEFAULT now(),
  reply_count int DEFAULT 0, avg_reply_minutes int DEFAULT 0, response_rate int DEFAULT 100);
CREATE TABLE reports (id text PRIMARY KEY, from_user text NOT NULL, target_id text NOT NULL, reason text NOT NULL, type text, created_at timestamptz DEFAULT now());
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
  const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-rpt-pg-'));
  const pgPort = await freePort();
  const epg = new EmbeddedPostgres({ databaseDir: dbDir, user: 'postgres', password: 'pw', port: pgPort, persistent: false, initdbFlags: ['--encoding=UTF8'], onLog: () => {}, onError: () => {} });
  await epg.initialise(); await epg.start(); await epg.createDatabase('byn');
  pool = new pg.Pool({ host: '127.0.0.1', port: pgPort, user: 'postgres', password: 'pw', database: 'byn', max: 10 });
  const q = (sql, args) => pool.query(sql, args); const one = async (sql, args) => (await q(sql, args)).rows[0];
  await q(DDL);

  const shared = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-rpt-shared-'));
  const stub = path.join(shared, 'stub-resend.cjs');
  fs.writeFileSync(stub, `const Module = require('module'); const orig = Module._load;
Module._load = function (request) { if (request === 'resend') { return { Resend: class { constructor() { this.emails = { send: async () => ({ data: { id: 'stub' }, error: null }) }; } } }; } return orig.apply(this, arguments); };`);
  await new Promise(r => translator.listen(0, '127.0.0.1', r)); const dbPort = translator.address().port;
  const port = await freePort(); const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-rpt-'));
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, SYSTEMROOT: process.env.SYSTEMROOT, TEMP: os.tmpdir(), TMP: os.tmpdir(), HOME: cwd, USERPROFILE: cwd,
    SUPABASE_URL: `http://127.0.0.1:${dbPort}`, SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key', JWT_SECRET, ADMIN_SECRET: 'test-only-admin-secret', PORT: String(port), RESEND_API_KEY: 'test-only-resend-key' };
  let out = ''; const child = spawn(process.execPath, ['-r', stub, SERVER_JS], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  let exited = null; child.on('exit', c => { exited = c; });
  await waitFor(() => /Server on port/.test(out) || exited !== null, 60000, 200);
  const base = `http://127.0.0.1:${port}`;
  const tok = id => jwt.sign({ id, email: `${id}@example.test`, name: 'T' }, JWT_SECRET, { expiresIn: '1h' });
  let ipN = 0;
  // A single, FIXED IP for every request in this file - the whole point of the rate-limit checks is
  // to prove reportLimiter is keyed by the authenticated user id, not by IP (an IP-rotating client
  // must not be able to bypass it). Target-validation checks are unaffected by IP either way.
  const FIXED_IP = '10.19.0.1';
  const call = async (method, p, as, body) => { const r = await fetch(base + p, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(as ? { Authorization: `Bearer ${tok(as)}` } : {}), 'X-Forwarded-For': FIXED_IP }, body: body !== undefined ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch {} return { status: r.status, body: j }; };

  const uuid = () => crypto.randomUUID();
  const mkUser = async (name, o = {}) => {
    const id = uuid();
    await q(`INSERT INTO users (id,email,name,email_verified,onboarding_stage,banned,deleted_at) VALUES ($1,$2,$3,true,'complete',$4,$5)`,
      [id, `${id}@example.test`, name, o.banned ?? false, o.deleted_at ?? null]);
    return id;
  };
  const report = (as, targetId, reason = 'spam') => call('POST', '/api/report', as, { targetId, reason });

  try {
    check('server booted', /Server on port/.test(out) && exited === null, out.slice(-300));

    console.log('\n--- target validation: nonexistent, banned, and soft-deleted targets all refused identically ---');
    const reporter = await mkUser('Reporter');
    let r = await report(reporter, uuid());
    check('nonexistent (well-formed) target id -> 404 User not found', r.status === 404 && r.body?.error === 'User not found', JSON.stringify(r));
    // users.id is a free-form text primary key (not guaranteed to be a UUID - see the source
    // comment), so a plain non-UUID-shaped string is NOT rejected as "malformed": it's just another
    // nonexistent id, same as above - 404, not 400. Only a genuinely out-of-bounds value (matching
    // /api/report/illegal-content's own targetId guard) gets the 400 path.
    r = await report(reporter, 'not-a-uuid-at-all');
    check('a non-UUID-shaped but otherwise ordinary string -> 404 (treated as just another nonexistent id, not rejected)', r.status === 404 && r.body?.error === 'User not found', JSON.stringify(r));
    r = await report(reporter, 'x'.repeat(65));
    check('a genuinely out-of-bounds target id (>64 chars) -> 400 Invalid targetId', r.status === 400, JSON.stringify(r));
    const bannedTarget = await mkUser('Banned Target', { banned: true });
    r = await report(reporter, bannedTarget);
    check('already-banned target -> 404 (same message as nonexistent - no state leak)', r.status === 404 && r.body?.error === 'User not found', JSON.stringify(r));
    const deletedTarget = await mkUser('Deleted Target', { deleted_at: new Date().toISOString() });
    r = await report(reporter, deletedTarget);
    check('already-soft-deleted target -> 404 (same message)', r.status === 404 && r.body?.error === 'User not found', JSON.stringify(r));
    check('none of the refused reports were actually written to the DB', Number((await one(`SELECT count(*) c FROM reports`)).c) === 0, JSON.stringify(await q('SELECT * FROM reports')));

    console.log('\n--- a live target is still reportable (this fix does not break ordinary reporting) ---');
    // A FRESH reporter - `reporter` above already spent 4 of its 5-per-hour budget on the rejected
    // (nonexistent/oversized/banned/deleted) attempts, since reportLimiter runs before target
    // validation and counts every request that reaches the route, same posture as dsaReportLimiter.
    const liveReporter = await mkUser('Live Reporter');
    const liveTarget = await mkUser('Live Target');
    r = await report(liveReporter, liveTarget);
    check('a real, live target -> 200 ok', r.status === 200 && r.body?.ok === true, JSON.stringify(r));

    console.log('\n--- rate limiting: a 6th report within the window is refused, keyed by USER not IP ---');
    // A fresh reporter (the one above already used its dedupe slot on liveTarget) - 6 DIFFERENT live
    // targets, since the per-(reporter,target) dedupe would otherwise mask the rate limit entirely.
    const limitReporter = await mkUser('Limit Tester');
    const targets = [];
    for (let i = 0; i < 6; i++) targets.push(await mkUser(`Rate Target ${i}`));
    const results = [];
    for (const t of targets) results.push(await report(limitReporter, t)); // sequential: order must be deterministic for this check
    const firstFive = results.slice(0, 5), sixth = results[5];
    check('the first 5 reports (this account\'s hourly budget) all succeed', firstFive.every(x => x.status === 200), JSON.stringify(firstFive));
    check('the 6th report in the same hour is refused with 429 (was: unlimited)', sixth.status === 429, JSON.stringify(sixth));
    check('...and the 6th target never got a report row written for it', Number((await one(`SELECT count(*) c FROM reports WHERE target_id=$1`, [targets[5]])).c) === 0, JSON.stringify(sixth));

    console.log('\n--- the limit is PER-USER, not per-IP: a different account, same fixed IP, is unaffected ---');
    const otherUser = await mkUser('Different Account, Same IP');
    const otherTarget = await mkUser('Yet Another Target');
    r = await report(otherUser, otherTarget); // same FIXED_IP as everything above
    check('a different authenticated user from the SAME IP still gets 200 (limiter is keyed by user id, not IP - an IP-rotating client gains nothing)',
      r.status === 200, JSON.stringify(r));

    console.log('\n--- the separate DSA illegal-content channel is unaffected (different route, different limiter) ---');
    const dsaTarget = await mkUser('DSA Target');
    r = await call('POST', '/api/report/illegal-content', reporter, { targetId: dsaTarget, category: 'CSAM' });
    check('POST /api/report/illegal-content still works and is not affected by reportLimiter (its own dsaReportLimiter is unchanged)',
      r.status === 200 || r.status === 201, JSON.stringify(r));

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
