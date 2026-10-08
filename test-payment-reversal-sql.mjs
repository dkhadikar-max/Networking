// Tests migrations/027 - process_payment_reversal(), payment_refunded_total() and the replaced
// process_payment_entitlement() - directly, on a REAL multi-connection PostgreSQL server
// (embedded-postgres), with migrations 022, 026 and 027 applied VERBATIM, in order. Locked decisions
// (2026-10-08, payments spec): D2 full refund subtracts exactly the days that payment contributed,
// never a blanket premium=false and never a NULL (perpetual) expiry; D3 partial refund is record
// only; D4 an opened dispute changes nothing, a LOST dispute reverses; D5 a deleted account's
// refund is record only; idempotent on the Razorpay event id; atomic.
//
//   Entitlement function (regression + new): grant semantics unchanged; any non-'created' status is
//   "already processed" (a replayed capture can no longer re-grant a refunded payment); a refund or
//   lost dispute that arrived BEFORE the capture is honoured (no grant); granted_days is recorded.
//   Reversal function: full / partial / cumulative refunds, refund-id dedupe, stacked grants,
//   perpetual and deleted accounts, dispute lifecycle, reverse-at-most-once, unmatched / rejected /
//   no-change events, rollback on a mid-transaction failure, real concurrency, privileges.
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
const mig = n => fs.readdirSync(path.join(here, 'migrations')).filter(f => new RegExp(`^${n}_.*\\.sql$`).test(f)).map(f => path.join(here, 'migrations', f))[0];
const M022 = mig('022'), M026 = mig('026'), M027 = mig('027');
if (!M022 || !M026 || !M027) { console.error('migrations/022_*.sql, 026_*.sql and 027_*.sql are required'); process.exit(2); }

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}  ${String(detail ?? '').slice(0, 300)}`); }
}
const freePort = () => new Promise((resolve, reject) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); }); s.on('error', reject); });

// Production shape: users carries deleted_at; payments has the FK to users (026 turns it into RESTRICT; 027 adds the reversal machinery).
const SCHEMA = `
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
CREATE TABLE users (id text PRIMARY KEY, premium boolean DEFAULT false, premium_expires_at timestamptz, premium_plan text, premium_since timestamptz, deleted_at timestamptz);
CREATE TABLE payments (id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE, razorpay_order_id text NOT NULL, razorpay_payment_id text,
  plan text NOT NULL, currency text NOT NULL DEFAULT 'INR', amount int NOT NULL, status text NOT NULL DEFAULT 'created', created_at timestamptz NOT NULL DEFAULT now());
`;
const FAULT_ON = `CREATE FUNCTION fail_user_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure applying the reversal' USING ERRCODE = 'P0001'; END $$;
CREATE TRIGGER users_fault BEFORE UPDATE ON users FOR EACH ROW WHEN (OLD.id = 'fail_user') EXECUTE FUNCTION fail_user_update();`;
const FAULT_OFF = `DROP TRIGGER users_fault ON users; DROP FUNCTION fail_user_update();`;

const DAYS = { monthly: 30, quarterly: 90 }, AMOUNT = { monthly: 24900, quarterly: 59900 };
const PLAN_DAYS = JSON.stringify(DAYS);
let pool, seq = 0;
const one = async (sql, args) => (await pool.query(sql, args)).rows[0];
const DAY = 864e5;
const inDays = d => new Date(Date.now() + d * DAY).toISOString();
const daysFromNow = iso => iso ? (new Date(iso).getTime() - Date.now()) / DAY : null;
const approx = (v, n, tol = 0.01) => v !== null && Math.abs(v - n) < tol;
const mkUser = (id, o = {}) => pool.query('INSERT INTO users (id, premium, premium_expires_at, deleted_at) VALUES ($1,$2,$3,$4)', [id, o.premium ?? (o.expiry != null), o.expiry ?? null, o.deleted_at ?? null]);
const userRow = id => one('SELECT * FROM users WHERE id=$1', [id]);
const payRow = id => one('SELECT * FROM payments WHERE id=$1', [id]);
const evCount = async where => Number((await one(`SELECT count(*) c FROM payment_events WHERE ${where}`)).c);
async function mkOrder(userId, plan = 'monthly', o = {}) {
  const id = `order_${++seq}_${userId}`;
  await pool.query('INSERT INTO payments (id,user_id,razorpay_order_id,plan,currency,amount) VALUES ($1,$2,$1,$3,$4,$5)', [id, userId, plan, o.currency ?? 'INR', o.amount ?? AMOUNT[plan]]);
  return id;
}
const grant = (c, order, payId, plan = 'monthly', days) => c.query('SELECT process_payment_entitlement($1,$2,$3,$4) AS r', [order, payId, plan, days ?? DAYS[plan]]).then(r => r.rows[0].r);
let evSeq = 0;
const reverse = (c, type, payId, o = {}) => c.query('SELECT process_payment_reversal($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb) AS r',
  [o.event ?? `evt_${++evSeq}`, type, payId, o.entity ?? `ent_${evSeq}`, o.amount ?? null, o.currency ?? 'INR', o.status ?? null, JSON.stringify(o.payload ?? {}), o.planDays ?? PLAN_DAYS]).then(r => r.rows[0].r);
const rev = (type, payId, o) => reverse(pool, type, payId, o);
// A paid monthly order for a fresh user: returns ids so each scenario is independent.
async function paid(uid, o = {}) {
  await mkUser(uid, o);
  const order = await mkOrder(uid, o.plan ?? 'monthly', o);
  const payId = `pay_${order}`;
  const g = await grant(pool, order, payId, o.plan ?? 'monthly');
  return { uid, order, payId, g };
}

async function main() {
  const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'byn-rev-pg-'));
  const pgPort = await freePort();
  const epg = new EmbeddedPostgres({ databaseDir: dbDir, user: 'postgres', password: 'pw', port: pgPort, persistent: false, onLog: () => {}, onError: () => {} });
  await epg.initialise(); await epg.start(); await epg.createDatabase('byn');
  const connCfg = { host: '127.0.0.1', port: pgPort, user: 'postgres', password: 'pw', database: 'byn' };
  pool = new pg.Pool({ ...connCfg, max: 30 });
  await pool.query(SCHEMA);
  await pool.query(fs.readFileSync(M022, 'utf8'));
  for (const m of [M026, M027]) {
    await pool.query(fs.readFileSync(m, 'utf8'));
    await pool.query(fs.readFileSync(m, 'utf8'));   // both migrations are idempotent: a re-run must be harmless
  }
  console.log(`=== real Postgres up; migrations ${path.basename(M022)} + ${path.basename(M026)} + ${path.basename(M027)} applied (026 and 027 twice each) ===`);

  try {
    // ───────────────────────── process_payment_entitlement (regression + new) ─────────────────────────
    console.log('\n=== process_payment_entitlement: grant semantics unchanged ===');
    let t = await paid('u_new');
    check('first grant: outcome granted, premium true, expiry ~ now + 30d, plan stored', t.g.outcome === 'granted' && (await userRow('u_new')).premium === true && approx(daysFromNow((await userRow('u_new')).premium_expires_at), 30, 0.05) && (await userRow('u_new')).premium_plan === 'monthly', JSON.stringify(t.g));
    let p = await payRow(t.order);
    check('payment is paid, carries the razorpay payment id, and records granted_days = 30', p.status === 'paid' && p.razorpay_payment_id === t.payId && p.granted_days === 30 && p.refunded_amount === 0 && p.entitlement_reversed_days === 0, JSON.stringify(p));
    await mkUser('u_ext', { expiry: inDays(10) });
    const oExt = await mkOrder('u_ext', 'quarterly');
    await grant(pool, oExt, 'pay_ext', 'quarterly');
    check('extends from a FUTURE expiry (10d left + 90d = ~100d)', approx(daysFromNow((await userRow('u_ext')).premium_expires_at), 100, 0.05), String((await userRow('u_ext')).premium_expires_at));
    const before = (await userRow('u_new')).premium_expires_at;
    let r = await grant(pool, t.order, t.payId);
    check('replaying the same capture -> already_processed, expiry untouched', r.outcome === 'already_processed' && (await userRow('u_new')).premium_expires_at.getTime() === before.getTime(), JSON.stringify(r));
    r = await grant(pool, t.order, 'pay_other_id');
    check('a different payment id on a paid order cannot re-grant', r.outcome === 'already_processed', JSON.stringify(r));
    r = await grant(pool, 'order_nope', 'pay_x').catch(e => ({ err: e.message }));
    check('unknown order -> not_found', r.outcome === 'not_found', JSON.stringify(r));
    await mkUser('u_plan'); const oPlan = await mkOrder('u_plan', 'monthly');
    r = await grant(pool, oPlan, 'pay_plan', 'quarterly').catch(e => ({ err: e.code }));
    check('a plan that disagrees with the stored order still raises (A4 preserved)', r.err === '22023', JSON.stringify(r));
    check('...and nothing was granted', (await payRow(oPlan)).status === 'created', '');

    console.log('\n=== process_payment_entitlement: a replayed capture cannot re-grant a reversed payment ===');
    t = await paid('u_replay');
    await rev('refund.processed', t.payId, { amount: 24900 });
    check('setup: the payment is refunded', (await payRow(t.order)).status === 'refunded', '');
    const afterRefund = await userRow('u_replay');
    r = await grant(pool, t.order, t.payId);
    check('capture replayed after a full refund -> already_processed (it used to test status = paid only)', r.outcome === 'already_processed', JSON.stringify(r));
    check('...and premium was not re-granted', (await userRow('u_replay')).premium === afterRefund.premium && String((await userRow('u_replay')).premium_expires_at) === String(afterRefund.premium_expires_at), '');

    console.log('\n=== out-of-order: a refund / lost dispute that beats the capture is honoured ===');
    await mkUser('u_early'); const oEarly = await mkOrder('u_early', 'monthly'); const payEarly = `pay_${oEarly}`;
    r = await rev('refund.processed', payEarly, { amount: 24900 });
    check('the early refund is recorded as unmatched (no payment row carries that payment id yet)', r.outcome === 'unmatched' && (await evCount(`razorpay_payment_id='${payEarly}' AND outcome='unmatched'`)) === 1, JSON.stringify(r));
    r = await grant(pool, oEarly, payEarly);
    check('the capture then grants NOTHING: outcome already_reversed', r.outcome === 'already_reversed', JSON.stringify(r));
    p = await payRow(oEarly);
    check('...payment marked refunded with its payment id and refunded_amount, no premium written', p.status === 'refunded' && p.razorpay_payment_id === payEarly && p.refunded_amount === 24900 && (await userRow('u_early')).premium === false && (await userRow('u_early')).premium_expires_at === null, JSON.stringify(p));
    check('...the ledger row now points at the payment row', (await evCount(`razorpay_payment_id='${payEarly}' AND payment_row_id='${oEarly}'`)) === 1, '');
    await mkUser('u_early_lost'); const oEL = await mkOrder('u_early_lost'); const payEL = `pay_${oEL}`;
    await rev('payment.dispute.lost', payEL, { amount: 24900 });
    r = await grant(pool, oEL, payEL);
    check('a lost dispute recorded before the capture -> already_reversed, status chargeback_lost, no grant', r.outcome === 'already_reversed' && (await payRow(oEL)).status === 'chargeback_lost' && (await userRow('u_early_lost')).premium === false, JSON.stringify(r));
    await mkUser('u_early_part'); const oEP = await mkOrder('u_early_part'); const payEP = `pay_${oEP}`;
    await rev('refund.processed', payEP, { amount: 5000 });
    r = await grant(pool, oEP, payEP);
    p = await payRow(oEP);
    check('a PARTIAL refund recorded early does not block the grant; it is carried onto the row', r.outcome === 'granted' && p.status === 'partially_refunded' && p.refunded_amount === 5000 && (await userRow('u_early_part')).premium === true, JSON.stringify([r, p]));

    // ───────────────────────── process_payment_reversal ─────────────────────────
    console.log('\n=== full refund (D2): subtract exactly the days that payment contributed ===');
    t = await paid('u_full');                                   // no prior time: expiry = now + 30d
    r = await rev('refund.processed', t.payId, { amount: 24900 });
    let u = await userRow('u_full'); p = await payRow(t.order);
    check('outcome applied, status refunded, refunded_amount = paid amount', r.outcome === 'applied' && p.status === 'refunded' && p.refunded_amount === 24900, JSON.stringify([r, p]));
    check('the only time on the account was this payment\'s -> premium becomes false', u.premium === false, JSON.stringify(u));
    check('...entitlement_reversed_days = 30 and reversed_at set; user_changed true', p.entitlement_reversed_days === 30 && !!p.reversed_at && r.user_changed === true, JSON.stringify([p, r]));

    t = await paid('u_stack', { expiry: inDays(60) });          // 60d already + this payment's 30d = 90d
    check('setup: stacked expiry ~ 90d', approx(daysFromNow((await userRow('u_stack')).premium_expires_at), 90, 0.05), '');
    r = await rev('refund.processed', t.payId, { amount: 24900 });
    u = await userRow('u_stack');
    check('days supplied by ANOTHER source survive: premium stays true, expiry ~ 60d (not blanket premium=false)', u.premium === true && approx(daysFromNow(u.premium_expires_at), 60, 0.05), JSON.stringify(u));
    await mkUser('u_ref'); const oRef = await mkOrder('u_ref'); await grant(pool, oRef, 'pay_ref');          // +30d
    await pool.query(`UPDATE users SET premium_expires_at = premium_expires_at + interval '30 days' WHERE id='u_ref'`);   // a referral month on top (~60d)
    await rev('refund.processed', 'pay_ref', { amount: 24900 });
    u = await userRow('u_ref');
    check('purchase then a referral month then refund: only the purchase\'s 30d are removed (~30d remain, premium true)', u.premium === true && approx(daysFromNow(u.premium_expires_at), 30, 0.05), JSON.stringify(u));

    console.log('\n=== perpetual (NULL expiry) entitlement is untouched ===');
    t = await paid('u_perp');
    await pool.query(`UPDATE users SET premium=true, premium_expires_at=NULL WHERE id='u_perp'`);   // an admin grant after the purchase
    r = await rev('refund.processed', t.payId, { amount: 24900 });
    u = await userRow('u_perp'); p = await payRow(t.order);
    check('full refund -> user row untouched (premium true, expiry NULL), user_changed false', u.premium === true && u.premium_expires_at === null && r.user_changed === false, JSON.stringify([u, r]));
    check('...the payment is still recorded refunded, nothing reversed', p.status === 'refunded' && p.entitlement_reversed_days === 0 && /perpetual_entitlement_untouched/.test(r.detail), JSON.stringify([p, r.detail]));

    console.log('\n=== deleted account (D5): record only ===');
    t = await paid('u_del');
    await pool.query(`UPDATE users SET deleted_at = now() WHERE id='u_del'`);
    const delBefore = await userRow('u_del');
    r = await rev('refund.processed', t.payId, { amount: 24900 });
    u = await userRow('u_del'); p = await payRow(t.order);
    check('refund after deletion: payment refunded + ledgered, entitlement fields NOT modified', p.status === 'refunded' && u.premium === delBefore.premium && String(u.premium_expires_at) === String(delBefore.premium_expires_at) && r.user_changed === false && /deleted_account_entitlement_untouched/.test(r.detail), JSON.stringify([p, u, r]));

    console.log('\n=== partial refund (D3): record only; cumulative full refund reverses once ===');
    t = await paid('u_part');
    const partBefore = await userRow('u_part');
    r = await rev('refund.processed', t.payId, { entity: 'rfnd_a', amount: 10000 });
    u = await userRow('u_part'); p = await payRow(t.order);
    check('partial: status partially_refunded, refunded_amount 10000, entitlement unchanged', p.status === 'partially_refunded' && p.refunded_amount === 10000 && String(u.premium_expires_at) === String(partBefore.premium_expires_at) && u.premium === true && r.user_changed === false, JSON.stringify([p, u]));
    r = await rev('refund.processed', t.payId, { entity: 'rfnd_b', amount: 14900 });
    u = await userRow('u_part'); p = await payRow(t.order);
    check('a second refund making the cumulative total = the paid amount -> refunded + entitlement reversed', p.status === 'refunded' && p.refunded_amount === 24900 && u.premium === false && p.entitlement_reversed_days === 30, JSON.stringify([p, u]));

    console.log('\n=== idempotency ===');
    t = await paid('u_idem', { expiry: inDays(60) });
    const evId = 'evt_idem_1';
    r = await rev('refund.processed', t.payId, { event: evId, entity: 'rfnd_i', amount: 24900 });
    const afterFirst = await userRow('u_idem');
    const r2 = await rev('refund.processed', t.payId, { event: evId, entity: 'rfnd_i', amount: 24900 });
    check('the same event id redelivered -> already_processed, no second subtraction, one ledger row', r2.outcome === 'already_processed' && String((await userRow('u_idem')).premium_expires_at) === String(afterFirst.premium_expires_at) && (await evCount(`event_id='${evId}'`)) === 1, JSON.stringify(r2));
    t = await paid('u_idem2', { expiry: inDays(60) });
    await rev('refund.processed', t.payId, { event: 'evt_d1', entity: 'rfnd_same', amount: 15000 });
    await rev('refund.processed', t.payId, { event: 'evt_d2', entity: 'rfnd_same', amount: 15000 });
    p = await payRow(t.order);
    check('the SAME refund id under a NEW event id is not double-counted (15000, still partial)', p.refunded_amount === 15000 && p.status === 'partially_refunded', JSON.stringify(p));

    console.log('\n=== refund then chargeback reverses exactly once ===');
    t = await paid('u_once', { expiry: inDays(60) });           // ~90d
    await rev('refund.processed', t.payId, { amount: 24900 });   // -> ~60d
    await pool.query(`UPDATE users SET premium_expires_at = premium_expires_at + interval '30 days' WHERE id='u_once'`);   // later +30d from another source (~90d)
    const onceBefore = (await userRow('u_once')).premium_expires_at;
    r = await rev('payment.dispute.lost', t.payId, { amount: 24900 });
    u = await userRow('u_once'); p = await payRow(t.order);
    check('a lost dispute after a full refund does NOT subtract the days a second time', u.premium_expires_at.getTime() === onceBefore.getTime() && p.entitlement_reversed_days === 30 && /entitlement_already_reversed/.test(r.detail), JSON.stringify([u, p, r.detail]));
    check('...the status stays refunded (a terminal state is never overwritten)', p.status === 'refunded', p.status);
    t = await paid('u_once2', { expiry: inDays(60) });
    await rev('payment.dispute.lost', t.payId, { amount: 24900 });
    await rev('refund.processed', t.payId, { amount: 24900 });
    p = await payRow(t.order);
    check('chargeback first, then a refund: still reversed once, status chargeback_lost', p.entitlement_reversed_days === 30 && p.status === 'chargeback_lost' && approx(daysFromNow((await userRow('u_once2')).premium_expires_at), 60, 0.05), JSON.stringify(p));

    console.log('\n=== dispute lifecycle (D4) ===');
    t = await paid('u_disp', { expiry: inDays(60) });
    const dispBefore = await userRow('u_disp');
    r = await rev('payment.dispute.created', t.payId, { entity: 'disp_1', amount: 24900, status: 'open' });
    check('dispute opened: status disputed, entitlement NOT removed', (await payRow(t.order)).status === 'disputed' && String((await userRow('u_disp')).premium_expires_at) === String(dispBefore.premium_expires_at) && r.user_changed === false, JSON.stringify(r));
    for (const evt of ['payment.dispute.under_review', 'payment.dispute.action_required']) {
      r = await rev(evt, t.payId, { entity: 'disp_1' });
      check(`${evt}: recorded, no change`, r.outcome === 'no_change' && (await payRow(t.order)).status === 'disputed', JSON.stringify(r));
    }
    r = await rev('payment.dispute.closed', t.payId, { entity: 'disp_1' });
    check('payment.dispute.closed: recorded only (does not guess a winner), status stays disputed', r.outcome === 'no_change' && (await payRow(t.order)).status === 'disputed', JSON.stringify(r));
    r = await rev('payment.dispute.won', t.payId, { entity: 'disp_1' });
    check('dispute won: back to paid, entitlement still intact', (await payRow(t.order)).status === 'paid' && String((await userRow('u_disp')).premium_expires_at) === String(dispBefore.premium_expires_at), JSON.stringify(r));
    t = await paid('u_disp2', { expiry: inDays(60) });
    await rev('refund.processed', t.payId, { amount: 5000 });
    await rev('payment.dispute.created', t.payId, { entity: 'disp_2' });
    await rev('payment.dispute.won', t.payId, { entity: 'disp_2' });
    check('dispute won on a partially refunded payment -> back to partially_refunded (not paid)', (await payRow(t.order)).status === 'partially_refunded', (await payRow(t.order)).status);
    t = await paid('u_disp3', { expiry: inDays(60) });
    await rev('payment.dispute.created', t.payId, { entity: 'disp_3' });
    r = await rev('payment.dispute.lost', t.payId, { entity: 'disp_3', amount: 24900 });
    u = await userRow('u_disp3'); p = await payRow(t.order);
    check('dispute LOST: status chargeback_lost and exactly the payment\'s 30d removed (~60d remain)', p.status === 'chargeback_lost' && u.premium === true && approx(daysFromNow(u.premium_expires_at), 60, 0.05) && p.entitlement_reversed_days === 30, JSON.stringify([p, u]));

    console.log('\n=== other events, unknown payment, bad currency ===');
    t = await paid('u_misc', { expiry: inDays(60) });
    const miscBefore = await userRow('u_misc');
    for (const evt of ['refund.created', 'refund.failed', 'refund.speed_changed', 'payment.something.else']) {
      r = await rev(evt, t.payId, { entity: 'rfnd_m', amount: 24900 });
      check(`${evt}: recorded, outcome no_change, nothing touched`, r.outcome === 'no_change' && (await payRow(t.order)).status === 'paid' && String((await userRow('u_misc')).premium_expires_at) === String(miscBefore.premium_expires_at), JSON.stringify(r));
    }
    check('...all four are in the ledger', (await evCount(`razorpay_payment_id='${t.payId}' AND outcome='no_change'`)) === 4, '');
    r = await rev('refund.processed', 'pay_does_not_exist', { amount: 100 });
    check('unknown payment id -> unmatched, recorded, nothing else changes', r.outcome === 'unmatched' && (await evCount(`razorpay_payment_id='pay_does_not_exist'`)) === 1, JSON.stringify(r));
    t = await paid('u_cur', { expiry: inDays(60) });
    r = await rev('refund.processed', t.payId, { amount: 24900, currency: 'USD' });
    check('a refund in a different currency than the payment -> rejected, nothing applied', r.outcome === 'rejected' && (await payRow(t.order)).status === 'paid' && (await payRow(t.order)).refunded_amount === 0, JSON.stringify(r));
    r = await rev('refund.processed', t.payId, { entity: '', amount: 100 }).catch(e => ({ err: e.code }));
    check('refund.processed without a refund id raises (22023) and records nothing', r.err === '22023', JSON.stringify(r));
    r = await rev('refund.processed', '', { amount: 100 }).catch(e => ({ err: e.code }));
    check('an empty payment id raises (22023)', r.err === '22023', JSON.stringify(r));

    console.log('\n=== legacy rows (granted_days NULL) and the days fallback ===');
    await mkUser('u_leg', { expiry: inDays(60) }); const oLeg = await mkOrder('u_leg', 'monthly');
    await pool.query(`UPDATE payments SET status='paid', razorpay_payment_id='pay_leg' WHERE id=$1`, [oLeg]);   // as a pre-026 grant left it: granted_days NULL
    r = await rev('refund.processed', 'pay_leg', { amount: 24900 });
    check('granted_days NULL -> falls back to the plan\'s days from the server map (30): ~30d remain', approx(daysFromNow((await userRow('u_leg')).premium_expires_at), 30, 0.05) && (await payRow(oLeg)).entitlement_reversed_days === 30, JSON.stringify(r));
    await mkUser('u_leg2', { expiry: inDays(60) }); const oLeg2 = await mkOrder('u_leg2', 'monthly');
    await pool.query(`UPDATE payments SET status='paid', razorpay_payment_id='pay_leg2' WHERE id=$1`, [oLeg2]);
    r = await rev('refund.processed', 'pay_leg2', { amount: 24900, planDays: '{}' }).catch(e => ({ err: e.code }));
    check('no recorded days AND no plan mapping -> raises (22023) instead of guessing; nothing applied, no ledger row', r.err === '22023' && (await payRow(oLeg2)).status === 'paid' && (await evCount(`razorpay_payment_id='pay_leg2'`)) === 0, JSON.stringify(r));
    t = await paid('u_nopremium', { expiry: inDays(60) });
    await pool.query(`UPDATE users SET premium=false WHERE id='u_nopremium'`);   // e.g. an admin revoke; a future expiry is still stored
    r = await rev('refund.processed', t.payId, { amount: 24900 });
    check('premium already false -> nothing to reverse (expiry not rewritten, nothing marked reversed)', /not_premium_nothing_to_reverse/.test(r.detail) && (await payRow(t.order)).entitlement_reversed_days === 0 && r.user_changed === false, JSON.stringify(r));
    t = await paid('u_lapsed', { expiry: inDays(-5) });         // premium true but expiry already in the past (sweep has not run)
    await pool.query(`UPDATE users SET premium=true, premium_expires_at = now() - interval '2 days' WHERE id='u_lapsed'`);
    // the grant above extended from max(now, expiry); put the expiry back to a value in the past after the fact
    r = await rev('refund.processed', t.payId, { amount: 24900 });
    check('an expiry that is already in the past -> premium false (never left true past its date)', (await userRow('u_lapsed')).premium === false, JSON.stringify(await userRow('u_lapsed')));

    console.log('\n=== failure rolls the WHOLE reversal back, ledger row included ===');
    await mkUser('fail_user', { expiry: inDays(60) }); const oF = await mkOrder('fail_user'); await grant(pool, oF, 'pay_fail');
    const failBefore = await userRow('fail_user'); const failPayBefore = await payRow(oF);
    await pool.query(FAULT_ON);
    r = await rev('refund.processed', 'pay_fail', { event: 'evt_fail_1', amount: 24900 }).catch(e => ({ err: e.code, msg: e.message }));
    check('an injected failure while applying the entitlement raises', r.err === 'P0001', JSON.stringify(r));
    check('...the payment row is untouched (still paid, nothing refunded, nothing reversed)', (await payRow(oF)).status === 'paid' && (await payRow(oF)).refunded_amount === 0 && (await payRow(oF)).entitlement_reversed_days === 0 && String((await payRow(oF)).granted_days) === String(failPayBefore.granted_days), JSON.stringify(await payRow(oF)));
    check('...the user row is untouched', String((await userRow('fail_user')).premium_expires_at) === String(failBefore.premium_expires_at) && (await userRow('fail_user')).premium === true, '');
    check('...and the ledger row was rolled back too, so the retry is not mistaken for a duplicate', (await evCount(`event_id='evt_fail_1'`)) === 0, '');
    await pool.query(FAULT_OFF);
    r = await rev('refund.processed', 'pay_fail', { event: 'evt_fail_1', amount: 24900 });
    check('the SAME event id retried after recovery applies normally', r.outcome === 'applied' && (await payRow(oF)).status === 'refunded' && approx(daysFromNow((await userRow('fail_user')).premium_expires_at), 60, 0.05), JSON.stringify(r));

    console.log('\n=== real concurrency (separate connections) ===');
    t = await paid('u_race', { expiry: inDays(60) });           // ~90d
    let clients = await Promise.all(Array.from({ length: 8 }, async () => { const c = new pg.Client(connCfg); await c.connect(); return c; }));
    let results = await Promise.all(clients.map(c => reverse(c, 'refund.processed', t.payId, { event: 'evt_race', entity: 'rfnd_race', amount: 24900 })));
    check('8 concurrent deliveries of ONE event: exactly one applied, seven already_processed', results.filter(x => x.outcome === 'applied').length === 1 && results.filter(x => x.outcome === 'already_processed').length === 7, JSON.stringify(results.map(x => x.outcome)));
    check('...30 days subtracted exactly once (~60d remain)', approx(daysFromNow((await userRow('u_race')).premium_expires_at), 60, 0.05) && (await payRow(t.order)).entitlement_reversed_days === 30, '');
    t = await paid('u_race2', { expiry: inDays(60) });
    results = await Promise.all(clients.map((c, i) => reverse(c, i % 2 ? 'refund.processed' : 'payment.dispute.lost', t.payId, { event: `evt_race2_${i}`, entity: i % 2 ? 'rfnd_r2' : 'disp_r2', amount: 24900 })));
    check('a refund and a lost dispute racing on one payment (distinct event ids) reverse the entitlement ONCE (~60d remain)', approx(daysFromNow((await userRow('u_race2')).premium_expires_at), 60, 0.05) && (await payRow(t.order)).entitlement_reversed_days === 30, JSON.stringify(await payRow(t.order)));
    // The refund racing the capture it refunds - the interleaving that used to leave a refunded payment
    // with a live grant (each side missed the other). 12 independent pairs, each fired concurrently.
    let raceBad = [];
    for (let i = 0; i < 12; i++) {
      const uid = 'u_rc' + i; await mkUser(uid); const oid = await mkOrder(uid); const pid = 'pay_' + oid;
      const mixed = await Promise.all([
        reverse(clients[0], 'refund.processed', pid, { event: 'evt_rc_a' + i, entity: 'rfnd_rc' + i, amount: 24900 }),
        grant(clients[1], oid, pid),
        reverse(clients[2], 'refund.processed', pid, { event: 'evt_rc_b' + i, entity: 'rfnd_rc' + i, amount: 24900 }),
        grant(clients[3], oid, pid),
      ]);
      const row = await payRow(oid), usr = await userRow(uid);
      if (!(row.status === 'refunded' && usr.premium === false && mixed.filter(x => x.outcome === 'granted').length <= 1)) raceBad.push({ i, outcomes: mixed.map(x => x.outcome), status: row.status, premium: usr.premium });
    }
    check('refund racing capture (12 concurrent pairs): every payment ends refunded with NO net premium, however the interleaving falls', raceBad.length === 0, JSON.stringify(raceBad.slice(0, 2)));
    await Promise.all(clients.map(c => c.end()));

    console.log('\n=== privileges (service role only) ===');
    const priv = async (role, fn) => (await one(`SELECT has_function_privilege($1, $2, 'EXECUTE') AS ok`, [role, fn])).ok;
    const REV = 'process_payment_reversal(text,text,text,text,int,text,text,jsonb,jsonb)', TOT = 'payment_refunded_total(text)', ENT = 'process_payment_entitlement(text,text,text,int)';
    check('anon cannot execute process_payment_reversal', (await priv('anon', REV)) === false, '');
    check('authenticated cannot execute process_payment_reversal', (await priv('authenticated', REV)) === false, '');
    check('service_role can execute process_payment_reversal', (await priv('service_role', REV)) === true, '');
    check('anon / authenticated cannot execute payment_refunded_total; service_role can', (await priv('anon', TOT)) === false && (await priv('authenticated', TOT)) === false && (await priv('service_role', TOT)) === true, '');
    check('process_payment_entitlement kept its migration-022 privileges after being replaced (anon/authenticated no, service_role yes)', (await priv('anon', ENT)) === false && (await priv('authenticated', ENT)) === false && (await priv('service_role', ENT)) === true, '');
  } finally {
    try { await pool.end(); } catch {}
    try { await epg.stop(); } catch {}
    await new Promise(r => setTimeout(r, 500));
    try { fs.rmSync(dbDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch { /* temp only */ }
  }
  console.log(`\n=== RESULTS: ${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
