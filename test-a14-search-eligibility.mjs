// Regression test for audit finding A14 - GET /api/search returned accounts Discover excludes.
//
//   /api/search filtered ONLY on `banned` (and, since A12, on blocks). Discover requires the account to be
//   not soft-deleted, e-mail verified and onboarding complete. So search happily returned anonymised
//   "Deleted User" rows, accounts that never verified their e-mail, and accounts still mid-onboarding - in
//   production 74 of the 176 accounts search could return (42%) were of these kinds. And because the 200-row
//   window is applied by the DATABASE before the name/interest matching, those ineligible rows also crowd real
//   matches out of the window.
//
// Invariant enforced here: search applies the same eligibility Discover applies to who it shows - the account
// is not banned, not soft-deleted, has a verified e-mail and has finished onboarding - and it applies it IN THE
// QUERY (so ineligible rows cannot fill the 200-row window). A NULL e-mail flag or onboarding stage is not
// eligible. Everything else about search is unchanged: the query still matches name / interests / skills, still
// excludes the caller and (A12) blocked pairs, still returns the cleanPublic (A8) shape, and is still gated by
// discoverGuard and the 2-character minimum.
//
// Deliberately NOT part of this item: Discover's two extra quality gates (trust_score >= 10, and a photo to be
// shown) are ranking/quality rules, not eligibility, and are not applied to search.
//
// How it runs (nothing can touch production): the REAL server.js (or $SERVER_JS) against a PostgREST-compatible
// translator over a REAL PostgreSQL (embedded-postgres, UTF-8); empty cwd (no .env), whitelisted env.
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
  last_active timestamptz, created_at timestamptz DEFAULT now());
CREATE TABLE swipes (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, from_user text NOT NULL, to_user text NOT NULL, direction text NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE connections (id text PRIMARY KEY, user1 text NOT NULL, user2 text NOT NULL, created_at timestamptz DEFAULT now(), expires_at timestamptz, first_response_deadline timestamptz,
  user1_responded boolean DEFAULT false, user2_responded boolean DEFAULT false, active boolean DEFAULT false, status text, user1_last_read_at timestamptz, user2_last_read_at timestamptz);
CREATE TABLE blocks (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, from_user text NOT NULL, to_user text NOT NULL, created_at timestamptz DEFAULT now());
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
        const rows = (await pool.query(`SELECT to_jsonb(t) AS r FROM "${table}" t ${w} ${ob} ${lim}`, args)).rows.map(r => pick(r.r, url.searchParams.get('select'), cols, table));
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
  const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a14-pg-'));
  const pgPort = await freePort();
  const epg = new EmbeddedPostgres({ databaseDir: dbDir, user: 'postgres', password: 'pw', port: pgPort, persistent: false, initdbFlags: ['--encoding=UTF8'], onLog: () => {}, onError: () => {} });
  await epg.initialise(); await epg.start(); await epg.createDatabase('byn');
  pool = new pg.Pool({ host: '127.0.0.1', port: pgPort, user: 'postgres', password: 'pw', database: 'byn', max: 10 });
  const q = (sql, args) => pool.query(sql, args); const one = async (sql, args) => (await q(sql, args)).rows[0];
  await q(DDL);

  const shared = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a14-shared-'));
  const stub = path.join(shared, 'stub-resend.cjs');
  fs.writeFileSync(stub, `const Module = require('module'); const orig = Module._load;
Module._load = function (request) { if (request === 'resend') { return { Resend: class { constructor() { this.emails = { send: async () => ({ data: { id: 'stub' }, error: null }) }; } } }; } return orig.apply(this, arguments); };`);
  await new Promise(r => translator.listen(0, '127.0.0.1', r)); const dbPort = translator.address().port;
  const port = await freePort(); const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a14-'));
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, SYSTEMROOT: process.env.SYSTEMROOT, TEMP: os.tmpdir(), TMP: os.tmpdir(), HOME: cwd, USERPROFILE: cwd,
    SUPABASE_URL: `http://127.0.0.1:${dbPort}`, SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key', JWT_SECRET, ADMIN_SECRET: 'test-only-admin-secret', PORT: String(port), RESEND_API_KEY: 'test-only-resend-key' };
  let out = ''; const child = spawn(process.execPath, ['-r', stub, SERVER_JS], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  let exited = null; child.on('exit', c => { exited = c; });
  await waitFor(() => /Server on port/.test(out) || exited !== null, 60000, 200);
  const base = `http://127.0.0.1:${port}`;
  const tok = id => jwt.sign({ id, email: `${id}@example.test`, name: 'T' }, JWT_SECRET, { expiresIn: '1h' });
  let ipN = 0;
  const call = async (method, p, as, body) => { const r = await fetch(base + p, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(as ? { Authorization: `Bearer ${tok(as)}` } : {}), 'X-Forwarded-For': `10.1.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: body !== undefined ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch {} return { status: r.status, body: j }; };

  const uuid = () => crypto.randomUUID();
  const HAS = { bio: 'A complete biography text', location: 'Pune', intent: 'explore-network', linkedin: 'https://linkedin.com/in/x' };
  // one row per call; `o` overrides verified / stage / banned / deleted / interests / photos
  const mkU = async (name, o = {}) => {
    const id = o.id || uuid(); const has = k => k in o;
    await q(`INSERT INTO users (id,email,name,bio,location,intent,photos,interests,skills,linkedin,email_verified,onboarding_stage,banned,deleted_at,last_active)
             VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,'[]'::jsonb,$9,$10,$11,$12,$13,now())`,
      [id, `${id}@example.test`, name, HAS.bio, HAS.location, HAS.intent, JSON.stringify(o.photos || ['1']), JSON.stringify(has('interests') ? o.interests : ['ai', 'design', 'music']), HAS.linkedin,
       has('verified') ? o.verified : true, has('stage') ? o.stage : 'complete', !!o.banned, o.deleted ? new Date().toISOString() : null]);
    return id;
  };
  const names = body => (Array.isArray(body) ? body : []).map(u => u.name).sort();
  const sameSet = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

  try {
    check('server booted', /Server on port/.test(out) && exited === null, out.slice(-300));

    // the searcher: a fully eligible, complete-profile account
    const me = await mkU('Searcher Sam', { photos: ['1', '2', '3', '4'] });

    // ---- the cast: everyone shares the interest "ai" and the name token "Searchable" ----
    const E1 = await mkU('Searchable Eve'), E2 = await mkU('Searchable Eli');                          // eligible
    const excluded = {
      'soft-deleted (name kept)':           await mkU('Searchable Deleted', { deleted: true }),
      'soft-deleted, verified + complete':  await mkU('Searchable Gone', { deleted: true, verified: true, stage: 'complete' }),
      'banned':                             await mkU('Searchable Banned', { banned: true }),
      'unverified e-mail (stage complete)': await mkU('Searchable Unverified', { verified: false, stage: 'complete' }),
      'e-mail flag NULL':                   await mkU('Searchable NullEmail', { verified: null, stage: 'complete' }),
      'onboarding stage "profile"':         await mkU('Searchable Profile', { stage: 'profile' }),
      'onboarding stage "intent"':          await mkU('Searchable Intent', { stage: 'intent' }),
      'onboarding stage "acquisition"':     await mkU('Searchable Acquisition', { stage: 'acquisition' }),
      'onboarding stage NULL':              await mkU('Searchable NullStage', { stage: null }),
      'unverified AND mid-onboarding':      await mkU('Searchable Fresh', { verified: false, stage: 'acquisition' }),
    };
    const blocked = await mkU('Searchable Blocked');                                                   // eligible, but the searcher blocked them (A12)
    await q(`INSERT INTO blocks (from_user, to_user) VALUES ($1,$2)`, [me, blocked]);
    // an anonymised row exactly as anonymizeUser() leaves it
    await q(`INSERT INTO users (id,email,name,bio,photos,interests,skills,email_verified,onboarding_stage,deleted_at) VALUES ($1,$2,'Deleted User','','[]'::jsonb,'[]'::jsonb,'[]'::jsonb,true,'complete',now())`, [uuid(), `deleted-x@deleted.example.test`]);
    console.log('\n--- who search returns for a term everyone matches ---');
    let r = await call('GET', '/api/search?q=searchable', me);
    check('200', r.status === 200 && Array.isArray(r.body), JSON.stringify(r).slice(0, 120));
    check('returns EXACTLY the eligible accounts (Eve and Eli) - nobody Discover would exclude', sameSet(names(r.body), ['Searchable Eve', 'Searchable Eli']), JSON.stringify(names(r.body)));
    for (const [label, id] of Object.entries(excluded)) check(`excluded: ${label}`, !(r.body || []).some(u => u.id === id), '');
    check('excluded: a soft-deleted account even though it is "verified + onboarding complete"', !(r.body || []).some(u => u.id === excluded['soft-deleted, verified + complete']), '');
    check('still excluded (A12): the account the searcher blocked', !(r.body || []).some(u => u.id === blocked), '');
    check('still excluded: the searcher themselves', !(r.body || []).some(u => u.id === me), '');

    console.log('\n--- anonymised rows ("Deleted User") never show up ---');
    r = await call('GET', '/api/search?q=deleted', me);
    check('a search for "deleted" returns no anonymised "Deleted User" row (there are 9 in production)', r.status === 200 && !names(r.body).includes('Deleted User') && !names(r.body).some(n => /Deleted/.test(n)), JSON.stringify(names(r.body)));

    // ---- NOW add the crowd: 205 ineligible rows (all carrying the token "crowdtoken") inserted BEFORE two eligible late arrivals, so they fill
    //      the database's first-200 window (there is no ORDER BY) - pre-fix that pushes every later eligible match out of the window ----
    for (let i = 0; i < 205; i++) await mkU(`Crowd Member ${i}`, { verified: false, stage: 'acquisition', interests: ['crowdtoken'], photos: [] });
    const late1 = await mkU('Late Arrival One', { interests: ['crowdtoken'] }), late2 = await mkU('Late Arrival Two', { interests: ['crowdtoken'] });

    console.log('\n--- the filters are applied IN THE QUERY: 205 ineligible rows do not crowd real matches out of the 200-row window ---');
    r = await call('GET', '/api/search?q=crowdtoken', me);
    check('the two eligible accounts that share the crowd\'s token are still found (pre-fix: the window was full of ineligible rows and returned nobody)', sameSet(names(r.body), ['Late Arrival One', 'Late Arrival Two']), JSON.stringify(names(r.body)).slice(0, 160));
    check('...and not one of the 205 ineligible "Crowd Member" rows is returned', !names(r.body).some(n => /^Crowd/.test(n)), '');

    console.log('\n--- every returned account satisfies the eligibility Discover applies (property check over several terms) ---');
    let allOk = true, seen = 0;
    for (const term of ['ai', 'design', 'searchable', 'late', 'eve', 'music']) {
      const res = await call('GET', `/api/search?q=${term}`, me);
      for (const u of res.body || []) {
        seen++;
        const row = await one(`SELECT banned, deleted_at, email_verified, onboarding_stage FROM users WHERE id=$1`, [u.id]);
        if (row.banned || row.deleted_at || row.email_verified !== true || row.onboarding_stage !== 'complete') { if (allOk) console.log('   first ineligible result:', term, u.name, JSON.stringify(row)); allOk = false; }
      }
    }
    check(`across 6 search terms (${seen} results) every returned account is not banned, not deleted, verified and onboarded`, allOk && seen > 0, `seen=${seen}`);

    console.log('\n--- everything else about search is unchanged ---');
    r = await call('GET', '/api/search?q=searchable', me);
    const one1 = (r.body || []).find(u => u.name === 'Searchable Eve') || {};
    check('the result shape is still the public (A8) shape: id/name/interests present; no e-mail, password or account internals', !!one1.id && Array.isArray(one1.interests) && !('email' in one1) && !('password' in one1) && !('email_verified' in one1) && !('onboarding_stage' in one1) && !('deleted_at' in one1), Object.keys(one1).join(','));
    r = await call('GET', '/api/search?q=a', me);
    check('a 1-character query -> [] (unchanged)', r.status === 200 && Array.isArray(r.body) && r.body.length === 0, JSON.stringify(r).slice(0, 100));
    r = await call('GET', '/api/search', me);
    check('no query -> [] (unchanged)', r.status === 200 && Array.isArray(r.body) && r.body.length === 0, JSON.stringify(r).slice(0, 100));
    r = await call('GET', '/api/search?q=searchable', null);
    check('no token -> 401 (unchanged)', r.status === 401, JSON.stringify(r).slice(0, 100));
    r = await call('GET', '/api/search?q=EVE', me);
    check('matching is still case-insensitive on the name', sameSet(names(r.body), ['Searchable Eve']), JSON.stringify(names(r.body)));
    // the searcher's own eligibility is judged by the guard, as before (an unverified searcher with a thin profile is refused by discoverGuard, not by this change)
    const thin = await mkU('Thin Profile', { verified: true, stage: 'complete', interests: [] });
    await q(`UPDATE users SET intent=NULL, bio=NULL, location=NULL, linkedin='' , photos='[]'::jsonb WHERE id=$1`, [thin]);
    r = await call('GET', '/api/search?q=searchable', thin);
    check('the caller-side gate is unchanged: a searcher with trust < 10 is still refused by discoverGuard (403), not silently given results', r.status === 403, JSON.stringify(r).slice(0, 140));
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
