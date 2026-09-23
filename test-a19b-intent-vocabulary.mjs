// Regression test for audit finding A19b - three different clients write three non-overlapping
// vocabularies into the single `users.intent` column, and the code that reads it assumes just one.
//
//   Onboarding (POST /api/onboarding/intent, the one path every user goes through) writes one of 5
//   kebab-case slugs (INTENT_LEGACY_MAP -> INTENT_COMPAT's keys): explore-network, exchange-ideas,
//   learn-mentorship, build-relationships, collaborate.
//   Web ProfileEdit (PUT /api/me) used to write one of 6 Title-Case labels VERBATIM: Hiring, Freelance,
//   Co-founder, Mentorship, Investing, Networking (frontend/components/profile/ProfileEdit.tsx).
//   The old NetworkApp mobile profile screen writes those same 5 slugs OR 4 more: find-cofounder,
//   find-mentor, hire, find-investors.
//   Four places assumed the column only ever held the first vocabulary:
//     * matchScore's intent-compatibility bonus (INTENT_COMPAT[a.intent] - undefined for anything else,
//       so it silently fell back to the "not compatible" score, even between two users with the exact
//       same PROFILE_INTENT_EXTRAS value);
//     * Discover's ?intent= filter (u.intent === intent, an exact string match) - the web's own filter
//       chips send the Title-Case vocabulary, which onboarding never writes, so the filter matched
//       almost no one;
//     * ice-breakers' "shared intent" chip (a plain string comparison);
//     * /api/conversation-starters' intentPrompts lookup (keyed only by the 5 slugs).
//   Resolution (decided by the user): canonicalize to the 5 onboarding slugs everywhere. A new
//   canonicalIntentSlug() folds every value any client has ever written onto one of those 5, reusing
//   INTENT_LEGACY_MAP for the values that overlap it. PUT /api/me now stores the canonical slug
//   regardless of which vocabulary the client sent (still accepts every previously-recognised value -
//   no new 400s - it just normalises what gets stored); the four read sites above resolve BOTH sides
//   through the same function before comparing, so already-stored legacy/extra values work correctly
//   too, with no data migration required.
//
// Invariant enforced here: two users whose stored `intent` values differ only by WHICH client wrote
// them, but mean the same one of the 5 canonical intents, are treated as identical by every one of the
// four read sites; PUT /api/me still accepts every value it did before and now always stores one of
// the 5 slugs; an unrecognised value is still rejected exactly as before.
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
  last_active timestamptz, created_at timestamptz DEFAULT now(),
  reply_count int DEFAULT 0, avg_reply_minutes int DEFAULT 0, response_rate int DEFAULT 100);
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
  const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a19b-pg-'));
  const pgPort = await freePort();
  const epg = new EmbeddedPostgres({ databaseDir: dbDir, user: 'postgres', password: 'pw', port: pgPort, persistent: false, initdbFlags: ['--encoding=UTF8'], onLog: () => {}, onError: () => {} });
  await epg.initialise(); await epg.start(); await epg.createDatabase('byn');
  pool = new pg.Pool({ host: '127.0.0.1', port: pgPort, user: 'postgres', password: 'pw', database: 'byn', max: 10 });
  const q = (sql, args) => pool.query(sql, args); const one = async (sql, args) => (await q(sql, args)).rows[0];
  await q(DDL);

  const shared = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a19b-shared-'));
  const stub = path.join(shared, 'stub-resend.cjs');
  fs.writeFileSync(stub, `const Module = require('module'); const orig = Module._load;
Module._load = function (request) { if (request === 'resend') { return { Resend: class { constructor() { this.emails = { send: async () => ({ data: { id: 'stub' }, error: null }) }; } } }; } return orig.apply(this, arguments); };`);
  await new Promise(r => translator.listen(0, '127.0.0.1', r)); const dbPort = translator.address().port;
  const port = await freePort(); const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a19b-'));
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, SYSTEMROOT: process.env.SYSTEMROOT, TEMP: os.tmpdir(), TMP: os.tmpdir(), HOME: cwd, USERPROFILE: cwd,
    SUPABASE_URL: `http://127.0.0.1:${dbPort}`, SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key', JWT_SECRET, ADMIN_SECRET: 'test-only-admin-secret', PORT: String(port), RESEND_API_KEY: 'test-only-resend-key' };
  let out = ''; const child = spawn(process.execPath, ['-r', stub, SERVER_JS], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  let exited = null; child.on('exit', c => { exited = c; });
  await waitFor(() => /Server on port/.test(out) || exited !== null, 60000, 200);
  const base = `http://127.0.0.1:${port}`;
  const tok = id => jwt.sign({ id, email: `${id}@example.test`, name: 'T' }, JWT_SECRET, { expiresIn: '1h' });
  let ipN = 0;
  const call = async (method, p, as, body) => { const r = await fetch(base + p, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(as ? { Authorization: `Bearer ${tok(as)}` } : {}), 'X-Forwarded-For': `10.15.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: body !== undefined ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch {} return { status: r.status, body: j }; };

  const uuid = () => crypto.randomUUID();
  // A user with a given RAW `intent` value, as any of the three writers could have stored it -
  // skills/interests/location left empty on purpose so matchScore's intent component is isolated.
  const mkU = async (name, intent) => {
    const id = uuid();
    await q(`INSERT INTO users (id,email,name,bio,headline,location,photos,interests,skills,intent,linkedin,trust_score,email_verified,onboarding_stage,banned,last_active)
             VALUES ($1,$2,$3,'A complete biography text','','','["1"]'::jsonb,'[]'::jsonb,'[]'::jsonb,$4,'https://linkedin.com/in/x',10,true,'complete',false,now())`,
      [id, `${id}@example.test`, name, intent]);
    return id;
  };
  const mkConn = async (a, b) => {
    const id = uuid();
    await q(`INSERT INTO connections (id, user1, user2, expires_at, active, user1_responded, user2_responded) VALUES ($1,$2,$3,$4,true,true,true)`, [id, a, b, new Date(Date.now() + 86400000).toISOString()]);
    return id;
  };
  const discover = (as, qs = '') => call('GET', `/api/discover${qs}`, as);
  const byId = (body, id) => (body?.profiles || []).find(p => p.id === id);
  const ids = body => (body?.profiles || []).map(p => p.id);
  const putMe = (as, body) => call('PUT', '/api/me', as, body);

  try {
    check('server booted', /Server on port/.test(out) && exited === null, out.slice(-300));

    console.log('\n--- matchScore: the SAME real intent, written by three different clients, must be equally compatible ---');
    // viewer's own intent is the canonical 'collaborate' (as onboarding writes it)
    const viewer1 = await mkU('Viewer 1', 'collaborate');
    const sameMeaningMobile = await mkU('Same meaning (old mobile)', 'find-cofounder');    // NetworkApp's extra slug for "find a co-founder"
    const sameMeaningWeb    = await mkU('Same meaning (web)',        'Co-founder');        // ProfileEdit's Title-Case label for the same thing
    const differentMeaning  = await mkU('Different meaning',         'learn-mentorship');  // a genuinely different canonical intent
    let r = await discover(viewer1);
    const pMobile = byId(r.body, sameMeaningMobile), pWeb = byId(r.body, sameMeaningWeb), pDiff = byId(r.body, differentMeaning);
    check('old-mobile "find-cofounder" scores as compatible with "collaborate" (38, was 21 - the flat "incompatible" score)', pMobile?.matchScore === 38, JSON.stringify(pMobile?.matchScore));
    check('web "Co-founder" scores the same way (38)', pWeb?.matchScore === 38, JSON.stringify(pWeb?.matchScore));
    check('a genuinely different intent still scores as incompatible (21)', pDiff?.matchScore === 21, JSON.stringify(pDiff?.matchScore));

    console.log('\n--- Discover\'s intent filter: the web\'s own Title-Case chip must match every vocabulary that means the same thing ---');
    const filterViewer = await mkU('Filter Viewer', 'collaborate');
    const fOnboarding = await mkU('From onboarding', 'collaborate');      // the canonical slug directly
    const fMobile      = await mkU('From old mobile', 'find-cofounder');
    const fWeb          = await mkU('From web edit',   'Co-founder');       // the exact filter value itself
    const fOther         = await mkU('Unrelated intent', 'learn-mentorship');
    r = await discover(filterViewer, '?intent=Co-founder');                 // exactly what DiscoverFilters.tsx sends for this chip
    check('matches the onboarding-sourced candidate (was: only an exact string match, so this never did)', ids(r.body).includes(fOnboarding), JSON.stringify(ids(r.body)));
    check('matches the old-mobile-sourced candidate', ids(r.body).includes(fMobile), JSON.stringify(ids(r.body)));
    check('matches the web-sourced candidate (the literal value - must still work)', ids(r.body).includes(fWeb), JSON.stringify(ids(r.body)));
    check('does NOT match a genuinely different intent', !ids(r.body).includes(fOther), JSON.stringify(ids(r.body)));

    console.log('\n--- ice-breakers\' "shared intent" chip must fire across vocabularies too ---');
    const icebA = await mkU('Iceb A', 'collaborate');
    const icebB = await mkU('Iceb B', 'find-cofounder');
    const connAB = await mkConn(icebA, icebB);
    r = await call('GET', `/api/connections/${connAB}`, icebA);
    const labels = (r.body?.icebreakers || []).map(c => c.label);
    check('the "Shared intent" chip appears (was: absent - different raw strings)', labels.includes('🎯 Shared intent'), JSON.stringify(labels));

    console.log('\n--- /api/conversation-starters: an old-mobile-only intent value still produces its intent-based prompt ---');
    const meNoOverlap    = await mkU('Starter Me', 'collaborate');
    const otherInvestor  = await mkU('Starter Other', 'find-investors');    // canonicalises to explore-network
    const connStarters = await mkConn(meNoOverlap, otherInvestor);
    r = await call('GET', `/api/conversation-starters/${connStarters}`, meNoOverlap);
    check('the explore-network prompt is present (was: intentPrompts["find-investors"] is undefined, so nothing was added for it)', (r.body?.prompts || []).some(p => p.includes('kind of connections have been most valuable')), JSON.stringify(r.body?.prompts));

    console.log('\n--- PUT /api/me: every value any client has ever sent is still accepted, and now stores the canonical slug ---');
    const editor = await mkU('Editor', null);
    const writeCases = [
      ['Co-founder',       'collaborate'],           // web label -> canonical
      ['find-investors',   'explore-network'],        // old-mobile extra -> canonical
      ['find-mentor',      'learn-mentorship'],
      ['hire',             'build-relationships'],
      ['Freelance',        'build-relationships'],
      ['Investing',        'explore-network'],
      ['Hiring',           'build-relationships'],    // overlaps VALID_INTENTS too - already had a mapping
      ['Mentorship',       'learn-mentorship'],
      ['Networking',       'explore-network'],
      ['Find Co-founder',  'collaborate'],            // onboarding's own VALID_INTENTS label, unaffected
      ['collaborate',      'collaborate'],            // already canonical -> unchanged
      ['exchange-ideas',   'exchange-ideas'],
    ];
    for (const [sent, want] of writeCases) {
      r = await putMe(editor, { intent: sent });
      check(`intent:'${sent}' -> 200, stored as '${want}'`, r.status === 200 && r.body?.intent === want, JSON.stringify([r.status, r.body?.intent]));
    }
    r = await putMe(editor, { intent: 'not-a-real-intent' });
    check('an unrecognised value is still rejected -> 400 (unchanged)', r.status === 400, JSON.stringify(r));
    r = await putMe(editor, { intent: '' });
    check('an empty intent is still a no-op, not an error (unchanged)', r.status === 200, JSON.stringify(r.status));

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
