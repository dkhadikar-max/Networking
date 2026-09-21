// Regression test for audit finding A3:
//
//   auth() (the shared authentication middleware) verified the JWT and the
//   banned flag but NEVER checked users.deleted_at — in either of its two
//   accepting branches (auth-cache hit, and the authoritative DB fetch). A
//   soft-deleted account (anonymizeUser() keeps the row and sets deleted_at)
//   therefore kept working with its pre-deletion token for the rest of the
//   token's 24h life: GET /api/me returned 200 (and even re-issued a fresh
//   cookie), PUT /api/me could modify the "deleted" account, and every other
//   auth-only endpoint stayed open.
//
// Invariant enforced here: a soft-deleted account is UNAUTHENTICATED — at the
// shared auth boundary, on every branch, for Bearer and cookie sessions.
//
// Boots the REAL, UNMODIFIED server.js against a local fake PostgREST endpoint
// (in-memory users), empty working directory (no .env), whitelisted env — no
// production credentials, cannot reach production data. Deletion goes through
// the real, existing DELETE /api/me path; banning through the real admin ban
// endpoint. Standalone script (repo convention); exit code = failed checks.

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
const PW = 'CorrectHorse9!';
const pwHash = bcrypt.hashSync(PW, 4);

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}  ${String(detail ?? '').slice(0, 160)}`); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Fake database ────────────────────────────────────────────────────────────
const mkUser = (id, over = {}) => ({
  id, email: `${id}@example.test`, password: pwHash, name: 'Test User',
  bio: 'original bio', headline: null, photos: [], instagram: '', linkedin: '', website: '', location: 'Pune',
  lat: null, lng: null, remote: false, skills: [], interests: [], intent: 'explore-network',
  role: 'user', premium: false, premium_expires_at: null, trust_score: 10, profile_score: 30,
  is_profile_complete: false, verification: { status: 'none', confidence: 0 }, banned: false,
  deleted_at: null, email_verified: true, onboarding_stage: 'complete', password_set: true,
  password_changed_at: null, failed_login_attempts: 0, lockout_until: null, last_active: null,
  created_at: '2026-01-01T00:00:00.000Z', ...over,
});
const users = [
  mkUser('normal'),
  mkUser('del_bearer'), mkUser('del_cookie'), mkUser('del_cold'),
  mkUser('admin', { role: 'admin' }), mkUser('admin_del', { role: 'admin' }),
  mkUser('banned_cold', { banned: true }), mkUser('banned_warm'),
  mkUser('pw_changed'),
];
const byId = id => users.find(u => u.id === id);

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
    const wantObject = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    const json = (status, payload, extra = {}) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...extra }); res.end(payload === undefined ? undefined : JSON.stringify(payload)); };
    const objectOr406 = list => list.length === 1 ? json(200, list[0]) : json(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: null, hint: null });

    if (req.method === 'GET' || req.method === 'HEAD') {
      let list = [];
      if (table === 'users') {
        const { conds, unsupported } = parseFilters(url.searchParams);
        list = unsupported ? [] : users.filter(u => rowMatches(u, conds)).map(u => structuredClone(u));
      }
      if (wantObject) return objectOr406(list);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Range': `*/${list.length}` });
      return res.end(req.method === 'HEAD' ? undefined : JSON.stringify(list));
    }
    if (req.method === 'PATCH' && table === 'users' && body && typeof body === 'object') {
      const { conds, unsupported } = parseFilters(url.searchParams);
      const hit = unsupported ? [] : users.filter(u => rowMatches(u, conds));
      hit.forEach(u => Object.assign(u, body));
      if (/return=representation/.test(req.headers.prefer || '')) {
        return wantObject ? objectOr406(hit.map(u => structuredClone(u))) : json(200, hit.map(u => structuredClone(u)), { 'Content-Range': `*/${hit.length}` });
      }
      return json(204, undefined, { 'Content-Range': `*/${hit.length}` });
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
  const emptyCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a3-'));

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

  // `auth` = Bearer token, `cookie` = the httpOnly byn_token cookie only (what the browser SPA actually sends)
  const api = async (method, p, { token, cookie, body } = {}) => {
    const headers = { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (cookie) headers.Cookie = `byn_token=${cookie}`;
    const res = await fetch(BASE + p, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    let j = null; try { j = await res.json(); } catch {}
    return { status: res.status, body: j, setCookie: res.headers.get('set-cookie') };
  };
  const login = (email, password = PW) => api('POST', '/api/login', { body: { email, password } });
  const loginToken = async id => (await login(`${id}@example.test`)).body?.token;
  const tokenFor = id => jwt.sign({ id, email: `${id}@example.test`, name: 'Test User' }, JWT_SECRET, { expiresIn: '1h' });

  // Endpoints a deleted account must not be able to reach (all behind the shared auth() middleware only)
  const probes = [
    ['GET',  '/api/profile-status', undefined],
    ['GET',  '/api/connections', undefined],
    ['GET',  '/api/notifications/unread-count', undefined],
    ['POST', '/api/payments/session', {}],
  ];

  // Runs the whole delete-then-reuse-the-old-credential sequence for one user.
  async function deletedAccountScenario(id, mode /* 'bearer' | 'cookie' */, { warmBeforeDelete }) {
    const cred = mode === 'bearer' ? { token: null } : { cookie: null };
    const t = await loginToken(id);
    const use = extra => (mode === 'bearer' ? { token: t, ...extra } : { cookie: t, ...extra });
    void cred;

    const before = await api('GET', '/api/me', use());
    check(`[${id}] before deletion: authenticated GET /api/me -> 200`, before.status === 200, JSON.stringify(before));
    if (warmBeforeDelete) {
      const again = await api('GET', '/api/me', use());          // 2nd call: auth cache is warm
      check(`[${id}] before deletion: warm-cache GET /api/me -> 200`, again.status === 200, JSON.stringify(again));
    }
    const del = await api('DELETE', '/api/me', use());
    check(`[${id}] existing deletion path: DELETE /api/me -> 200`, del.status === 200, JSON.stringify(del));
    check(`[${id}] row is soft-deleted (deleted_at set, anonymized)`, !!byId(id).deleted_at && byId(id).name === 'Deleted User', JSON.stringify({ d: byId(id).deleted_at, n: byId(id).name }));

    // Reuse the PRE-DELETE credential.
    const r1 = await api('GET', '/api/me', use());     // first request after deletion: auth cache is empty (cold -> DB branch)
    check(`[${id}] deleted + ${mode} + COLD cache: GET /api/me -> 401 "Account not found"`, r1.status === 401 && r1.body?.error === 'Account not found', JSON.stringify(r1));
    const r2 = await api('GET', '/api/me', use());     // second request: pre-fix this was served from the auth cache
    check(`[${id}] deleted + ${mode} + WARM cache (2nd request): GET /api/me -> 401`, r2.status === 401, JSON.stringify(r2));
    check(`[${id}] rejected requests do not re-issue a session cookie`, !r1.setCookie && !r2.setCookie, JSON.stringify({ a: r1.setCookie, b: r2.setCookie }));

    const put = await api('PUT', '/api/me', use({ body: { bio: 'resurrected after deletion', name: 'Zombie Name' } }));
    check(`[${id}] PUT /api/me on the deleted account -> 401`, put.status === 401, JSON.stringify(put));
    check(`[${id}] PUT /api/me did NOT modify the deleted row`, byId(id).bio === '' && byId(id).name === 'Deleted User', JSON.stringify({ bio: byId(id).bio, name: byId(id).name }));

    for (const [m, p, b] of probes) {
      const r = await api(m, p, use(b === undefined ? {} : { body: b }));
      check(`[${id}] ${m} ${p} with the pre-delete credential -> 401`, r.status === 401, JSON.stringify(r));
    }
    const del2 = await api('DELETE', '/api/me', use());
    check(`[${id}] a second DELETE /api/me by the deleted account -> 401`, del2.status === 401, JSON.stringify(del2));

    const relog = await login(`${id}@example.test`);
    check(`[${id}] login with the original email -> 401`, relog.status === 401, JSON.stringify(relog));
    const relogAnon = await login(byId(id).email);
    check(`[${id}] login with the anonymized email -> 401 (existing login path unchanged)`, relogAnon.status === 401, JSON.stringify(relogAnon));
  }

  try {
    const bootDeadline = Date.now() + 60000;
    while (!/Server on port/.test(out) && exited === null && Date.now() < bootDeadline) await sleep(200);
    check('server booted (real server.js, fake DB)', /Server on port/.test(out), out.slice(-300));

    console.log('\n=== 1/8. normal (non-deleted) account is unaffected ===');
    {
      const t = await loginToken('normal');
      const cold = await api('GET', '/api/me', { token: t });
      const warm = await api('GET', '/api/me', { token: t });
      check('cold cache: GET /api/me -> 200', cold.status === 200 && cold.body?.id === 'normal', JSON.stringify(cold).slice(0, 200));
      check('warm cache: GET /api/me -> 200', warm.status === 200, JSON.stringify(warm).slice(0, 200));
      check('cookie-only session: GET /api/me -> 200', (await api('GET', '/api/me', { cookie: t })).status === 200);
      const put = await api('PUT', '/api/me', { token: t, body: { bio: 'updated bio for a normal account' } });
      check('PUT /api/me -> 200 and persisted', put.status === 200 && byId('normal').bio === 'updated bio for a normal account', JSON.stringify(put).slice(0, 200));
      for (const [m, p, b] of probes) {
        const r = await api(m, p, { token: t, ...(b === undefined ? {} : { body: b }) });
        check(`${m} ${p} -> 200`, r.status === 200, JSON.stringify(r));
      }
    }

    console.log('\n=== 2/5/6/7. deleted account, Bearer session (cache warmed BEFORE deletion) ===');
    await deletedAccountScenario('del_bearer', 'bearer', { warmBeforeDelete: true });

    console.log('\n=== 3/5/6/7. deleted account, cookie-only session (what the browser SPA sends) ===');
    await deletedAccountScenario('del_cookie', 'cookie', { warmBeforeDelete: true });

    console.log('\n=== 4/5. deleted account, never explicitly warmed (cold path is the first post-delete request) ===');
    await deletedAccountScenario('del_cold', 'bearer', { warmBeforeDelete: false });

    console.log('\n=== 9. banned-account behavior unchanged ===');
    {
      const r = await api('GET', '/api/me', { token: tokenFor('banned_cold') });
      check('banned account (cold) -> 403 "Account restricted"', r.status === 403 && r.body?.error === 'Account restricted', JSON.stringify(r));
      const t = await loginToken('banned_warm');
      check('setup: soon-to-be-banned account authenticates normally (warms cache)', (await api('GET', '/api/me', { token: t })).status === 200);
      const adminTok = await loginToken('admin');
      const ban = await api('POST', '/api/admin/ban', { token: adminTok, body: { targetId: 'banned_warm', banned: true } });
      check('real admin ban endpoint -> 200', ban.status === 200, JSON.stringify(ban));
      const after = await api('GET', '/api/me', { token: t });
      check('banned account (was warm) -> 403 "Account restricted"', after.status === 403 && after.body?.error === 'Account restricted', JSON.stringify(after));
    }

    console.log('\n=== other existing auth rejections unchanged ===');
    {
      const noTok = await api('GET', '/api/me');
      check('no token -> 401 "No token"', noTok.status === 401 && noTok.body?.error === 'No token', JSON.stringify(noTok));
      const exp = await api('GET', '/api/me', { token: jwt.sign({ id: 'normal' }, JWT_SECRET, { expiresIn: -10 }) });
      check('expired token -> 401 "Invalid or expired token"', exp.status === 401 && /Invalid or expired token/.test(exp.body?.error || ''), JSON.stringify(exp));
      const bad = await api('GET', '/api/me', { token: 'not.a.jwt' });
      check('garbage token -> 401 "Invalid or expired token"', bad.status === 401 && /Invalid or expired token/.test(bad.body?.error || ''), JSON.stringify(bad));
      const ghost = await api('GET', '/api/me', { token: tokenFor('no_such_user') });
      check('valid token for a non-existent user -> 401 "Account not found"', ghost.status === 401 && ghost.body?.error === 'Account not found', JSON.stringify(ghost));
      const t = await loginToken('pw_changed');
      byId('pw_changed').password_changed_at = new Date(Date.now() + 60000).toISOString();   // password changed after this token was issued
      const pc = await api('GET', '/api/me', { token: t });
      check('token older than password_changed_at -> 401 "Password was changed"', pc.status === 401 && /Password was changed/.test(pc.body?.error || ''), JSON.stringify(pc));
    }

    console.log('\n=== INFO (not asserted; out of scope for A3) ===');
    {
      const t = await loginToken('admin_del');
      await api('DELETE', '/api/me', { token: t });
      const r = await api('GET', '/api/admin/users', { token: t });
      console.log(`  INFO  adminAuth (separate middleware, not auth()) with a soft-deleted admin's pre-delete token -> HTTP ${r.status}`);
    }
    check('server still healthy at the end', (await api('GET', '/api/health')).status === 200 && exited === null);
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
