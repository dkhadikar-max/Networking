// Regression test for the A7 retention-semantics fix — reports and moderation_events must survive
// account anonymization/deletion, on EITHER side (reporter or target), through all three deletion
// paths. Locked specification (2026-09-29, no code until this was explicit):
//
//   report / moderation_event created -> durable evidence -> references account IDs, not retained
//   live PII -> survives anonymization/deletion of reporter OR target -> no application-level expiry
//   at present.
//
//   | Object                        | Locked behavior                                                |
//   | ordinary reports               | retain - do not delete in self-delete/admin-delete/retention   |
//   | DSA / illegal-content reports  | same application-level retention treatment                     |
//   | moderation_events              | retain - existing no-TTL behavior unchanged (was never deleted)|
//   | blocks                         | existing deletion behavior UNCHANGED (still deleted)           |
//   | users                          | existing anonymization model UNCHANGED (row remains, scrubbed) |
//
//   WHY THIS IS SAFE: anonymizeUser() never removes a `users` row - it's an UPDATE that scrubs
//   email/name/bio/photos/location/etc. and sets deleted_at, leaving id/banned/role/created_at
//   intact. reports has NO FK to users at all. So retaining a report referencing an anonymized
//   account exposes no fresh PII - only an opaque id joined to an already-scrubbed shell. This
//   directly reverses the prior (bugged) behavior: `DELETE /api/me`, `DELETE /api/admin/users/:id`,
//   and runRetentionCycle() Step 2 each unconditionally hard-deleted
//   `reports.delete().or(from_user.eq.id,target_id.eq.id)`, contradicting the ALREADY-LOCKED A7/
//   Option-5 spec ("reports + decisions kept as durable evidence even if either account is
//   deleted"). Fix: remove exactly that one line from each of the three places. No migration - no
//   FK exists to alter. blocks/priority_msgs/swipes/messages/etc. deletion in those same three
//   places is explicitly UNCHANGED and re-confirmed here as a control.
//
// How it runs (nothing can touch production): the REAL server.js (or $SERVER_JS) against a
// PostgREST-compatible translator over a REAL PostgreSQL (embedded-postgres, UTF-8); empty cwd (no
// .env), whitelisted env. The retention-cycle scenario relies on the boot-time run (runRetentionCycle
// fires once immediately in the app.listen callback, then every 24h) - a user is inserted with
// deletion_scheduled_at already in the past BEFORE the server boots, so Step 2 picks it up on that
// first run.
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
  deletion_scheduled_at timestamptz, email_verified boolean, onboarding_stage text, password_set boolean DEFAULT true, password_changed_at timestamptz, push_token text,
  last_active timestamptz, created_at timestamptz DEFAULT now(),
  reply_count int DEFAULT 0, avg_reply_minutes int DEFAULT 0, response_rate int DEFAULT 100);
CREATE TABLE reports (id text PRIMARY KEY, from_user text NOT NULL, target_id text NOT NULL, reason text NOT NULL, type text, created_at timestamptz DEFAULT now());
CREATE TABLE swipes (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, from_user text NOT NULL, to_user text NOT NULL, direction text NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE blocks (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, from_user text NOT NULL, to_user text NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE moderation_events (id bigserial PRIMARY KEY, user_id text NOT NULL, event_type text NOT NULL, weight int NOT NULL DEFAULT 0, source_id text, actor_id text, reason text,
  review_count_at_creation int, avg_rating_at_creation numeric, active boolean NOT NULL DEFAULT true, expires_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz, reversed_by text);
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
  const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-ret-pg-'));
  const pgPort = await freePort();
  const epg = new EmbeddedPostgres({ databaseDir: dbDir, user: 'postgres', password: 'pw', port: pgPort, persistent: false, initdbFlags: ['--encoding=UTF8'], onLog: () => {}, onError: () => {} });
  await epg.initialise(); await epg.start(); await epg.createDatabase('byn');
  pool = new pg.Pool({ host: '127.0.0.1', port: pgPort, user: 'postgres', password: 'pw', database: 'byn', max: 10 });
  const q = (sql, args) => pool.query(sql, args); const one = async (sql, args) => (await q(sql, args)).rows[0];
  await q(DDL);

  const uuid = () => crypto.randomUUID();
  const mkUser = async (name, o = {}) => {
    const id = uuid();
    await q(`INSERT INTO users (id,email,name,email_verified,onboarding_stage,role,banned,deletion_scheduled_at) VALUES ($1,$2,$3,true,'complete',$4,false,$5)`,
      [id, `${id}@example.test`, name, o.role ?? 'user', o.deletionScheduledPast ? new Date(Date.now() - 86400000).toISOString() : null]);
    return id;
  };
  // Seeds one ordinary report (subject as target), one ordinary report (subject as reporter), one DSA
  // report (subject as reporter), one moderation_event (subject as the flagged user), one swipe and
  // one block involving subject - so a single cascade run exercises every angle at once.
  const seedEvidence = async (subject, other1, other2) => {
    const rOrdinaryTarget = uuid(), rOrdinaryReporter = uuid(), rDsa = uuid();
    await q(`INSERT INTO reports (id,from_user,target_id,reason,type) VALUES ($1,$2,$3,'rude behavior',NULL)`, [rOrdinaryTarget, other1, subject]);
    await q(`INSERT INTO reports (id,from_user,target_id,reason,type) VALUES ($1,$2,$3,'spam account',NULL)`, [rOrdinaryReporter, subject, other2]);
    await q(`INSERT INTO reports (id,from_user,target_id,reason,type) VALUES ($1,$2,$3,'[DSA:Fraud] scam',$4)`, [rDsa, subject, other2, 'illegal_content']);
    await q(`INSERT INTO moderation_events (user_id,event_type,weight,source_id,reason) VALUES ($1,'report_corroborated',-10,$2,'test evidence')`, [subject, rOrdinaryTarget]);
    await q(`INSERT INTO swipes (from_user,to_user,direction) VALUES ($1,$2,'right')`, [subject, other1]);
    await q(`INSERT INTO blocks (from_user,to_user) VALUES ($1,$2)`, [subject, other1]);
    return { rOrdinaryTarget, rOrdinaryReporter, rDsa };
  };
  const assertEvidenceSurvivesButControlsAreGone = async (label, subject, other1, ids) => {
    const rows = (await q(`SELECT id FROM reports WHERE id = ANY($1)`, [[ids.rOrdinaryTarget, ids.rOrdinaryReporter, ids.rDsa]])).rows;
    check(`${label}: all 3 reports (ordinary-as-target, ordinary-as-reporter, DSA-as-reporter) survive`, rows.length === 3, `found ${rows.length}/3`);
    const modCount = Number((await one(`SELECT count(*) c FROM moderation_events WHERE user_id=$1`, [subject])).c);
    check(`${label}: moderation_event survives (was already correct - confirming no regression)`, modCount === 1, `modCount=${modCount}`);
    const swipeCount = Number((await one(`SELECT count(*) c FROM swipes WHERE from_user=$1`, [subject])).c);
    check(`${label}: swipes are STILL deleted (unchanged control - this fix is scoped to reports/moderation_events only)`, swipeCount === 0, `swipeCount=${swipeCount}`);
    const blockCount = Number((await one(`SELECT count(*) c FROM blocks WHERE from_user=$1`, [subject])).c);
    check(`${label}: blocks are STILL deleted (unchanged control, per the locked spec)`, blockCount === 0, `blockCount=${blockCount}`);
  };

  const shared = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-ret-shared-'));
  const stub = path.join(shared, 'stub-resend.cjs');
  fs.writeFileSync(stub, `const Module = require('module'); const orig = Module._load;
Module._load = function (request) { if (request === 'resend') { return { Resend: class { constructor() { this.emails = { send: async () => ({ data: { id: 'stub' }, error: null }) }; } } }; } return orig.apply(this, arguments); };`);

  // The retention-cycle subject must exist BEFORE the server boots (Step 2 runs once, immediately,
  // in the app.listen callback) - every other user can be created after boot via the normal API.
  const retentionSubject = await mkUser('Retention Subject', { deletionScheduledPast: true });
  const retentionOther1 = await mkUser('Retention Other 1');
  const retentionOther2 = await mkUser('Retention Other 2');
  const retentionIds = await seedEvidence(retentionSubject, retentionOther1, retentionOther2);

  await new Promise(r => translator.listen(0, '127.0.0.1', r)); const dbPort = translator.address().port;
  const port = await freePort(); const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-ret-'));
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, SYSTEMROOT: process.env.SYSTEMROOT, TEMP: os.tmpdir(), TMP: os.tmpdir(), HOME: cwd, USERPROFILE: cwd,
    SUPABASE_URL: `http://127.0.0.1:${dbPort}`, SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key', JWT_SECRET, ADMIN_SECRET: 'test-only-admin-secret', PORT: String(port), RESEND_API_KEY: 'test-only-resend-key' };
  let out = ''; const child = spawn(process.execPath, ['-r', stub, SERVER_JS], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  let exited = null; child.on('exit', c => { exited = c; });
  await waitFor(() => /Server on port/.test(out) || exited !== null, 60000, 200);
  const base = `http://127.0.0.1:${port}`;
  const tok = id => jwt.sign({ id, email: `${id}@example.test`, name: 'T' }, JWT_SECRET, { expiresIn: '1h' });
  let ipN = 0;
  const call = async (method, p, as, body) => { const r = await fetch(base + p, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(as ? { Authorization: `Bearer ${tok(as)}` } : {}), 'X-Forwarded-For': `10.22.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: body !== undefined ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch {} return { status: r.status, body: j }; };

  try {
    check('server booted', /Server on port/.test(out) && exited === null, out.slice(-300));

    console.log('\n--- retention-cycle purge (runRetentionCycle Step 2, boot-time) ---');
    await waitFor(async () => (await one(`SELECT deleted_at FROM users WHERE id=$1`, [retentionSubject])).deleted_at, 20000);
    const retentionRow = await one(`SELECT deleted_at, name FROM users WHERE id=$1`, [retentionSubject]);
    check('the subject was actually anonymized (deleted_at set, name scrubbed) - proves the scenario is real', !!retentionRow.deleted_at && retentionRow.name === 'Deleted User', JSON.stringify(retentionRow));
    await assertEvidenceSurvivesButControlsAreGone('retention-purge', retentionSubject, retentionOther1, retentionIds);

    console.log('\n--- self-delete (DELETE /api/me) ---');
    const selfSubjectId = await mkUser('Self Delete Subject');
    const selfOther1 = await mkUser('Self Other 1');
    const selfOther2 = await mkUser('Self Other 2');
    const selfIds = await seedEvidence(selfSubjectId, selfOther1, selfOther2);
    let r = await call('DELETE', '/api/me', selfSubjectId);
    check('DELETE /api/me succeeded', r.status === 200, JSON.stringify(r));
    const selfRow = await one(`SELECT deleted_at, name FROM users WHERE id=$1`, [selfSubjectId]);
    check('the subject was actually anonymized', !!selfRow.deleted_at && selfRow.name === 'Deleted User', JSON.stringify(selfRow));
    await assertEvidenceSurvivesButControlsAreGone('self-delete', selfSubjectId, selfOther1, selfIds);

    console.log('\n--- admin-delete (DELETE /api/admin/users/:id) ---');
    const admin = await mkUser('Admin', { role: 'admin' });
    const adminSubjectId = await mkUser('Admin Delete Subject');
    const adminOther1 = await mkUser('Admin Other 1');
    const adminOther2 = await mkUser('Admin Other 2');
    const adminIds = await seedEvidence(adminSubjectId, adminOther1, adminOther2);
    r = await call('DELETE', `/api/admin/users/${adminSubjectId}`, admin);
    check('DELETE /api/admin/users/:id succeeded', r.status === 200, JSON.stringify(r));
    const adminRow = await one(`SELECT deleted_at, name FROM users WHERE id=$1`, [adminSubjectId]);
    check('the subject was actually anonymized', !!adminRow.deleted_at && adminRow.name === 'Deleted User', JSON.stringify(adminRow));
    await assertEvidenceSurvivesButControlsAreGone('admin-delete', adminSubjectId, adminOther1, adminIds);

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
