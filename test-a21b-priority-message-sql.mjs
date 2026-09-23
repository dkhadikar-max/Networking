// Tests migrations/024_concurrency_race_fixes.sql — process_priority_message()
// — directly, on a REAL multi-connection PostgreSQL server (embedded-postgres), with the migration
// file applied VERBATIM. This is the evidence that the atomicity guarantee holds in the database
// itself (audit A21b), independent of the Node server (server.js's own wiring to this RPC — the
// error-message mapping, the URL-stripping, the unchanged endpoint contract — is covered separately,
// with genuine concurrent HTTP traffic, in test-a21-concurrency-races.mjs):
//
//   * ordinary semantics: sent/limit_reached/duplicate_recipient outcomes, remaining count
//   * the monthly quota and the duplicate-recipient rule are enforced together, atomically
//   * different months for the same sender do not share a quota; different senders never block or
//     interfere with each other (the advisory lock is keyed on (sender, month), not global)
//   * real concurrency: N separate connections racing one sender's quota -> EXACTLY p_limit sent
//   * real concurrency: N separate connections racing the SAME (sender, recipient, month) -> exactly
//     one sent, the rest duplicate_recipient
//   * the lock itself: a competing call for the SAME (sender, month) BLOCKS until the lock holder's
//     transaction commits or rolls back; two DIFFERENT (sender, month) keys never block each other
//   * argument validation: missing/invalid input -> error, nothing written
//   * privileges: anon/authenticated cannot execute it; service_role can
//
// Requires (test-only, not project dependencies): npm install --no-save embedded-postgres pg
// Standalone script (repo convention); exit code = number of failed checks.

import net from 'node:net';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let EmbeddedPostgres, pg;
try { EmbeddedPostgres = (await import('embedded-postgres')).default; pg = (await import('pg')).default; }
catch { console.error('This test needs: npm install --no-save embedded-postgres pg'); process.exit(2); }

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = fs.readdirSync(path.join(here, 'migrations')).filter(f => /^024_.*\.sql$/.test(f)).map(f => path.join(here, 'migrations', f))[0];
if (!MIGRATION) { console.error('migrations/024_*.sql not found'); process.exit(2); }

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}  ${String(detail ?? '').slice(0, 260)}`); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise((resolve, reject) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); }); s.on('error', reject); });

// priority_msgs has no FK to users (see supabase_schema.sql) - arbitrary text ids are fine here.
// connections/reports are irrelevant to process_priority_message itself, but migrations/024 is
// applied VERBATIM as one file (the other two objects it creates: connections_pair_uidx,
// reports_ordinary_dedup_uidx), so their tables need to exist for the file to apply at all - kept
// minimal, exactly enough for those two CREATE INDEX statements.
const SCHEMA = `
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
CREATE TABLE priority_msgs (id text PRIMARY KEY, from_user text NOT NULL, to_user text NOT NULL, text text, month text, read boolean DEFAULT false, created_at timestamptz DEFAULT now());
CREATE TABLE connections (id text PRIMARY KEY, user1 text NOT NULL, user2 text NOT NULL);
CREATE TABLE reports (id text PRIMARY KEY, from_user text NOT NULL, target_id text NOT NULL, reason text NOT NULL, type text);
`;

let pool, seq = 0;
const one = async (sql, args) => (await pool.query(sql, args)).rows[0];
const call = (client, from, to, text, month, limit) =>
  client.query('SELECT process_priority_message(p_from_user := $1, p_to_user := $2, p_text := $3, p_month := $4, p_limit := $5) AS r', [from, to, text, month, limit]).then(r => r.rows[0].r);
const countFor = async (from, month) => Number((await one(`SELECT count(*) c FROM priority_msgs WHERE from_user=$1 AND month=$2`, [from, month])).c);
const err = async p => { try { await p; return null; } catch (e) { return e; } };
const newClient = async port => { const c = new pg.Client({ host: '127.0.0.1', port, user: 'postgres', password: 'pw', database: 'byn' }); await c.connect(); return c; };

async function main() {
  const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a21sql-'));
  const port = await freePort();
  const epg = new EmbeddedPostgres({ databaseDir: dbDir, user: 'postgres', password: 'pw', port, persistent: false, onLog: () => {}, onError: () => {} });
  await epg.initialise(); await epg.start(); await epg.createDatabase('byn');
  pool = new pg.Pool({ host: '127.0.0.1', port, user: 'postgres', password: 'pw', database: 'byn', max: 60 });
  const v = (await one('SELECT version() v')).v; console.log(`=== ${v.slice(0, 60)} ===`);
  await pool.query(SCHEMA);
  await pool.query(fs.readFileSync(MIGRATION, 'utf8'));
  console.log(`=== applied verbatim: ${path.basename(MIGRATION)} ===`);

  try {
    console.log('\n=== privileges (defense in depth) ===');
    {
      const priv = role => one(`SELECT has_function_privilege($1, 'process_priority_message(text,text,text,text,int)', 'EXECUTE') AS ok`, [role]).then(r => r.ok);
      check('anon can NOT execute it', (await priv('anon')) === false);
      check('authenticated can NOT execute it', (await priv('authenticated')) === false);
      check('service_role CAN execute it', (await priv('service_role')) === true);
    }

    console.log('\n=== ordinary semantics ===');
    {
      const r1 = await call(pool, 's1', 't1', 'hi', '2026-01', 3);
      check("first send -> 'sent', an id, remaining = limit - 1", r1.outcome === 'sent' && typeof r1.id === 'string' && r1.remaining === 2, JSON.stringify(r1));
      const stored = await one('SELECT * FROM priority_msgs WHERE id=$1', [r1.id]);
      check('the row matches exactly what was sent', stored.from_user === 's1' && stored.to_user === 't1' && stored.text === 'hi' && stored.month === '2026-01' && stored.read === false, JSON.stringify(stored));

      const r2 = await call(pool, 's1', 't1', 'hi again', '2026-01', 3);
      check("a second send to the SAME recipient, same month -> 'duplicate_recipient', nothing written", r2.outcome === 'duplicate_recipient' && (await countFor('s1', '2026-01')) === 1, JSON.stringify(r2));

      const r3 = await call(pool, 's1', 't2', 'different person', '2026-01', 3);
      const r4 = await call(pool, 's1', 't3', 'third', '2026-01', 3);
      check('two more DIFFERENT recipients -> both sent, remaining counts down (2, then 1)', r3.outcome === 'sent' && r3.remaining === 1 && r4.outcome === 'sent' && r4.remaining === 0, JSON.stringify([r3, r4]));

      const r5 = await call(pool, 's1', 't4', 'over the limit', '2026-01', 3);
      check("a 4th recipient at the 3/month limit -> 'limit_reached', count reported, nothing written", r5.outcome === 'limit_reached' && r5.count === 3 && (await countFor('s1', '2026-01')) === 3, JSON.stringify(r5));
    }

    console.log('\n=== month and sender isolation ===');
    {
      const rNext = await call(pool, 's1', 't1', 'a new month', '2026-02', 3);
      check("the SAME sender, a DIFFERENT month: quota resets, and the earlier 'duplicate' recipient is fine again", rNext.outcome === 'sent' && (await countFor('s1', '2026-02')) === 1, JSON.stringify(rNext));
      const rOther = await call(pool, 's2', 't1', 'unrelated sender', '2026-01', 3);
      check("a DIFFERENT sender, same recipient, same month as s1's limit_reached above: unaffected by s1's quota", rOther.outcome === 'sent' && (await countFor('s2', '2026-01')) === 1, JSON.stringify(rOther));
    }

    console.log('\n=== argument validation: nothing is ever partially applied ===');
    {
      const e1 = await err(call(pool, null, 't', 'x', '2026-01', 3));
      const e2 = await err(call(pool, '', 't', 'x', '2026-01', 3));
      const e3 = await err(call(pool, 'f', null, 'x', '2026-01', 3));
      const e4 = await err(call(pool, 'f', 't', 'x', null, 3));
      const e5 = await err(call(pool, 'f', 't', 'x', '2026-01', 0));
      const e6 = await err(call(pool, 'f', 't', 'x', '2026-01', -1));
      check('null/empty from_user, null to_user, null month, non-positive limit -> all error 22023', [e1, e2, e3, e4, e5, e6].every(e => e?.code === '22023'), JSON.stringify([e1, e2, e3, e4, e5, e6].map(e => e?.code)));
      check('none of the invalid calls wrote anything for sender "f"', (await countFor('f', '2026-01')) === 0);
    }

    console.log('\n=== REAL CONCURRENCY: 30 separate connections racing one sender\'s monthly quota ===');
    {
      const clients = await Promise.all(Array.from({ length: 30 }, () => newClient(port)));
      const results = await Promise.all(clients.map((c, i) => call(c, 'quota_race', `recipient_${i}`, 'hi', '2026-03', 3)));
      await Promise.all(clients.map(c => c.end()));
      const sent = results.filter(r => r.outcome === 'sent').length, limited = results.filter(r => r.outcome === 'limit_reached').length;
      console.log(`     [30 connections, limit 3] sent=${sent} limit_reached=${limited} rows=${await countFor('quota_race', '2026-03')}`);
      check('EXACTLY 3 sent, the other 27 limit_reached - never more than the limit, however they race', sent === 3 && limited === 27, `sent=${sent} limited=${limited}`);
      check('exactly 3 rows stored', (await countFor('quota_race', '2026-03')) === 3);
      check('every sent one reports a distinct id', new Set(results.filter(r => r.outcome === 'sent').map(r => r.id)).size === 3);
    }

    console.log('\n=== REAL CONCURRENCY: 25 separate connections racing the SAME (sender, recipient, month) ===');
    {
      const clients = await Promise.all(Array.from({ length: 25 }, () => newClient(port)));
      const results = await Promise.all(clients.map(c => call(c, 'dup_race', 'same_target', 'hi', '2026-04', 20)));   // limit 20, so this exercises the duplicate check, not the quota
      await Promise.all(clients.map(c => c.end()));
      const sent = results.filter(r => r.outcome === 'sent').length, dup = results.filter(r => r.outcome === 'duplicate_recipient').length;
      console.log(`     [25 connections, same recipient] sent=${sent} duplicate_recipient=${dup} rows=${await countFor('dup_race', '2026-04')}`);
      check('EXACTLY one sent, the other 24 duplicate_recipient', sent === 1 && dup === 24, `sent=${sent} dup=${dup}`);
      check('exactly one row stored for that (sender, recipient, month)', (await countFor('dup_race', '2026-04')) === 1);
    }

    console.log('\n=== the advisory lock itself: a competing call for the SAME key BLOCKS; a DIFFERENT key never does ===');
    {
      const a = await newClient(port), b = await newClient(port);
      await a.query('BEGIN'); await a.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, ['lockA:2026-05']);   // holds the exact key process_priority_message computes
      let bDone = false;
      const bP = call(b, 'lockA', 'target', 'hi', '2026-05', 3).then(r => { bDone = true; return r; });
      await sleep(600);
      check('while A holds the lock for (lockA, 2026-05), a competing call for the SAME key is BLOCKED (still pending after 600ms)', bDone === false);
      await a.query('COMMIT');
      const rb = await bP;
      check('after A releases (COMMIT), the blocked call resumes and sends normally', rb.outcome === 'sent' && (await countFor('lockA', '2026-05')) === 1, JSON.stringify(rb));
      await a.end(); await b.end();

      const a2 = await newClient(port), b2 = await newClient(port);
      await a2.query('BEGIN'); await a2.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, ['lockB:2026-05']);
      const t0 = Date.now();
      const rb2 = await call(b2, 'lockC', 'target', 'hi', '2026-05', 3);         // a DIFFERENT (sender, month) key entirely
      const elapsed = Date.now() - t0;
      check('a call for a DIFFERENT (sender, month) key is NOT blocked by A holding an unrelated key (completed quickly, not after A releases)', rb2.outcome === 'sent' && elapsed < 500, `elapsed=${elapsed}ms outcome=${rb2.outcome}`);
      await a2.query('ROLLBACK'); await a2.end(); await b2.end();

      const a3 = await newClient(port), b3 = await newClient(port);
      await a3.query('BEGIN'); await a3.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, ['lockD:2026-05']);
      const b3P = call(b3, 'lockD', 'target', 'hi', '2026-05', 3); await sleep(400);
      await a3.query('ROLLBACK');                                                // the holder aborts WITHOUT ever calling the function itself
      const rb3 = await b3P;
      check('if the holder rolls back instead of committing, the blocked call still proceeds normally (the lock is never left stranded)', rb3.outcome === 'sent', JSON.stringify(rb3));
      await a3.end(); await b3.end();
    }
  } finally {
    try { await pool.end(); } catch {}
    try { await epg.stop(); } catch {}
    await sleep(500);
    try { fs.rmSync(dbDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch { /* temp dir only */ }
  }

  console.log(`\n=== RESULTS: ${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('SCRIPT ERROR', e); process.exit(1); });
