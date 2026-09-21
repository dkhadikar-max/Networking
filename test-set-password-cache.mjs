// Regression test for audit finding A2:
//
//   POST /api/auth/set-password guards with `req.userData?.password_set`.
//   On an auth-cache HIT, req.userData is the narrow cached slice
//   (id/banned/premium/password_changed_at/deleted_at/role + _cached:true),
//   which never carries password_set — so the "Password already set" guard
//   evaluates `undefined` and is skipped. Any authenticated session on a warm
//   cache (the SPA warms it with GET /api/me on every page load) could
//   therefore overwrite an ALREADY-PASSWORD-PROTECTED account's password
//   without knowing the old one. Combined with set-password deliberately not
//   bumping password_changed_at, a stolen 24h session became permanent
//   takeover.
//
// Boots the REAL, UNMODIFIED server.js against a local fake PostgREST
// endpoint (in-memory users) with an empty working directory (no .env) and a
// whitelisted environment — no production credentials, cannot reach
// production data. Standalone script (repo convention); exit code = number
// of failed checks.

import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const here = path.dirname(fileURLToPath(import.meta.url));
const SERVER_JS = path.join(here, 'server.js');
const JWT_SECRET = 'test-only-jwt-secret';

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}  ${detail ?? ''}`); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Fake database ────────────────────────────────────────────────────────────
const OLD_PW = 'OriginalPassw0rd!';
const ATTACKER_PW = 'AttackerChosen999';
const NEW_PW = 'BrandNewPassw0rd!';
const oldHash = bcrypt.hashSync(OLD_PW, 4);
const unusableHash = bcrypt.hashSync('never-disclosed-random-placeholder', 4);

const mkUser = (id, over) => ({
  id, email: `${id}@example.test`, password: oldHash, name: 'Test User',
  bio: '', headline: null, photos: [], instagram: '', linkedin: '', website: '', location: '',
  lat: null, lng: null, remote: false, skills: [], interests: [], intent: 'explore-network',
  role: 'user', premium: false, premium_expires_at: null, trust_score: 10, profile_score: 30,
  is_profile_complete: false, verification: { status: 'none', confidence: 0 }, banned: false,
  deleted_at: null, email_verified: true, onboarding_stage: 'complete', password_set: true,
  password_changed_at: null, failed_login_attempts: 0, lockout_until: null, last_active: null,
  created_at: '2026-01-01T00:00:00.000Z', ...over,
});
const users = [
  mkUser('pw_cold',  {}),                                                        // has a real password; first authed call = set-password (cold cache)
  mkUser('pw_warm',  {}),                                                        // has a real password; cache warmed first
  mkUser('pw_short', {}),                                                        // has a real password; invalid body on a warm cache
  mkUser('new_cold', { password: unusableHash, password_set: false }),           // fresh magic-link account, cold cache
  mkUser('new_warm', { password: unusableHash, password_set: false }),           // fresh magic-link account, warm cache (the real SPA flow)
  mkUser('new_short', { password: unusableHash, password_set: false }),          // fresh account, too-short password
];
const byId = id => users.find(u => u.id === id);

const requestLog = [];
const NON_FILTER = new Set(['select', 'order', 'limit', 'offset', 'columns', 'on_conflict']);
function parseFilters(params) {
  const conds = []; let unsupported = false;
  for (const [k, v] of params) {
    if (NON_FILTER.has(k)) continue;
    const m = /^(eq|neq|is)\.(.*)$/.exec(v);
    if (!m) { unsupported = true; continue; }
    conds.push([k, m[1], m[2]]);
  }
  return { conds, unsupported };
}
const rowMatches = (row, conds) => conds.every(([k, op, val]) => {
  const cur = row[k];
  if (op === 'eq')  return String(cur) === val;
  if (op === 'neq') return String(cur) !== val;
  return val === 'null' ? cur == null : String(cur) === val;
});

const mock = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    const url = new URL(req.url, 'http://mock');
    const table = url.pathname.replace(/^\/rest\/v1\//, '');
    const raw = Buffer.concat(chunks).toString('utf8');
    let body = null; try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
    requestLog.push({ method: req.method, table, search: url.search, body });
    const json = (status, payload, extra = {}) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...extra }); res.end(payload === undefined ? undefined : JSON.stringify(payload)); };

    if (req.method === 'GET' || req.method === 'HEAD') {
      // Only the users table holds data; everything else (works, connections, …)
      // is empty. Any filter the fake doesn't implement returns [] — that keeps
      // the server's background startup jobs inert.
      let list = [];
      if (table === 'users') {
        const { conds, unsupported } = parseFilters(url.searchParams);
        list = unsupported ? [] : users.filter(u => rowMatches(u, conds)).map(u => structuredClone(u));
      }
      if ((req.headers.accept || '').includes('vnd.pgrst.object+json')) {
        return list.length === 1 ? json(200, list[0]) : json(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: null, hint: null });
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Range': `*/${list.length}` });
      return res.end(req.method === 'HEAD' ? undefined : JSON.stringify(list));
    }
    if (req.method === 'PATCH' && table === 'users' && body && typeof body === 'object') {
      const { conds, unsupported } = parseFilters(url.searchParams);
      const hit = unsupported ? [] : users.filter(u => rowMatches(u, conds));
      hit.forEach(u => Object.assign(u, body));
      return /return=representation/.test(req.headers.prefer || '')
        ? json(200, hit, { 'Content-Range': `*/${hit.length}` })
        : json(204, undefined, { 'Content-Range': `*/${hit.length}` });
    }
    res.writeHead(req.method === 'POST' ? 201 : 204, { 'Content-Range': '*/0' });
    res.end();
  });
});

const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer();
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  s.on('error', reject);
});

async function main() {
  await new Promise(r => mock.listen(0, '127.0.0.1', r));
  const mockPort = mock.address().port;
  const serverPort = await freePort();
  const BASE = `http://127.0.0.1:${serverPort}`;
  const emptyCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a2-'));

  const env = {
    PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, SYSTEMROOT: process.env.SYSTEMROOT,
    TEMP: os.tmpdir(), TMP: os.tmpdir(), HOME: emptyCwd, USERPROFILE: emptyCwd,
    SUPABASE_URL: `http://127.0.0.1:${mockPort}`, SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key',
    JWT_SECRET, ADMIN_SECRET: 'test-only-admin-secret', PORT: String(serverPort),
  };

  console.log('=== Booting the real server.js against a local fake DB (no production access) ===');
  let out = '';
  const child = spawn(process.execPath, [SERVER_JS], { cwd: emptyCwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { out += d; });
  let exited = null; child.on('exit', code => { exited = code; });

  const api = async (method, p, { token, body } = {}) => {
    const res = await fetch(BASE + p, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
    let j = null; try { j = await res.json(); } catch {}
    return { status: res.status, body: j };
  };
  const login = (id, password) => api('POST', '/api/login', { body: { email: `${id}@example.test`, password } });
  const tokenFor = id => jwt.sign({ id, email: `${id}@example.test`, name: 'Test User' }, JWT_SECRET, { expiresIn: '1h' }); // what magic-link/verify issues
  const warm = token => api('GET', '/api/me', { token });   // exactly what the SPA does on every page load -> auth cache hit afterwards
  const setPw = (token, password) => api('POST', '/api/auth/set-password', { token, body: { password } });

  try {
    const bootDeadline = Date.now() + 60000;
    while (!/Server on port/.test(out) && exited === null && Date.now() < bootDeadline) await sleep(200);
    check('server booted (real server.js, fake DB)', /Server on port/.test(out), out.slice(-300));

    // ── A. Existing password — the attack scenarios ─────────────────────────
    console.log('\n=== A. account ALREADY has a password: set-password must be rejected ===');
    {
      // A1. cold cache: the first authenticated request for this user IS set-password
      const t = (await login('pw_cold', OLD_PW)).body?.token;
      const hashBefore = byId('pw_cold').password;
      const r = await setPw(t, ATTACKER_PW);
      check('cold cache + existing password -> 400 "Password already set"', r.status === 400 && /already set/i.test(r.body?.error || ''), JSON.stringify(r));
      check('cold cache: stored password hash unchanged', byId('pw_cold').password === hashBefore);
      check('cold cache: old password still logs in', (await login('pw_cold', OLD_PW)).status === 200);
      check('cold cache: attacker-chosen password does NOT log in', (await login('pw_cold', ATTACKER_PW)).status === 401);
    }
    {
      // A2. warm cache: THE ATTACK (SPA has called /api/me first, so auth() serves the narrow cached slice)
      const t = (await login('pw_warm', OLD_PW)).body?.token;
      const w = await warm(t);
      check('setup: warming request (GET /api/me) succeeded', w.status === 200, JSON.stringify(w));
      const hashBefore = byId('pw_warm').password;
      const r = await setPw(t, ATTACKER_PW);
      check('WARM cache + existing password -> 400 "Password already set"  (was: 200 and password replaced)', r.status === 400 && /already set/i.test(r.body?.error || ''), JSON.stringify(r));
      check('warm cache: stored password hash unchanged', byId('pw_warm').password === hashBefore, 'password was overwritten');
      check('warm cache: password_set still true', byId('pw_warm').password_set === true);
      check('warm cache: old password still logs in', (await login('pw_warm', OLD_PW)).status === 200);
      check('warm cache: attacker-chosen password does NOT log in (takeover not possible)', (await login('pw_warm', ATTACKER_PW)).status === 401);
    }
    {
      // A3. guard still precedes body validation for an existing-password account, warm cache
      const t = (await login('pw_short', OLD_PW)).body?.token;
      await warm(t);
      const r = await setPw(t, 'short');
      check('warm cache + existing password + too-short body -> still "already set" (guard first)', r.status === 400 && /already set/i.test(r.body?.error || ''), JSON.stringify(r));
    }

    // ── B. First-time setup must keep working ───────────────────────────────
    console.log('\n=== B. fresh account with NO password: first-time setup still works ===');
    {
      const t = tokenFor('new_cold');
      const r = await setPw(t, NEW_PW);
      check('cold cache + fresh account -> 200 {ok:true}', r.status === 200 && r.body?.ok === true, JSON.stringify(r));
      check('cold cache: password_set flipped to true', byId('new_cold').password_set === true);
      check('cold cache: new password works for /api/login', (await login('new_cold', NEW_PW)).status === 200);
      check('set-password still does NOT bump password_changed_at (documented, deliberate)', byId('new_cold').password_changed_at === null);
    }
    {
      const t = tokenFor('new_warm');
      const w = await warm(t);
      check('setup: warming request succeeded', w.status === 200, JSON.stringify(w));
      const r = await setPw(t, NEW_PW);   // the real SPA flow: /api/me first, then set-password
      check('WARM cache + fresh account -> 200 {ok:true}  (fresh-state fetch must see password_set=false)', r.status === 200 && r.body?.ok === true, JSON.stringify(r));
      check('warm cache: password_set flipped to true', byId('new_warm').password_set === true);
      check('warm cache: new password works for /api/login', (await login('new_warm', NEW_PW)).status === 200);
      const again = await setPw(t, ATTACKER_PW);   // now a password exists -> must be rejected, still on the warm cache
      check('immediately re-calling set-password after setup -> 400 "already set" (state read after the write)', again.status === 400 && /already set/i.test(again.body?.error || ''), JSON.stringify(again));
      check('...and the just-set password was not replaced', (await login('new_warm', NEW_PW)).status === 200 && (await login('new_warm', ATTACKER_PW)).status === 401);
    }

    // ── C. Existing validation / auth behavior preserved ────────────────────
    console.log('\n=== C. invalid / unauthenticated requests: existing behavior preserved ===');
    {
      const noTok = await api('POST', '/api/auth/set-password', { body: { password: NEW_PW } });
      check('no token -> 401 "No token"', noTok.status === 401 && noTok.body?.error === 'No token', JSON.stringify(noTok));
      const bad = await setPw('not.a.jwt', NEW_PW);
      check('garbage token -> 401 "Invalid or expired token"', bad.status === 401 && /Invalid or expired token/.test(bad.body?.error || ''), JSON.stringify(bad));
      const expired = jwt.sign({ id: 'new_short', email: 'new_short@example.test' }, JWT_SECRET, { expiresIn: -10 });
      const exp = await setPw(expired, NEW_PW);
      check('expired token -> 401', exp.status === 401, JSON.stringify(exp));
      const t = tokenFor('new_short');
      await warm(t);
      const short = await setPw(t, 'short');
      check('fresh account + too-short password (warm cache) -> 400 "Password min 8 chars"', short.status === 400 && /min 8/i.test(short.body?.error || ''), JSON.stringify(short));
      check('...and nothing was written', byId('new_short').password_set === false && byId('new_short').password === unusableHash);
      const missing = await setPw(t, undefined);
      check('fresh account + missing password field -> 400', missing.status === 400, JSON.stringify(missing));
      check('server still healthy at the end', (await api('GET', '/api/health')).status === 200 && exited === null);
    }
  } finally {
    const gone = new Promise(r => { if (exited !== null) r(); else child.once('exit', r); });
    child.kill();
    await Promise.race([gone, sleep(5000)]);   // let the child release its cwd before deleting it (Windows)
    await new Promise(r => mock.close(r));
    try { fs.rmSync(emptyCwd, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch { /* temp dir is empty; not worth failing the run */ }
  }

  console.log(`\n=== RESULTS: ${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('SCRIPT ERROR', e); process.exit(1); });
