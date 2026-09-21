// Tests migrations/022_atomic_payment_entitlement.sql — process_payment_entitlement()
// — directly, on a REAL multi-connection PostgreSQL server (embedded-postgres),
// with the migration file applied VERBATIM. This is the evidence that the
// atomicity/idempotency guarantees hold in the database itself (audit A5),
// independent of the Node server:
//
//   * grant semantics (extend from max(now, expiry), plan/user from the stored row)
//   * idempotence (second call is a no-op; a different payment id cannot re-grant)
//   * real concurrency: N separate connections racing one order -> exactly one grant
//   * the row lock itself: a competing call BLOCKS until the lock holder commits/rolls back
//   * no lost update between two different orders (or another writer) for the same user
//   * failure windows: a failed premium write, a missing user, an injected trigger failure,
//     and a simulated crash (backend killed before COMMIT) ALL leave the payment 'created'
//     with no entitlement, and a later call grants normally
//   * privileges: anon/authenticated cannot execute it; service_role can
//
// Requires (test-only, not project dependencies):  npm install --no-save embedded-postgres pg
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
const MIGRATION = fs.readdirSync(path.join(here, 'migrations')).filter(f => /^022_.*\.sql$/.test(f)).map(f => path.join(here, 'migrations', f))[0];
if (!MIGRATION) { console.error('migrations/022_*.sql not found'); process.exit(2); }

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}  ${String(detail ?? '').slice(0, 260)}`); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise((resolve, reject) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); }); s.on('error', reject); });

const SCHEMA = `
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
CREATE TABLE users (id text PRIMARY KEY, premium boolean DEFAULT false, premium_expires_at timestamptz, premium_plan text, premium_since timestamptz, note text);
CREATE TABLE payments (id text PRIMARY KEY, user_id text NOT NULL, razorpay_order_id text NOT NULL, razorpay_payment_id text, plan text NOT NULL, currency text NOT NULL DEFAULT 'INR', amount int NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'created', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE grant_log (id serial PRIMARY KEY, user_id text, old_expiry timestamptz, new_expiry timestamptz);
CREATE FUNCTION log_grant() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN INSERT INTO grant_log(user_id, old_expiry, new_expiry) VALUES (NEW.id, OLD.premium_expires_at, NEW.premium_expires_at); RETURN NEW; END $$;
CREATE TRIGGER users_grant_log AFTER UPDATE ON users FOR EACH ROW WHEN (NEW.premium_expires_at IS DISTINCT FROM OLD.premium_expires_at) EXECUTE FUNCTION log_grant();
`;
const FAULT_ON = `CREATE FUNCTION fail_user_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure applying entitlement' USING ERRCODE = 'P0001'; END $$;
CREATE TRIGGER users_fault BEFORE UPDATE OF premium_expires_at ON users FOR EACH ROW WHEN (NEW.id = 'fail_user') EXECUTE FUNCTION fail_user_update();`;
const FAULT_OFF = `DROP TRIGGER users_fault ON users; DROP FUNCTION fail_user_update();`;

const DAYS = { monthly: 30, quarterly: 90 };
let pool, seq = 0;
const one = async (sql, args) => (await pool.query(sql, args)).rows[0];
const call = (client, order, payId, plan, days) => client.query('SELECT process_payment_entitlement($1,$2,$3,$4) AS r', [order, payId, plan, days ?? DAYS[plan]]).then(r => r.rows[0].r);
const mkUser = (id, expiry = null) => pool.query('INSERT INTO users (id, premium, premium_expires_at) VALUES ($1, $2, $3)', [id, expiry !== null, expiry]);
async function mkOrder(userId, plan) { const id = `order_${++seq}_${userId}`; await pool.query('INSERT INTO payments (id, user_id, razorpay_order_id, plan) VALUES ($1,$2,$1,$3)', [id, userId, plan]); return id; }
const userRow = id => one('SELECT * FROM users WHERE id=$1', [id]);
const orderRow = id => one('SELECT * FROM payments WHERE id=$1', [id]);
const grants = async id => Number((await one('SELECT count(*) c FROM grant_log WHERE user_id=$1', [id])).c);
const days = (ts, from) => (new Date(ts).getTime() - from) / 864e5;
const near = (v, n, tol = 0.01) => v !== null && Math.abs(v - n) < tol;
const err = async p => { try { await p; return null; } catch (e) { return e; } };

async function main() {
  const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-a5sql-'));
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
      const priv = role => one(`SELECT has_function_privilege($1, 'process_payment_entitlement(text,text,text,int)', 'EXECUTE') AS ok`, [role]).then(r => r.ok);
      check('anon can NOT execute it', (await priv('anon')) === false);
      check('authenticated can NOT execute it', (await priv('authenticated')) === false);
      check('service_role CAN execute it', (await priv('service_role')) === true);
    }

    console.log('\n=== grant semantics ===');
    {
      await mkUser('u1'); const o = await mkOrder('u1', 'monthly'); const t0 = Date.now();
      const r = await call(pool, o, 'pay_1', 'monthly');
      const u = await userRow('u1'), p = await orderRow(o);
      check("outcome 'granted' with user/plan/expiry in the result", r.outcome === 'granted' && r.user_id === 'u1' && r.plan === 'monthly' && !!r.expires_at, JSON.stringify(r));
      check('monthly: premium true, ~30 days, plan monthly, premium_since set', u.premium === true && near(days(u.premium_expires_at, t0), 30) && u.premium_plan === 'monthly' && !!u.premium_since, JSON.stringify(u));
      check("payment: status 'paid' and the payment id recorded", p.status === 'paid' && p.razorpay_payment_id === 'pay_1', JSON.stringify(p));
      await mkUser('u2'); const oq = await mkOrder('u2', 'quarterly'); const t1 = Date.now();
      await call(pool, oq, 'pay_2', 'quarterly');
      check('quarterly: ~90 days, plan quarterly', near(days((await userRow('u2')).premium_expires_at, t1), 90) && (await userRow('u2')).premium_plan === 'quarterly');
      await mkUser('u3', new Date(Date.now() + 10 * 864e5).toISOString()); const ob = await mkOrder('u3', 'monthly'); const t2 = Date.now();
      await call(pool, ob, 'pay_3', 'monthly');
      check('unexpired balance (+10d) is preserved: result ~ +40d', near(days((await userRow('u3')).premium_expires_at, t2), 40));
      await mkUser('u4', new Date(Date.now() - 5 * 864e5).toISOString()); const oe = await mkOrder('u4', 'quarterly'); const t3 = Date.now();
      await call(pool, oe, 'pay_4', 'quarterly');
      check('expired balance (-5d): extends from now, ~ +90d (not from the stale date)', near(days((await userRow('u4')).premium_expires_at, t3), 90));
    }

    console.log('\n=== idempotence ===');
    {
      await mkUser('idem'); const o = await mkOrder('idem', 'monthly');
      const first = await call(pool, o, 'pay_idem', 'monthly'); const exp = (await userRow('idem')).premium_expires_at;
      const second = await call(pool, o, 'pay_idem', 'monthly');
      const third = await call(pool, o, 'pay_OTHER', 'monthly');            // a different payment id must not re-grant either
      const fourth = await call(pool, o, 'pay_idem', 'monthly', 90);        // nor a different day count
      check("second/third/fourth calls -> 'already_processed'", [second, third, fourth].every(r => r.outcome === 'already_processed'), JSON.stringify([second, third, fourth]));
      check('expiry unchanged, exactly one premium write', new Date((await userRow('idem')).premium_expires_at).getTime() === new Date(exp).getTime() && (await grants('idem')) === 1, `writes=${await grants('idem')}`);
      check('recorded payment id is still the first one', (await orderRow(o)).razorpay_payment_id === 'pay_idem');
      check("first call had granted", first.outcome === 'granted');
    }

    console.log('\n=== argument / state validation ===');
    {
      const nf = await call(pool, 'order_does_not_exist', 'pay_x', 'monthly');
      check("unknown order -> outcome 'not_found' (no error, no writes)", nf.outcome === 'not_found', JSON.stringify(nf));
      await mkUser('val'); const o = await mkOrder('val', 'monthly');
      const e1 = await err(call(pool, o, 'pay_v', 'quarterly'));      // caller disagrees with the STORED plan (A4)
      check("plan that disagrees with the stored order plan -> error 22023, nothing changed", e1?.code === '22023' && (await orderRow(o)).status === 'created' && (await userRow('val')).premium === false, e1 && `${e1.code} ${e1.message}`);
      const e2 = await err(call(pool, o, '', 'monthly'));
      const e3 = await err(call(pool, o, 'pay_v', 'monthly', 0));
      const e4 = await err(call(pool, null, 'pay_v', 'monthly'));
      check('empty payment id / non-positive days / null order id -> errors, nothing changed', [e2, e3, e4].every(e => e?.code === '22023') && (await orderRow(o)).status === 'created', JSON.stringify([e2?.code, e3?.code, e4?.code]));
      await mkUser('victim'); await mkUser('payer'); const op = await mkOrder('payer', 'monthly');
      await call(pool, op, 'pay_p', 'monthly');
      check("the grant goes to payments.user_id only — another user's premium is untouched", (await userRow('victim')).premium === false && (await grants('victim')) === 0 && (await userRow('payer')).premium === true);
    }

    console.log('\n=== REAL CONCURRENCY: 40 separate connections racing one order ===');
    {
      await mkUser('race'); const o = await mkOrder('race', 'monthly'); const t0 = Date.now();
      const clients = await Promise.all(Array.from({ length: 40 }, async () => { const c = new pg.Client({ host: '127.0.0.1', port, user: 'postgres', password: 'pw', database: 'byn' }); await c.connect(); return c; }));
      const results = await Promise.all(clients.map((c, i) => call(c, o, 'pay_race', 'monthly')));
      await Promise.all(clients.map(c => c.end()));
      const granted = results.filter(r => r.outcome === 'granted').length, already = results.filter(r => r.outcome === 'already_processed').length;
      console.log(`     [40 connections] granted=${granted} already_processed=${already} premium writes=${await grants('race')} expiry=+${days((await userRow('race')).premium_expires_at, t0).toFixed(3)}d status=${(await orderRow(o)).status}`);
      check('exactly ONE connection granted; the other 39 saw already_processed', granted === 1 && already === 39, `granted=${granted} already=${already}`);
      check('exactly one premium write; expiry = one monthly grant', (await grants('race')) === 1 && near(days((await userRow('race')).premium_expires_at, t0), 30, 0.05));
    }

    console.log('\n=== the row lock itself: a competing call BLOCKS until the lock holder finishes ===');
    {
      await mkUser('lk'); const o = await mkOrder('lk', 'monthly');
      const a = new pg.Client({ host: '127.0.0.1', port, user: 'postgres', password: 'pw', database: 'byn' }); await a.connect();
      const b = new pg.Client({ host: '127.0.0.1', port, user: 'postgres', password: 'pw', database: 'byn' }); await b.connect();
      await a.query('BEGIN'); await a.query('SELECT 1 FROM payments WHERE id=$1 FOR UPDATE', [o]);          // session A holds the payment row lock
      let bDone = false; const bP = call(b, o, 'pay_lk', 'monthly').then(r => { bDone = true; return r; });
      await sleep(600);
      check('while A holds the lock, the competing call is BLOCKED (still pending after 600ms)', bDone === false);
      await a.query(`UPDATE payments SET status='paid', razorpay_payment_id='pay_by_A' WHERE id=$1`, [o]); await a.query('COMMIT');   // A "wins" and commits
      const rb = await bP;
      check("after A commits paid, the blocked call resumes and sees 'already_processed' (no grant)", rb.outcome === 'already_processed' && (await grants('lk')) === 0, JSON.stringify(rb));
      await a.end(); await b.end();

      await mkUser('lk2'); const o2 = await mkOrder('lk2', 'monthly');
      const a2 = new pg.Client({ host: '127.0.0.1', port, user: 'postgres', password: 'pw', database: 'byn' }); await a2.connect();
      const b2 = new pg.Client({ host: '127.0.0.1', port, user: 'postgres', password: 'pw', database: 'byn' }); await b2.connect();
      await a2.query('BEGIN'); await a2.query('SELECT 1 FROM payments WHERE id=$1 FOR UPDATE', [o2]);
      const b2P = call(b2, o2, 'pay_lk2', 'monthly'); await sleep(400);
      await a2.query('ROLLBACK');                                        // the holder aborts WITHOUT paying
      const rb2 = await b2P;
      check("if the holder rolls back instead, the blocked call proceeds and grants (a lost holder never strands the payment)", rb2.outcome === 'granted' && (await grants('lk2')) === 1, JSON.stringify(rb2));
      await a2.end(); await b2.end();
    }

    console.log('\n=== no lost update: two DIFFERENT paid orders, and another writer, on the same user ===');
    {
      await mkUser('multi'); const t0 = Date.now();
      const o1 = await mkOrder('multi', 'monthly'), o2 = await mkOrder('multi', 'quarterly'), o3 = await mkOrder('multi', 'monthly');
      const rs = await Promise.all([call(pool, o1, 'pm1', 'monthly'), call(pool, o2, 'pm2', 'quarterly'), call(pool, o3, 'pm3', 'monthly')]);
      const total = days((await userRow('multi')).premium_expires_at, t0);
      check('3 concurrent DIFFERENT orders (30+90+30) all granted and STACK to ~150d (none lost)', rs.every(r => r.outcome === 'granted') && near(total, 150, 0.05) && (await grants('multi')) === 3, `total=+${total.toFixed(3)}d writes=${await grants('multi')}`);

      await mkUser('other_writer'); const ow = await mkOrder('other_writer', 'monthly'); const tw = Date.now();
      const a = new pg.Client({ host: '127.0.0.1', port, user: 'postgres', password: 'pw', database: 'byn' }); await a.connect();
      await a.query('BEGIN'); await a.query(`UPDATE users SET premium=true, premium_expires_at = now() + interval '10 days' WHERE id='other_writer'`);   // e.g. a referral grant, mid-transaction
      const fP = call(pool, ow, 'pay_ow', 'monthly'); await sleep(500);
      await a.query('COMMIT'); const fr = await fP; await a.end();
      check("a concurrent writer's +10d on the same user is not overwritten: result ~ +40d", fr.outcome === 'granted' && near(days((await userRow('other_writer')).premium_expires_at, tw), 40, 0.05), `+${days((await userRow('other_writer')).premium_expires_at, tw)}d`);
    }

    console.log('\n=== FAILURE WINDOWS: nothing is ever left "paid without entitlement" ===');
    {
      // A. payment row updated, then the premium write FAILS (injected trigger failure)
      await mkUser('fail_user'); const oa = await mkOrder('fail_user', 'monthly');
      await pool.query(FAULT_ON);
      const ea = await err(call(pool, oa, 'pay_fail', 'monthly'));
      const pa = await orderRow(oa), ua = await userRow('fail_user');
      check("A. premium write fails AFTER the payment was marked paid inside the txn -> ERROR to the caller", !!ea && /injected failure/.test(ea.message), ea && ea.message);
      check("A. ...and the paid marker was ROLLED BACK: status 'created', no payment id, no entitlement", pa.status === 'created' && pa.razorpay_payment_id === null && ua.premium === false && ua.premium_expires_at === null && (await grants('fail_user')) === 0, JSON.stringify({ pa, ua }));
      await pool.query(FAULT_OFF);
      const retry = await call(pool, oa, 'pay_fail', 'monthly');
      check('A. after the fault clears, the retry grants normally, exactly once', retry.outcome === 'granted' && (await grants('fail_user')) === 1 && (await orderRow(oa)).status === 'paid');

      // A'. no such user row: the same rollback, with no injected fault at all
      const oz = await mkOrder('ghost_user', 'monthly');
      const ez = await err(call(pool, oz, 'pay_ghost', 'monthly'));
      check("A'. order whose user row is missing -> ERROR (P0002) and the payment stays 'created'", ez?.code === 'P0002' && (await orderRow(oz)).status === 'created' && (await orderRow(oz)).razorpay_payment_id === null, ez && `${ez.code} ${ez.message}`);

      // B. crash after the premium update but before COMMIT: the backend is killed mid-transaction
      await mkUser('crash'); const oc = await mkOrder('crash', 'monthly');
      const victim = new pg.Client({ host: '127.0.0.1', port, user: 'postgres', password: 'pw', database: 'byn' }); await victim.connect();
      const pid = (await victim.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      victim.on('error', () => {});                                       // the killed connection will emit an error; expected
      await victim.query('BEGIN');
      const inTxn = await call(victim, oc, 'pay_crash', 'monthly');       // function ran to completion INSIDE an open, uncommitted transaction
      const seenInsideTxn = (await victim.query(`SELECT status FROM payments WHERE id=$1`, [oc])).rows[0].status;
      await pool.query('SELECT pg_terminate_backend($1)', [pid]);         // "the process crashes" before COMMIT
      await sleep(400);
      check("B. inside the doomed transaction the function had already marked paid + granted", inTxn.outcome === 'granted' && seenInsideTxn === 'paid');
      check("B. after the crash NOTHING was committed: payment 'created', no entitlement, no premium write", (await orderRow(oc)).status === 'created' && (await userRow('crash')).premium === false && (await grants('crash')) === 0);
      const afterCrash = await call(pool, oc, 'pay_crash', 'monthly');
      check('B. the retry after the crash grants exactly once', afterCrash.outcome === 'granted' && (await grants('crash')) === 1);
      try { await victim.end(); } catch {}
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
