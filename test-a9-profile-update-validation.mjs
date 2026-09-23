// Regression test for audit finding A9 - PUT /api/me accepted blank / invisible names and arbitrary `intent` values.
//
//   PUT /api/me put `name` and `intent` straight into the UPDATE:
//     * name: '', '   ', a run of zero-width characters, null, a number or an object were all accepted
//       (the first three blank the display name of a NAMED account after registration - defeating the
//       "no unnamed account" rule that registration enforces with hasDisplayableChar(); null/objects made
//       the UPDATE fail and the route crash into a 500). There was also no length cap (registration caps at 120).
//     * intent: NOT in the sanitize list at all - any string of any length (and any JSON type) was stored,
//       then shown to other users on profile cards and used by matching.
//
// Invariant enforced here: a name that is set through PUT /api/me has a displayable character (same
// hasDisplayableChar() as registration), is a string, and is at most 120 chars; an intent is one of the
// values the platform's own clients use. Anything else is a 400 that changes NOTHING (no partial update).
// Deliberate non-breaking edges, tested too: a blank/absent intent is a no-op (the web editor sends '' for
// an account with no intent), intents match case-insensitively (the web editor compares that way), and a
// LEGACY account whose stored name is already blank can re-submit that blank name without being blocked
// (the legacy-data decision is separate) while still being able to set a real one.
//
// How it runs (nothing can touch production): the REAL server.js (or $SERVER_JS) against a PostgREST-compatible
// translator over a REAL PostgreSQL (embedded-postgres); empty cwd (no .env), whitelisted env.
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

const DDL = `
CREATE TABLE users (
  id text PRIMARY KEY, email text, password text, name text NOT NULL DEFAULT '', bio text, headline text, photos jsonb DEFAULT '[]', instagram text DEFAULT '', linkedin text DEFAULT '',
  website text DEFAULT '', location text DEFAULT '', lat numeric, lng numeric, remote boolean DEFAULT false, skills jsonb DEFAULT '[]', interests jsonb DEFAULT '[]',
  currently_exploring text DEFAULT '', working_on text DEFAULT '', interested_in text DEFAULT '', intent text, role text DEFAULT 'user',
  premium boolean DEFAULT false, premium_expires_at timestamptz, premium_plan text, premium_since timestamptz, trust_score int DEFAULT 10, profile_score int DEFAULT 30,
  is_profile_complete boolean DEFAULT false, verification jsonb DEFAULT '{"status":"none","confidence":0}', banned boolean DEFAULT false, deleted_at timestamptz,
  email_verified boolean DEFAULT true, onboarding_stage text DEFAULT 'complete', password_set boolean DEFAULT true, password_changed_at timestamptz, push_token text,
  last_active timestamptz, created_at timestamptz DEFAULT now());
`;

// ---- PostgREST-compatible translator over the real Postgres (honors select= lists) ----
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
function where(table, cols, params, args) {
  const parts = [];
  for (const [k, v] of params) {
    if (NON_FILTER.has(k)) continue;
    if (k === 'or') {
      const inner = v.replace(/^\(|\)$/g, '').split(/,(?![^(]*\))/).map(c => { const m = /^([a-z_0-9]+)\.(not\.)?([a-z]+)\.(.*)$/.exec(c); if (!m) throw new PgLike(400, 'PGRST100', `bad or() condition ${c}`); return cond(table, cols, args, m[1], !!m[2], m[3], m[4]); });
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
      if (process.env.A9_DEBUG) console.log(`[translator] ${req.method} ${table}: ${e.code || ''} ${e.message}`.slice(0, 200));
      if (e instanceof PgLike) return send(e.status, { code: e.pgCode, message: e.message, details: null, hint: null });
      send(400, { code: e.code || 'XX000', message: e.message, details: e.detail ?? null, hint: e.hint ?? null });
    }
  });
});

async function main() {
  const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a9-pg-'));
  const pgPort = await freePort();
  // UTF-8 like production (the Windows default here is WIN1252, which cannot even STORE a zero-width character)
  const epg = new EmbeddedPostgres({ databaseDir: dbDir, user: 'postgres', password: 'pw', port: pgPort, persistent: false, initdbFlags: ['--encoding=UTF8'], onLog: () => {}, onError: () => {} });
  await epg.initialise(); await epg.start(); await epg.createDatabase('byn');
  pool = new pg.Pool({ host: '127.0.0.1', port: pgPort, user: 'postgres', password: 'pw', database: 'byn', max: 10 });
  const q = (sql, args) => pool.query(sql, args); const one = async (sql, args) => (await q(sql, args)).rows[0];
  await q(DDL);

  const shared = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a9-shared-'));
  const stub = path.join(shared, 'stub-resend.cjs');
  fs.writeFileSync(stub, `const Module = require('module'); const orig = Module._load;
Module._load = function (request) { if (request === 'resend') { return { Resend: class { constructor() { this.emails = { send: async () => ({ data: { id: 'stub' }, error: null }) }; } } }; } return orig.apply(this, arguments); };`);
  await new Promise(r => translator.listen(0, '127.0.0.1', r)); const dbPort = translator.address().port;
  const port = await freePort(); const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a9-'));
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, SYSTEMROOT: process.env.SYSTEMROOT, TEMP: os.tmpdir(), TMP: os.tmpdir(), HOME: cwd, USERPROFILE: cwd,
    SUPABASE_URL: `http://127.0.0.1:${dbPort}`, SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key', JWT_SECRET, ADMIN_SECRET: 'test-only-admin-secret', PORT: String(port), RESEND_API_KEY: 'test-only-resend-key' };
  let out = ''; const child = spawn(process.execPath, ['-r', stub, SERVER_JS], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  let exited = null; child.on('exit', c => { exited = c; });
  await waitFor(() => /Server on port/.test(out) || exited !== null, 60000, 200);
  const base = `http://127.0.0.1:${port}`;
  const tok = id => jwt.sign({ id, email: `${id}@example.test`, name: 'T' }, JWT_SECRET, { expiresIn: '1h' });
  const put = async (id, body) => { const r = await fetch(base + '/api/me', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok(id)}` }, body: JSON.stringify(body) }); let j = null; try { j = await r.json(); } catch {} return { status: r.status, body: j }; };
  let n = 0;
  const mk = async (o = {}) => { const id = `u${++n}`; await q(`INSERT INTO users (id,email,name,bio,location,intent,interests,skills,last_active) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,now())`,
    [id, `${id}@example.test`, o.name ?? 'Original Name', o.bio ?? 'An original biography text', o.location ?? 'Pune', 'intent' in o ? o.intent : 'explore-network', JSON.stringify(['ai', 'design', 'music']), JSON.stringify(['react'])]); return id; };
  const row = id => one(`SELECT name, bio, intent, location FROM users WHERE id=$1`, [id]);

  try {
    check('server booted', /Server on port/.test(out) && exited === null, out.slice(-300));

    console.log('\n--- name: a valid change still works ---');
    let u = await mk();
    let r = await put(u, { name: '  Ada Lovelace  ' });
    check('a valid name -> 200, stored TRIMMED', r.status === 200 && (await row(u)).name === 'Ada Lovelace', JSON.stringify([r.status, (await row(u)).name]));
    check('...and the response carries the updated name (the /api/me shape is unchanged)', r.body?.name === 'Ada Lovelace' && 'email' in (r.body || {}) && 'trust_steps' in (r.body || {}), JSON.stringify(Object.keys(r.body || {})).slice(0, 160));

    console.log('\n--- name: blank / invisible names are rejected and change NOTHING ---');
    const BLANKS = [['empty string', ''], ['spaces', '   '], ['tab + newline', '\t\n'], ['zero-width space', '​'], ['zero-width joiner run', '‍‍‍'],
      ['byte-order mark', '﻿'], ['word joiner', '⁠'], ['soft hyphen', '­'], ['NBSP + ideographic space', ' 　'], ['spaces + zero-width mix', ' ​ ‌ ']];
    for (const [label, name] of BLANKS) {
      u = await mk();
      r = await put(u, { name, bio: 'must not be applied either' });
      const s = await row(u);
      check(`blank name (${label}) -> 400, and NOTHING changed (name and bio intact)`, r.status === 400 && s.name === 'Original Name' && s.bio === 'An original biography text', JSON.stringify([r.status, r.body?.error, s.name]));
    }
    check('the error says a name is required', /name/i.test(r.body?.error || ''), JSON.stringify(r.body));

    console.log('\n--- name: wrong types ---');
    for (const [label, name] of [['number', 12345], ['object', { a: 1 }], ['array', ['x']], ['boolean', true], ['null', null]]) {
      u = await mk();
      r = await put(u, { name });
      check(`name as ${label} -> 400 (was: stored garbage or a 500), unchanged`, r.status === 400 && (await row(u)).name === 'Original Name', JSON.stringify([r.status, r.body?.error]));
    }

    console.log('\n--- name: at most 120 characters (the registration limit) - rejected, not silently truncated ---');
    u = await mk(); r = await put(u, { name: 'N'.repeat(120), bio: 'A bio applied with a 120-char name' });
    check('a name of exactly 120 characters is accepted and stored whole', r.status === 200 && (await row(u)).name === 'N'.repeat(120), `status=${r.status} len=${(await row(u)).name.length}`);
    u = await mk(); r = await put(u, { name: 'N'.repeat(121), bio: 'must not be applied either' });
    check('a 121-character name -> 400, and NOTHING changed (name and bio intact)', r.status === 400 && (await row(u)).name === 'Original Name' && (await row(u)).bio === 'An original biography text', JSON.stringify([r.status, r.body?.error, (await row(u)).name.length]));
    check('...with a message that says why', /120/.test(r.body?.error || ''), JSON.stringify(r.body));
    u = await mk(); r = await put(u, { name: 'N'.repeat(500) });
    check('a 500-character name -> 400, unchanged (was: stored in full, 200)', r.status === 400 && (await row(u)).name === 'Original Name', JSON.stringify([r.status, (await row(u)).name.length]));
    u = await mk(); r = await put(u, { name: 'N'.repeat(5000) });
    check('a 5000-character name (beyond the generic 1000-char sanitizer cut) -> 400, unchanged', r.status === 400 && (await row(u)).name === 'Original Name', JSON.stringify([r.status, (await row(u)).name.length]));
    u = await mk(); r = await put(u, { name: '​'.repeat(130) + 'Visible' });
    check('invisible padding followed by a real name, over 120 in total -> 400, unchanged', r.status === 400 && (await row(u)).name === 'Original Name', JSON.stringify([r.status, (await row(u)).name.length]));

    console.log('\n--- name: not sent -> untouched; a name with real characters mixed with invisible ones is fine ---');
    u = await mk(); r = await put(u, { bio: 'A new biography, long enough' });
    check('an update that does not mention name leaves it alone', r.status === 200 && (await row(u)).name === 'Original Name' && (await row(u)).bio === 'A new biography, long enough', JSON.stringify(r.status));

    console.log('\n--- name: LEGACY unnamed account (stored name is already blank) is not newly blocked ---');
    u = await mk({ name: '' });
    r = await put(u, { name: '', bio: 'Legacy user edits their bio' });
    check('re-submitting the same blank name while editing something else -> 200, bio saved, name stays blank (the legacy-data decision is separate)', r.status === 200 && (await row(u)).bio === 'Legacy user edits their bio' && (await row(u)).name === '', JSON.stringify([r.status, r.body?.error, await row(u)]));
    r = await put(u, { name: 'Now Named' });
    check('...and they can still set a real name', r.status === 200 && (await row(u)).name === 'Now Named', JSON.stringify([r.status, (await row(u)).name]));
    r = await put(u, { name: '' });
    check('...but once named, blanking it again is refused', r.status === 400 && (await row(u)).name === 'Now Named', JSON.stringify([r.status, (await row(u)).name]));

    console.log('\n--- intent: every value the platform\'s own clients use is accepted ---');
    const SLUGS = ['explore-network', 'exchange-ideas', 'learn-mentorship', 'build-relationships', 'collaborate', 'find-cofounder', 'find-mentor', 'hire', 'find-investors'];      // matching + onboarding + mobile
    const WEB_CHIPS = ['Hiring', 'Freelance', 'Co-founder', 'Mentorship', 'Investing', 'Networking'];                                                                         // web ProfileEdit chips
    const ONBOARDING = ['Networking', 'Find Opportunities', 'Build Startup Connections', 'Find Co-founder', 'Hiring', 'Find Clients', 'Mentorship', 'Learn from People', 'Community', 'Investment Opportunities'];   // VALID_INTENTS
    const ALL = [...new Set([...SLUGS, ...WEB_CHIPS, ...ONBOARDING])];
    // A19b (intent vocabulary mismatch): every one of these is still ACCEPTED (no new 400s), but is
    // now folded onto one of the 5 INTENT_COMPAT slugs at write time instead of being echoed back
    // verbatim — matching, the Discover filter and ice-breakers all compare against that one
    // vocabulary now, wherever the value originally came from.
    const CANONICAL = {
      'explore-network': 'explore-network', 'exchange-ideas': 'exchange-ideas', 'learn-mentorship': 'learn-mentorship',
      'build-relationships': 'build-relationships', 'collaborate': 'collaborate',
      'find-cofounder': 'collaborate', 'find-mentor': 'learn-mentorship', 'hire': 'build-relationships', 'find-investors': 'explore-network',
      'Hiring': 'build-relationships', 'Freelance': 'build-relationships', 'Co-founder': 'collaborate', 'Mentorship': 'learn-mentorship',
      'Investing': 'explore-network', 'Networking': 'explore-network',
      'Find Opportunities': 'explore-network', 'Build Startup Connections': 'build-relationships', 'Find Co-founder': 'collaborate',
      'Find Clients': 'build-relationships', 'Learn from People': 'learn-mentorship', 'Community': 'build-relationships',
      'Investment Opportunities': 'explore-network',
    };
    u = await mk(); const rejected = [];
    for (const v of ALL) { r = await put(u, { intent: v }); const got = (await row(u)).intent; if (r.status !== 200 || got !== CANONICAL[v]) rejected.push(`${v}(${r.status}, got ${got})`); }
    check(`all ${ALL.length} known intent values are accepted and stored in canonical form`, rejected.length === 0, `rejected: ${rejected.join(', ')}`);
    const stored = ['explore-network', 'build-relationships', 'Networking', 'Freelance', 'collaborate', 'Mentorship', 'learn-mentorship', 'Co-founder', 'find-cofounder'];   // what production holds today
    check('every value production holds today is inside the accepted set (an ordinary edit re-sends the stored intent)', stored.every(v => ALL.includes(v)), stored.filter(v => !ALL.includes(v)).join(','));

    console.log('\n--- intent: arbitrary values are rejected and change NOTHING ---');
    for (const [label, intent] of [['free text', 'hack the planet'], ['html', '<script>alert(1)</script>'], ['spam link', 'Buy cheap pills http://spam.example'], ['sql-ish', "explore-network'; DROP TABLE users;--"],
      ['5000 chars', 'x'.repeat(5000)], ['zero-width', '​​'], ['near-miss', 'explore network']]) {
      u = await mk();
      r = await put(u, { intent, bio: 'must not be applied either' });
      const s = await row(u);
      check(`intent ${label} -> 400, and NOTHING changed`, r.status === 400 && s.intent === 'explore-network' && s.bio === 'An original biography text', JSON.stringify([r.status, r.body?.error, String(s.intent).slice(0, 30)]));
    }
    for (const [label, intent] of [['number', 123], ['object', { a: 1 }], ['array', ['collaborate']], ['boolean', true]]) {
      u = await mk(); r = await put(u, { intent });
      check(`intent as ${label} -> 400, unchanged`, r.status === 400 && (await row(u)).intent === 'explore-network', JSON.stringify([r.status, r.body?.error]));
    }

    console.log('\n--- intent: deliberate non-breaking edges ---');
    u = await mk({ intent: null }); r = await put(u, { intent: '', bio: 'Editing with an empty intent, as the web form does' });
    check('a blank intent is a NO-OP (the web editor sends "" for an account with no intent): 200, other fields saved, intent not overwritten with ""', r.status === 200 && (await row(u)).intent === null && (await row(u)).bio === 'Editing with an empty intent, as the web form does', JSON.stringify([r.status, await row(u)]));
    u = await mk(); r = await put(u, { intent: '   ' });
    check('a whitespace-only intent is also a no-op (existing intent kept)', r.status === 200 && (await row(u)).intent === 'explore-network', JSON.stringify([r.status, (await row(u)).intent]));
    u = await mk(); r = await put(u, { intent: 'networking' }); const c1 = (await row(u)).intent; r = await put(u, { intent: 'EXPLORE-NETWORK' });
    check('intents match case-insensitively and both fold onto the same canonical slug (networking -> explore-network, EXPLORE-NETWORK -> explore-network)', c1 === 'explore-network' && (await row(u)).intent === 'explore-network', JSON.stringify([c1, (await row(u)).intent]));

    console.log('\n--- the ordinary web-editor save is unaffected ---');
    u = await mk();
    r = await put(u, { name: 'Grace Hopper', bio: 'Compiler pioneer and rear admiral', location: 'Arlington', intent: 'Mentorship', skills: ['cobol', 'compilers'], interests: ['history', 'ai', 'navy'], instagram: '', linkedin: 'https://linkedin.com/in/grace', website: '', remote: true, lat: 38.87, lng: -77.05 });
    const g = await one(`SELECT name, bio, location, intent, skills, interests, remote, lat FROM users WHERE id=$1`, [u]);
    check('a full edit (name, bio, location, intent, skills, interests, links, remote, coordinates) -> 200 and everything applied (intent "Mentorship" -> canonical "learn-mentorship", A19b)', r.status === 200 && g.name === 'Grace Hopper' && g.intent === 'learn-mentorship' && g.location === 'Arlington' && g.remote === true && g.skills.length === 2 && g.interests.length === 3 && Number(g.lat) === 38.87, JSON.stringify([r.status, r.body?.error, g]).slice(0, 260));
    check('...the response still reports recomputed scores', typeof r.body?.trust_score === 'number' && typeof r.body?.profile_score === 'number' && 'is_profile_complete' in (r.body || {}), JSON.stringify(Object.keys(r.body || {})).slice(0, 200));
    r = await put(u, { lat: 40.71, lng: -74.0 });
    check('a location-only update (what the web app sends on GPS) -> 200', r.status === 200, JSON.stringify(r.status));
  } finally {
    const gone = new Promise(res => { if (exited !== null) res(); else child.once('exit', res); }); child.kill(); await Promise.race([gone, sleep(5000)]);
    try { await pool.end(); } catch {}
    await new Promise(r => translator.close(r));
    try { await epg.stop(); } catch {}
    await sleep(500);
    for (const d of [dbDir, shared, cwd]) { try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch { /* temp only */ } }
  }
  if (fail > 0 && process.env.A9_DEBUG) console.log('\n--- server log: "Update me error" lines ---\n' + [...new Set(out.split('\n').filter(l => /Update me error|TypeError|Cannot read/.test(l)))].slice(0, 6).join('\n'));
  console.log(`\n=== RESULTS: ${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
