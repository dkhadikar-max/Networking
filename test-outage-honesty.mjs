// Regression test: production outages must not be reported to users as success or as their fault.
//
// Found 2026-11-26: the production Supabase host stopped resolving, yet
//   - GET  /api/stats/public answered {"users":0,"connections":0} and CACHED it for 5 minutes,
//   - POST /api/login answered 401 "Invalid email or password" (the lookup error was ignored),
//   - POST /api/auth/magic-link/request answered "a sign-in link is on its way" with nothing sent
//     (lookup error ignored; email send was fire-and-forget, so a suspended email provider was
//     invisible too),
//   - GET  /api/health answered ok:true (it never touches the database).
//
// How it runs (nothing can touch production): the REAL server.js (or $SERVER_JS) in an empty temp
// cwd (no .env), whitelisted env, SUPABASE_URL pointed at a local PostgREST stub on 127.0.0.1 whose
// availability the test toggles, and the 'resend' module replaced by a stub whose availability is
// toggled through a flag file. No real network, no real email.
// Standalone script (repo convention); exit code = number of failed checks.

import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SERVER_JS = process.env.SERVER_JS ? path.resolve(process.env.SERVER_JS) : path.join(here, 'server.js');

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}  ${String(detail ?? '').slice(0, 300)}`); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise((resolve, reject) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); }); s.on('error', reject); });
async function waitFor(fn, ms = 15000, step = 200) { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) return v; await sleep(step); } }

// ---- PostgREST stub: just enough for the routes under test ----
let dbUp = false;
const USER_COUNT = 42, CONN_COUNT = 7;
const rows = new Map(); // id -> user row created through the stub
const patches = [];
const db = http.createServer((req, res) => {
  const chunks = []; req.on('data', c => chunks.push(c));
  req.on('end', () => {
    if (!dbUp) { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ message: 'stub: database unavailable', code: 'STUB503' })); return; }
    const url = new URL(req.url, 'http://stub');
    const table = url.pathname.replace(/^\/rest\/v1\//, '');
    const wantObject = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    let body = null; try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null; } catch { body = null; }
    const send = (status, payload, extra = {}) => { res.writeHead(status, { 'Content-Type': 'application/json', ...extra }); res.end(payload === undefined ? '' : JSON.stringify(payload)); };
    const list = arr => wantObject ? (arr.length === 1 ? send(200, arr[0]) : send(406, { code: 'PGRST116', message: 'no rows' })) : send(200, arr);
    if (req.method === 'HEAD' || (req.headers.prefer || '').includes('count=exact')) {
      const n = table === 'users' ? USER_COUNT : table === 'connections' ? CONN_COUNT : 0;
      return send(200, req.method === 'HEAD' ? undefined : [], { 'Content-Range': `*/${n}` });
    }
    if (req.method === 'GET') {
      const id = (url.searchParams.get('id') || '').replace(/^eq\./, '');
      return list(table === 'users' && rows.has(id) ? [rows.get(id)] : []);
    }
    if (req.method === 'POST' && table === 'users') {
      const r = Array.isArray(body) ? body[0] : body; rows.set(r.id, r); return list([r]);
    }
    if (req.method === 'PATCH' && table === 'users') {
      const id = (url.searchParams.get('id') || '').replace(/^eq\./, '');
      patches.push({ id, body });
      const cur = rows.get(id); if (!cur) return list([]);
      Object.assign(cur, body); return list([cur]);
    }
    return list([]);
  });
});

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-outage-'));
  const flag = path.join(tmp, 'resend-down.flag');
  const sent = path.join(tmp, 'sent.log');
  const stub = path.join(tmp, 'stub-resend.cjs');
  fs.writeFileSync(stub, `const fs = require('fs'); const Module = require('module'); const orig = Module._load;
Module._load = function (request) { if (request === 'resend') { return { Resend: class { constructor() { this.emails = { send: async (m) => {
  if (fs.existsSync(${JSON.stringify(flag)})) return { data: null, error: { name: 'restricted_api_key', message: 'This API key is suspended' } };
  fs.appendFileSync(${JSON.stringify(sent)}, String(m.subject) + '\\n'); return { data: { id: 'stub' }, error: null }; } }; } } }; }
  return orig.apply(this, arguments); };`);

  await new Promise(r => db.listen(0, '127.0.0.1', r));
  const dbPort = db.address().port;
  const port = await freePort();
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-outage-cwd-'));
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, SYSTEMROOT: process.env.SYSTEMROOT, TEMP: os.tmpdir(), TMP: os.tmpdir(), HOME: cwd, USERPROFILE: cwd,
    SUPABASE_URL: `http://127.0.0.1:${dbPort}`, SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key', JWT_SECRET: 'test-only-jwt-secret', ADMIN_SECRET: 'test-only-admin-secret',
    PORT: String(port), RESEND_API_KEY: 'test-only-resend-key', BASE_URL: 'http://127.0.0.1' };
  let out = ''; const child = spawn(process.execPath, ['-r', stub, SERVER_JS], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  let exited = null; child.on('exit', c => { exited = c; });
  await waitFor(() => /Server on port/.test(out) || exited !== null, 60000);
  const base = `http://127.0.0.1:${port}`;
  let ipN = 0;
  const call = async (method, p, body) => {
    const r = await fetch(base + p, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), 'X-Forwarded-For': `10.77.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: body ? JSON.stringify(body) : undefined });
    let j = null; try { j = await r.json(); } catch {} return { status: r.status, body: j };
  };
  const signup = email => call('POST', '/api/auth/magic-link/request', { name: 'Outage Test', email, age_confirmed: true });

  try {
    check('server booted', /Server on port/.test(out) && exited === null, out.slice(-400));
    await sleep(500); // let startup jobs hit the (down) stub and settle

    console.log('\n--- database DOWN ---');
    dbUp = false;
    let r = await call('GET', '/api/stats/public');
    check('stats/public does not publish fake zeros (503, no cache yet)', r.status === 503 && !(r.body && r.body.users === 0), JSON.stringify(r));
    r = await call('POST', '/api/login', { email: 'nobody@example.test', password: 'whatever-123' });
    check('login answers 503, not "wrong password", when the lookup fails', r.status === 503 && r.body?.code === 'SERVICE_UNAVAILABLE', JSON.stringify(r));
    r = await signup('new-down@example.test');
    check('magic-link request answers 503 when the lookup fails (not "link on its way")', r.status === 503 && r.body?.code === 'SERVICE_UNAVAILABLE', JSON.stringify(r));
    r = await call('GET', '/api/health');
    check('/api/health stays a pure liveness probe (200)', r.status === 200 && r.body?.ok === true, JSON.stringify(r));
    r = await call('GET', '/api/health/deep');
    check('/api/health/deep reports the database outage (503, db:error)', r.status === 503 && r.body?.db === 'error', JSON.stringify(r));

    console.log('\n--- database UP, email provider DOWN ---');
    dbUp = true; fs.writeFileSync(flag, '1');
    r = await call('GET', '/api/stats/public');
    check('stats/public recovers with real counts (zeros were never cached)', r.status === 200 && r.body?.users === USER_COUNT && r.body?.connections === CONN_COUNT, JSON.stringify(r));
    const sentBefore = fs.existsSync(sent) ? fs.readFileSync(sent, 'utf8') : '';
    r = await signup('new-emaildown@example.test');
    check('magic-link request answers 503 EMAIL_SERVICE_DOWN when the provider rejects the send', r.status === 503 && r.body?.code === 'EMAIL_SERVICE_DOWN', JSON.stringify(r));
    const created = [...rows.values()].find(u => u.email === 'new-emaildown@example.test');
    check('the account row was still created (a retry can reuse it)', !!created);
    check('the 60s cooldown was released after the failed send', !!created && created.magic_link_last_sent_at == null, JSON.stringify(created?.magic_link_last_sent_at));
    r = await call('GET', '/api/health/deep');
    check('/api/health/deep reports the email outage (503, email:failing)', r.status === 503 && r.body?.db === 'ok' && r.body?.email === 'failing', JSON.stringify(r));

    console.log('\n--- everything UP ---');
    fs.rmSync(flag);
    r = await signup('new-emaildown@example.test');
    check('retry right after the outage is sent, not swallowed as cooldown', r.status === 200 && r.body?.ok === true, JSON.stringify(r));
    const sentAfter = fs.existsSync(sent) ? fs.readFileSync(sent, 'utf8') : '';
    check('a sign-in email was actually handed to the provider on retry', sentAfter.length > sentBefore.length && /Sign in/.test(sentAfter.slice(sentBefore.length)), sentAfter);
    r = await call('GET', '/api/health/deep');
    check('/api/health/deep is green once db and email work', r.status === 200 && r.body?.ok === true && r.body?.email === 'ok', JSON.stringify(r));
    r = await call('POST', '/api/login', { email: 'nobody@example.test', password: 'whatever-123' });
    check('login with an unknown email is still a plain 401 when the db is healthy', r.status === 401, JSON.stringify(r));
    r = await call('POST', '/api/auth/magic-link/request', { name: 'X', email: 'underage@example.test' });
    check('missing age confirmation says 18 (matches the signup page and Terms)', r.status === 400 && /18/.test(r.body?.error || ''), JSON.stringify(r));
  } finally {
    child.kill();
    await new Promise(r => db.close(r));
    await sleep(300);
    for (const d of [tmp, cwd]) { try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch { /* temp only */ } }
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail);
}
main().catch(e => { console.error(e); process.exit(99); });
