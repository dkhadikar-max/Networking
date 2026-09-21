-- Atomic, idempotent payment entitlement - closes audit finding A5.
--
-- THE DEFECT. /api/payments/verify and /api/payments/webhook each processed a
-- paid payment as three separate Supabase REST calls with no lock or atomic
-- claim between them:
--     1. SELECT the payment (status is not 'paid' yet)
--     2. read users.premium_expires_at, then write premium_expires_at
--     3. UPDATE payments SET status = 'paid'
-- Concurrent verify + webhook (Razorpay fires the webhook within seconds of
-- the client's own verify call), two verifies (client retry), or a webhook
-- redelivery could all pass step 1 before any of them reached step 3 - each
-- then granted, and the payment could be paid out several times over.
-- Separately, step 2's write error was never checked, so a failed premium
-- write was followed by step 3 anyway: payment marked 'paid', entitlement
-- never applied, and the "already paid" state then blocked every retry -
-- a permanently lost entitlement.
--
-- THE FIX. One PL/pgSQL function = one implicit transaction (the same
-- mechanism as migration 021's grant_referral_reward):
--   * SELECT ... FOR UPDATE on the payments row is the serialization point.
--     A concurrent call for the same order BLOCKS on that row lock until the
--     first transaction commits or rolls back, then re-reads the row and sees
--     status = 'paid' -> returns 'already_processed' and grants nothing.
--     Exactly one caller can ever reach the grant.
--   * The users row is also locked (FOR UPDATE) before its expiry is read, so
--     two DIFFERENT paid orders for the same user (or a referral grant) can
--     never lose one another's days to a read-then-write race. Lock order is
--     always payments -> users; no other code path locks them in the reverse
--     order, so this cannot deadlock.
--   * The premium write and the 'paid' marker commit or roll back TOGETHER.
--     If anything fails after the payment row was touched (premium write,
--     missing user row, a trigger, a crash), the whole transaction rolls back:
--     the payment is still 'created', no entitlement was given, and the next
--     verify/webhook retry can process it normally. A payment can therefore
--     never be "paid without entitlement", nor "entitled but unpaid".
--
-- SOURCE OF TRUTH (audit finding A4, preserved). The caller passes the plan it
-- read from the stored payment row and the days for that plan; the function
-- re-checks that p_plan matches the STORED plan inside the transaction and
-- refuses otherwise. The grantee is always payments.user_id - the caller
-- cannot redirect the grant to a different user. A client-supplied plan never
-- reaches this function.
--
-- SEMANTICS carried over unchanged from grantOrExtendPremium() in server.js:
-- extend from max(now, current expiry) by p_days; set premium = true,
-- premium_plan = the order's plan, premium_since = now.
--
-- RETURNS jsonb:
--   {"outcome":"granted","user_id":...,"plan":...,"expires_at":...}
--   {"outcome":"already_processed","user_id":...}   -- order already paid: no-op
--   {"outcome":"not_found"}                          -- no such order: no-op
-- Anything else raises (and rolls back), which supabase-js surfaces as an
-- error to the caller - the server answers 5xx so Razorpay retries the webhook.
--
-- DEPLOY ORDER: apply this migration BEFORE deploying the server code that
-- calls it. The server fails closed (5xx, nothing granted) if the function is
-- missing; Razorpay keeps retrying webhooks, so nothing is lost, but customers
-- would see a failed verification until it is applied.
CREATE OR REPLACE FUNCTION process_payment_entitlement(
  p_order_id   text,
  p_payment_id text,
  p_plan       text,
  p_days       int
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_pay            payments%ROWTYPE;
  v_current_expiry timestamptz;
  v_expires        timestamptz;
BEGIN
  IF p_order_id IS NULL OR p_order_id = '' THEN
    RAISE EXCEPTION 'process_payment_entitlement: order id required' USING ERRCODE = '22023';
  END IF;
  IF p_payment_id IS NULL OR p_payment_id = '' THEN
    RAISE EXCEPTION 'process_payment_entitlement: payment id required' USING ERRCODE = '22023';
  END IF;
  IF p_days IS NULL OR p_days <= 0 THEN
    RAISE EXCEPTION 'process_payment_entitlement: days must be positive' USING ERRCODE = '22023';
  END IF;

  -- Serialization point: only one transaction at a time can hold this row.
  SELECT * INTO v_pay FROM payments WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;

  -- Re-read AFTER acquiring the lock: a concurrent winner has already committed
  -- 'paid' by the time we get here, so the loser sees it and does nothing.
  IF v_pay.status = 'paid' THEN
    RETURN jsonb_build_object('outcome', 'already_processed', 'user_id', v_pay.user_id);
  END IF;

  -- A4: the stored plan is authoritative; the caller must agree with it.
  IF v_pay.plan IS DISTINCT FROM p_plan THEN
    RAISE EXCEPTION 'process_payment_entitlement: plan % does not match stored order plan %', p_plan, v_pay.plan
      USING ERRCODE = '22023';
  END IF;

  -- Mark paid FIRST inside the transaction, so that if the premium write below
  -- fails the ROLLBACK also undoes this - the payment is never left paid
  -- without its entitlement.
  UPDATE payments
     SET status = 'paid', razorpay_payment_id = p_payment_id
   WHERE id = v_pay.id;

  SELECT premium_expires_at INTO v_current_expiry FROM users WHERE id = v_pay.user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'process_payment_entitlement: user % not found for order %', v_pay.user_id, v_pay.id
      USING ERRCODE = 'P0002';
  END IF;

  v_expires := GREATEST(COALESCE(v_current_expiry, now()), now()) + make_interval(days => p_days);

  UPDATE users
     SET premium            = true,
         premium_expires_at = v_expires,
         premium_plan       = v_pay.plan,
         premium_since      = now()
   WHERE id = v_pay.user_id;

  RETURN jsonb_build_object(
    'outcome',    'granted',
    'user_id',    v_pay.user_id,
    'plan',       v_pay.plan,
    'expires_at', v_expires
  );
END;
$$;

-- Defense in depth for a money function: only the backend's service role may
-- call it through the REST API. EXECUTE is granted to PUBLIC by default in
-- Postgres (and Supabase may add explicit grants to anon/authenticated), so
-- all three are revoked. The role-specific parts are guarded so this stays a
-- no-op on a bare Postgres without Supabase's roles (local/scratch databases).
REVOKE ALL ON FUNCTION process_payment_entitlement(text, text, text, int) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION process_payment_entitlement(text, text, text, int) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION process_payment_entitlement(text, text, text, int) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION process_payment_entitlement(text, text, text, int) TO service_role;
  END IF;
END
$$;
