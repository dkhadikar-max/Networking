// Regression test for audit finding A1:
//
//   server.js's app.listen() callback used to run a "one-time idempotent
//   migration" on EVERY boot/deploy that set every verified user still at
//   onboarding_stage='acquisition' to 'complete' — regardless of profile
//   score, and without ever logging (the update's returned `count` is null,
//   so its own log line could never print). That re-created, at each restart,
//   exactly the contradiction the onboarding profile-completion fix removed:
//   onboarding says "complete" while profile_score < 70 and profileGuard
//   blocks Connect/Swipe.
//
// Invariant enforced here: STARTING THE SERVER MUST NEVER CHANGE ANY USER'S
// onboarding_stage. Completion may only happen through the normal onboarding
// flow (POST /api/onboarding/profile, which requires profile_score >= 70).
//
// This test boots the REAL, UNMODIFIED server.js — but against a local fake
// PostgREST endpoint holding four in-memory users, with an empty working
// directory (so no .env is loaded) and a whitelisted environment. It has no
// production credentials and cannot reach production data. It observes every
// write the server's startup path sends to the "database".
//
// Standalone script (repo convention — no test framework). Exit code = number
// of failed checks.

import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SERVER_JS = path.join(here, 'server.js');

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}  ${detail ?? ''}`); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Fake database ────────────────────────────────────────────────────────────
const mkUser = (id, over) => ({
  id, email: `${id}@example.test`, password: 'x', name: id,
  email_verified: true, onboarding_stage: 'acquisition', profile_score: 30,
  is_profile_complete: false, banned: false, deleted_at: null, ...over,
});
const users = [
  mkUser('u_verified_acq_low',  { profile_score: 30 }),                                        // (1) must stay acquisition
  mkUser('u_verified_acq_high', { profile_score: 80, is_profile_complete: true }),             // (2) must stay acquisition
  mkUser('u_complete',          { onboarding_stage: 'complete', profile_score: 85, is_profile_complete: true }), // (3) must stay complete
  mkUser('u_unverified_acq',    { email_verified: false, profile_score: 30 }),                 // control
];
const stagesBefore = Object.fromEntries(users.map(u => [u.id, u.onboarding_stage]));

const requestLog = []; // every request the server sends to the fake DB
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
  return val === 'null' ? cur == null : String(cur) === val; // is.
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

    if (req.method === 'PATCH' && table === 'users' && body && typeof body === 'object') {
      const { conds, unsupported } = parseFilters(url.searchParams);
      const hit = unsupported ? [] : users.filter(u => rowMatches(u, conds));
      hit.forEach(u => Object.assign(u, body));
      const wantRows = /return=representation/.test(req.headers.prefer || '');
      res.writeHead(wantRows ? 200 : 204, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Range': `*/${hit.length}` });
      return res.end(wantRows ? JSON.stringify(hit) : undefined);
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      // Every startup job's read returns empty — keeps them inert and deterministic.
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Range': '*/0' });
      return res.end(req.method === 'HEAD' ? undefined : '[]');
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
  const emptyCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a1-'));   // no .env here -> nothing real is loaded

  // Whitelisted env: nothing from the developer's shell/.env can point this at production.
  const env = {
    PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, SYSTEMROOT: process.env.SYSTEMROOT,
    TEMP: os.tmpdir(), TMP: os.tmpdir(), HOME: emptyCwd, USERPROFILE: emptyCwd,
    SUPABASE_URL: `http://127.0.0.1:${mockPort}`, SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key',
    JWT_SECRET: 'test-only-jwt-secret', ADMIN_SECRET: 'test-only-admin-secret',
    PORT: String(serverPort),
  };

  console.log('=== Booting the real server.js against a local fake DB (no production access) ===');
  let out = '';
  const child = spawn(process.execPath, [SERVER_JS], { cwd: emptyCwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { out += d; });
  let exited = null; child.on('exit', code => { exited = code; });

  try {
    // Wait for the listen callback to have fired.
    const bootDeadline = Date.now() + 60000;
    while (!/Server on port/.test(out) && exited === null && Date.now() < bootDeadline) await sleep(200);
    check('server booted and reached its listen callback', /Server on port/.test(out), out.slice(-400));

    // Give every startup task (the setImmediate migration and the startup jobs) time to run.
    const settleDeadline = Date.now() + 15000;
    while (requestLog.length === 0 && Date.now() < settleDeadline) await sleep(200);
    await sleep(3000);

    console.log('\n=== A1: startup must not change any onboarding_stage ===');
    check('server talked to the fake DB during startup (test is not vacuous)', requestLog.length > 0, `requests seen: ${requestLog.length}`);

    const stageWrites = requestLog.filter(r => r.method === 'PATCH' && r.table === 'users' && r.body && Object.prototype.hasOwnProperty.call(r.body, 'onboarding_stage'));
    check('no startup write to users.onboarding_stage at all', stageWrites.length === 0,
      `writes: ${JSON.stringify(stageWrites.map(w => ({ search: w.search, body: w.body })))}`);

    const byId = Object.fromEntries(users.map(u => [u.id, u]));
    check('(1) verified + acquisition + score<70 remains acquisition',
      byId.u_verified_acq_low.onboarding_stage === 'acquisition', `now: ${byId.u_verified_acq_low.onboarding_stage}`);
    check('(2) verified + acquisition + score>=70 is NOT force-completed by startup either',
      byId.u_verified_acq_high.onboarding_stage === 'acquisition', `now: ${byId.u_verified_acq_high.onboarding_stage}`);
    check('(3) a genuinely completed user remains complete (and untouched)',
      byId.u_complete.onboarding_stage === 'complete' && byId.u_complete.profile_score === 85, JSON.stringify(byId.u_complete));
    check('control: unverified + acquisition remains acquisition',
      byId.u_unverified_acq.onboarding_stage === 'acquisition', `now: ${byId.u_unverified_acq.onboarding_stage}`);
    check('no user\'s stage differs from its pre-boot value',
      users.every(u => u.onboarding_stage === stagesBefore[u.id]),
      JSON.stringify(users.map(u => [u.id, stagesBefore[u.id], u.onboarding_stage])));

    console.log('\n=== (4) startup remains otherwise healthy ===');
    const health = await fetch(`http://127.0.0.1:${serverPort}/api/health`).then(r => r.json().then(j => ({ status: r.status, j }))).catch(e => ({ status: 0, j: String(e) }));
    check('GET /api/health returns 200 {ok:true}', health.status === 200 && health.j?.ok === true, JSON.stringify(health));
    check('server process is still running (no crash during startup jobs)', exited === null, `exit code: ${exited}`);
    check('startup jobs still run (they read from the DB)', requestLog.some(r => r.method === 'GET' && r.table === 'users'),
      `tables read: ${[...new Set(requestLog.map(r => r.table))].join(',')}`);
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
