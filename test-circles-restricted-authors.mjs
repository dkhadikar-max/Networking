// Regression test: Circles must honor ban / deletion / block state, like Discover, search and
// every other "show me another user" surface already does.
//
//   FEED. GET /api/circles/feed (every mode, and group feeds) showed posts from anyone whose users
//   row still joined. The only author filter was `posts.filter(p => p.author)`, which only drops a
//   post when the users row is GONE - but deletion here is anonymizeUser(), an UPDATE, so a deleted
//   account's old posts kept appearing as "Deleted User"; a banned account's posts stayed fully
//   visible indefinitely; and blocks were never consulted, so a blocked (or blocking) user's posts
//   still showed - contradicting the block-enforcement contract every other surface follows.
//
//   LIKE / COLLABORATE. POST /api/circles/posts/:id/like and /collaborate write an in-app
//   notification AND send a push to the post's author - with the actor's name and photo - and never
//   checked blocks or whether the author is still a live account. A blocked user could still notify
//   the person who blocked them (a harassment channel that bypasses the block entirely), and a
//   banned/deleted author's posts could still be interacted with. Found while scoping the feed fix.
//
// Decision (this commit): the same predicates used everywhere else - isLiveTarget (not banned, not
// deleted) and a symmetric block check (either direction) - applied to the feed's authors and to
// like/collaborate, with the same uniform "not found" response so a blocked user cannot tell they
// were blocked. Deliberately NOT included: filtering authors who are merely unverified/onboarding-
// incomplete (the broader "active user" rule) - that is an eligibility policy question, not a
// ban/delete/block one, and is left for an explicit decision.
//
// How it runs (nothing can touch production): the REAL server.js (or $SERVER_JS) against a
// PostgREST-compatible translator over a REAL PostgreSQL (embedded-postgres, UTF-8); empty cwd (no
// .env), whitelisted env. Requires (test-only): npm install --no-save embedded-postgres pg
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
CREATE TABLE circle_posts (id text PRIMARY KEY, user_id text NOT NULL, text text, tags jsonb DEFAULT '[]', structured_meta jsonb DEFAULT '{}', links jsonb DEFAULT '[]', created_at timestamptz DEFAULT now(), group_id text);
CREATE TABLE circle_groups (id text PRIMARY KEY, privacy text DEFAULT 'public');
CREATE TABLE circle_group_members (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, group_id text, user_id text, role text);
CREATE TABLE circle_post_likes (id text PRIMARY KEY, post_id text NOT NULL, user_id text NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE notifications (id text PRIMARY KEY, user_id text NOT NULL, type text, actor_id text, actor_name text, actor_photo text, ref_id text, ref_type text, ref_text text, read boolean DEFAULT false, created_at timestamptz DEFAULT now());
CREATE TABLE blocks (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, from_user text NOT NULL, to_user text NOT NULL, created_at timestamptz DEFAULT now());
`;

// ---- PostgREST-compatible translator over the real Postgres (select= lists, and(...) inside or(...), author embed) ----
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
  const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-circ-pg-'));
  const pgPort = await freePort();
  const epg = new EmbeddedPostgres({ databaseDir: dbDir, user: 'postgres', password: 'pw', port: pgPort, persistent: false, initdbFlags: ['--encoding=UTF8'], onLog: () => {}, onError: () => {} });
  await epg.initialise(); await epg.start(); await epg.createDatabase('byn');
  pool = new pg.Pool({ host: '127.0.0.1', port: pgPort, user: 'postgres', password: 'pw', database: 'byn', max: 10 });
  const q = (sql, args) => pool.query(sql, args); const one = async (sql, args) => (await q(sql, args)).rows[0];
  await q(DDL);

  const shared = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-circ-shared-'));
  const stub = path.join(shared, 'stub-resend.cjs');
  fs.writeFileSync(stub, `const Module = require('module'); const orig = Module._load;
Module._load = function (request) { if (request === 'resend') { return { Resend: class { constructor() { this.emails = { send: async () => ({ data: { id: 'stub' }, error: null }) }; } } }; } return orig.apply(this, arguments); };`);
  await new Promise(r => translator.listen(0, '127.0.0.1', r)); const dbPort = translator.address().port;
  const port = await freePort(); const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-circ-'));
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, SYSTEMROOT: process.env.SYSTEMROOT, TEMP: os.tmpdir(), TMP: os.tmpdir(), HOME: cwd, USERPROFILE: cwd,
    SUPABASE_URL: `http://127.0.0.1:${dbPort}`, SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key', JWT_SECRET, ADMIN_SECRET: 'test-only-admin-secret', PORT: String(port), RESEND_API_KEY: 'test-only-resend-key' };
  let out = ''; const child = spawn(process.execPath, ['-r', stub, SERVER_JS], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  let exited = null; child.on('exit', c => { exited = c; });
  await waitFor(() => /Server on port/.test(out) || exited !== null, 60000, 200);
  const base = `http://127.0.0.1:${port}`;
  const tok = id => jwt.sign({ id, email: `${id}@example.test`, name: 'T' }, JWT_SECRET, { expiresIn: '1h' });
  let ipN = 0;
  const call = async (method, p, as, body) => { const r = await fetch(base + p, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(as ? { Authorization: `Bearer ${tok(as)}` } : {}), 'X-Forwarded-For': `10.24.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: body !== undefined ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch {} return { status: r.status, body: j }; };

  const uuid = () => crypto.randomUUID();
  const mkUser = async (name, o = {}) => {
    const id = uuid();
    await q(`INSERT INTO users (id,email,name,photos,headline,email_verified,onboarding_stage,banned,deleted_at) VALUES ($1,$2,$3,'["https://img.test/a.jpg"]'::jsonb,'A headline',true,'complete',$4,$5)`,
      [id, `${id}@example.test`, name, o.banned ?? false, o.deleted_at ?? null]);
    return id;
  };
  const mkPost = async (userId, text, groupId = null) => {
    const id = uuid();
    await q(`INSERT INTO circle_posts (id,user_id,text,group_id) VALUES ($1,$2,$3,$4)`, [id, userId, text, groupId]);
    return id;
  };
  const block = (from, to) => q(`INSERT INTO blocks (from_user,to_user) VALUES ($1,$2)`, [from, to]);
  const feed = (as, qs = '') => call('GET', `/api/circles/feed${qs}`, as);
  const authorsOf = r => (r.body?.posts || []).map(p => p.user_id).sort();
  const notifCount = async (userId, type) => Number((await one(`SELECT count(*) c FROM notifications WHERE user_id=$1 AND type=$2`, [userId, type])).c);
  const likeCount = async postId => Number((await one(`SELECT count(*) c FROM circle_post_likes WHERE post_id=$1`, [postId])).c);

  try {
    check('server booted', /Server on port/.test(out) && exited === null, out.slice(-300));

    const viewer = await mkUser('Viewer');
    const ok = await mkUser('Live Author');
    const banned = await mkUser('Banned Author', { banned: true });
    const deleted = await mkUser('Deleted Author', { deleted_at: new Date().toISOString() });
    const blockedByViewer = await mkUser('Blocked By Viewer');
    const blockedViewer = await mkUser('Blocked The Viewer');
    await block(viewer, blockedByViewer);
    await block(blockedViewer, viewer);
    const own = await mkPost(viewer, 'my own post');
    const pOk = await mkPost(ok, 'live author post');
    const pBanned = await mkPost(banned, 'banned author post');
    const pDeleted = await mkPost(deleted, 'deleted author post');
    const pBlockedByViewer = await mkPost(blockedByViewer, 'post by someone the viewer blocked');
    const pBlockedViewer = await mkPost(blockedViewer, 'post by someone who blocked the viewer');
    const expectedAuthors = [viewer, ok].sort();

    console.log('\n--- feed: banned, deleted and blocked (either direction) authors are excluded in every mode ---');
    for (const [label, qs] of [['mode=all', '?mode=all'], ['mode=for-you (default)', ''], ['mode=for-you with a tag-free explicit limit', '?limit=50']]) {
      const r = await feed(viewer, qs);
      check(`${label}: 200, only the live author and the viewer's own post remain`, r.status === 200 && JSON.stringify(authorsOf(r)) === JSON.stringify(expectedAuthors), JSON.stringify([r.status, authorsOf(r)]));
    }
    let r = await feed(viewer, '?mode=all');
    check('...a banned author\'s post is gone', !(r.body?.posts || []).some(p => p.user_id === banned), '');
    check('...a deleted (anonymized) author\'s post is gone', !(r.body?.posts || []).some(p => p.user_id === deleted), '');
    check('...a post by someone the viewer BLOCKED is gone', !(r.body?.posts || []).some(p => p.user_id === blockedByViewer), '');
    check('...a post by someone who BLOCKED the viewer is gone (symmetric)', !(r.body?.posts || []).some(p => p.user_id === blockedViewer), '');

    console.log('\n--- feed: group feeds apply the same exclusions ---');
    const group = uuid();
    await q(`INSERT INTO circle_groups (id, privacy) VALUES ($1,'public')`, [group]);
    await mkPost(ok, 'group post, live', group); await mkPost(banned, 'group post, banned', group); await mkPost(deleted, 'group post, deleted', group);
    await mkPost(blockedByViewer, 'group post, blocked by viewer', group); await mkPost(blockedViewer, 'group post, blocked the viewer', group);
    r = await feed(viewer, `?group_id=${group}`);
    check('group feed: only the live author\'s post remains', r.status === 200 && JSON.stringify(authorsOf(r)) === JSON.stringify([ok]), JSON.stringify([r.status, authorsOf(r)]));

    console.log('\n--- feed: unaffected behaviour ---');
    r = await feed(ok, '?mode=all');
    check('blocks are per-pair, not global: a viewer with NO blocks still sees authors the first viewer blocked / was blocked by, but never the banned or deleted ones',
      r.status === 200 && [viewer, ok, blockedByViewer, blockedViewer].every(id => authorsOf(r).includes(id)) && !authorsOf(r).includes(banned) && !authorsOf(r).includes(deleted), JSON.stringify(authorsOf(r)));
    const firstAuthor = (await feed(viewer, '?mode=all')).body?.posts?.find(p => p.user_id === ok)?.author;
    check('the author object keeps exactly its public shape (no banned / deleted_at leaked into the response)',
      !!firstAuthor && JSON.stringify(Object.keys(firstAuthor).sort()) === JSON.stringify(['headline', 'id', 'intent', 'name', 'photos', 'trust_score', 'verification']), JSON.stringify(Object.keys(firstAuthor || {})));

    console.log('\n--- like: a blocked / banned / deleted author\'s post cannot be liked, and nobody is notified ---');
    for (const [label, post, authorId] of [['author BLOCKED BY the viewer', pBlockedByViewer, blockedByViewer], ['author who BLOCKED the viewer', pBlockedViewer, blockedViewer], ['banned author', pBanned, banned], ['deleted author', pDeleted, deleted]]) {
      r = await call('POST', `/api/circles/posts/${post}/like`, viewer);
      check(`${label}: like -> 404 Post not found`, r.status === 404 && r.body?.error === 'Post not found', JSON.stringify(r));
      check(`${label}: no like row stored and no notification written`, (await likeCount(post)) === 0 && (await notifCount(authorId, 'circle_like')) === 0, `likes=${await likeCount(post)} notifs=${await notifCount(authorId, 'circle_like')}`);
    }

    console.log('\n--- collaborate: same refusal, same silence ---');
    for (const [label, post, authorId] of [['author BLOCKED BY the viewer', pBlockedByViewer, blockedByViewer], ['author who BLOCKED the viewer', pBlockedViewer, blockedViewer], ['banned author', pBanned, banned], ['deleted author', pDeleted, deleted]]) {
      r = await call('POST', `/api/circles/posts/${post}/collaborate`, viewer);
      check(`${label}: collaborate -> 404 Post not found`, r.status === 404 && r.body?.error === 'Post not found', JSON.stringify(r));
      check(`${label}: no notification written`, (await notifCount(authorId, 'circle_collaborate')) === 0, `notifs=${await notifCount(authorId, 'circle_collaborate')}`);
    }

    console.log('\n--- like / collaborate on a LIVE, unblocked author still work exactly as before ---');
    r = await call('POST', `/api/circles/posts/${pOk}/like`, viewer);
    check('like -> 200 liked:true, likeCount 1', r.status === 200 && r.body?.liked === true && r.body?.likeCount === 1, JSON.stringify(r));
    check('...and the author got exactly one circle_like notification', (await notifCount(ok, 'circle_like')) === 1, `notifs=${await notifCount(ok, 'circle_like')}`);
    r = await call('POST', `/api/circles/posts/${pOk}/like`, viewer);
    check('liking again toggles it off (unchanged)', r.status === 200 && r.body?.liked === false && r.body?.likeCount === 0, JSON.stringify(r));
    r = await call('POST', `/api/circles/posts/${pOk}/collaborate`, viewer);
    check('collaborate -> 200 ok', r.status === 200 && r.body?.ok === true, JSON.stringify(r));
    check('...and the author got exactly one circle_collaborate notification', (await notifCount(ok, 'circle_collaborate')) === 1, `notifs=${await notifCount(ok, 'circle_collaborate')}`);
    r = await call('POST', `/api/circles/posts/${own}/like`, viewer);
    check('liking your OWN post still works and notifies nobody (unchanged)', r.status === 200 && r.body?.liked === true && (await notifCount(viewer, 'circle_like')) === 0, JSON.stringify(r));
    r = await call('POST', `/api/circles/posts/${uuid()}/like`, viewer);
    check('a nonexistent post -> 404 (unchanged)', r.status === 404, JSON.stringify(r));

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
