-- Refund / chargeback reversals: the payment_events ledger, process_payment_reversal(), and the replaced
-- process_payment_entitlement().
-- Spec: docs/payments-refund-chargeback-retention-spec-2026-10-08.md (Part B; decisions D2-D6 locked 2026-10-08).
--
-- DEPLOY ORDER: 026 -> 027 -> application code. This migration is a separate schema change from the
-- retention protection in 026 but follows it in the same release; apply BOTH before deploying the server
-- code, and never deploy the refund/dispute code against a database that has only 026. It is idempotent
-- (safe to re-run) and additive: no column or row is removed.
--
-- payments.status is free text. Existing values: created | paid. New, written only by the reversal
-- path: partially_refunded | refunded | disputed | chargeback_lost.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refunded_amount            integer     NOT NULL DEFAULT 0;
-- Days this payment actually added to premium_expires_at, recorded at grant time so a reversal
-- subtracts exactly that (NULL on rows granted before this migration: the reversal then falls back
-- to the plan's days, supplied by the server from PLANS).
ALTER TABLE payments ADD COLUMN IF NOT EXISTS granted_days               integer;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS entitlement_reversed_days  integer     NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS reversed_at                timestamptz;
CREATE INDEX IF NOT EXISTS payments_razorpay_payment_id_idx ON payments(razorpay_payment_id);

-- Append-only ledger of refund / dispute webhook events. event_id is Razorpay's
-- x-razorpay-event-id (unique per event) and is the idempotency key: a redelivered event is a no-op.
-- razorpay_payment_id deliberately has NO foreign key: an event can arrive before our own capture
-- processing has stored the payment id, and process_payment_entitlement() then consults this table.
-- Retention follows the payments table (7-year published period; the expiry job is a defined
-- follow-up, see the spec) - nothing here is deleted by the application.
CREATE TABLE IF NOT EXISTS payment_events (
  event_id            text        PRIMARY KEY,
  event_type          text        NOT NULL,
  razorpay_payment_id text        NOT NULL,
  entity_id           text,       -- the refund id or dispute id
  amount              integer,
  currency            text,
  entity_status       text,
  payment_row_id      text,       -- payments.id once matched
  outcome             text        NOT NULL,   -- applied | no_change | unmatched | rejected
  detail              text,
  payload             jsonb,      -- the Razorpay refund/dispute entity only
  received_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_events_payment_idx ON payment_events(razorpay_payment_id, event_type);
ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;

-- Total refunded for one Razorpay payment from processed refunds, each refund id counted once
-- (a redelivery of the same refund under a new event id must not double-count).
CREATE OR REPLACE FUNCTION payment_refunded_total(p_payment_id text) RETURNS integer
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(sum(amount), 0)::int FROM (
    SELECT DISTINCT ON (entity_id) amount
      FROM payment_events
     WHERE razorpay_payment_id = p_payment_id AND event_type = 'refund.processed' AND entity_id IS NOT NULL
     ORDER BY entity_id, received_at
  ) t
$$;

-- Records one refund / dispute event and applies it, atomically.
--   refund.processed   cumulative refunded >= paid amount -> status 'refunded' + entitlement reversal;
--                      less than the paid amount        -> 'partially_refunded', RECORD ONLY (D3)
--   payment.dispute.lost    -> status 'chargeback_lost' + entitlement reversal (D4)
--   payment.dispute.created -> status 'disputed', NO entitlement change (D4)
--   payment.dispute.won     -> back to 'paid' / 'partially_refunded' if it was 'disputed'
--   anything else (refund.created / .failed / .speed_changed, dispute.closed / under_review /
--   action_required, ...) -> recorded, no change
--
-- ENTITLEMENT REVERSAL (D2) subtracts exactly the days this payment contributed:
--   * premium_expires_at IS NULL (perpetual / admin grant)  -> untouched, always
--   * deleted account                                       -> untouched (D5: record only)
--   * premium already false                                 -> nothing to reverse
--   * otherwise new expiry = expiry - days; if that is not in the future premium becomes false,
--     else premium stays true with the earlier expiry. Never a blanket premium=false, so days
--     supplied by another payment or a referral reward survive.
--   It happens at most once per payment (entitlement_reversed_days), so refund-then-chargeback
--   cannot subtract twice.
--
-- Atomic + idempotent, same discipline as process_payment_entitlement(): the ledger insert is the
-- idempotency gate (PK conflict -> 'already_processed'), the payments row is locked FOR UPDATE and
-- then the users row (always payments -> users, so no deadlock with the entitlement function), and
-- any failure rolls back the ledger row too so Razorpay's retry can apply it cleanly.
--
-- RETURNS jsonb {outcome: applied|no_change|unmatched|rejected|already_processed, user_id, detail,
-- user_changed, payment_status}. 'unmatched' = no payments row carries this Razorpay payment id: the
-- capture may simply not be processed yet (process_payment_entitlement() will then honour the
-- recorded refund / lost dispute and grant nothing), or the id is unknown.
CREATE OR REPLACE FUNCTION process_payment_reversal(
  p_event_id      text,
  p_event_type    text,
  p_payment_id    text,
  p_entity_id     text,
  p_amount        int,
  p_currency      text,
  p_entity_status text,
  p_payload       jsonb,
  p_plan_days     jsonb
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_n        int;
  v_pay      payments%ROWTYPE;
  v_total    int;
  v_reverse  boolean := false;
  v_outcome  text := 'no_change';
  v_detail   text := NULL;
  v_changed  boolean := false;
  v_status   text;
  v_premium  boolean;
  v_expiry   timestamptz;
  v_deleted  timestamptz;
  v_found    boolean;
  v_days     int;
  v_new      timestamptz;
BEGIN
  IF COALESCE(p_event_id, '') = '' OR COALESCE(p_event_type, '') = '' OR COALESCE(p_payment_id, '') = '' THEN
    RAISE EXCEPTION 'process_payment_reversal: event id, event type and payment id are required' USING ERRCODE = '22023';
  END IF;
  IF p_event_type = 'refund.processed' AND (COALESCE(p_entity_id, '') = '' OR p_amount IS NULL OR p_amount < 0) THEN
    RAISE EXCEPTION 'process_payment_reversal: refund.processed needs a refund id and a non-negative amount' USING ERRCODE = '22023';
  END IF;

  -- Serialize with process_payment_entitlement() on the Razorpay payment id BEFORE touching anything: a
  -- refund racing the capture it refunds could otherwise each miss the other (the refund finds no payments
  -- row yet; the grant finds no ledger row yet), leaving a refunded payment with a live grant. Always the first
  -- lock taken (advisory -> payments -> users), so it cannot deadlock with any other path.
  PERFORM pg_advisory_xact_lock(hashtextextended('byn_payment:' || p_payment_id, 0));

  -- Idempotency gate: the first delivery of an event id wins; any redelivery stops here.
  INSERT INTO payment_events (event_id, event_type, razorpay_payment_id, entity_id, amount, currency, entity_status, outcome, payload)
  VALUES (p_event_id, p_event_type, p_payment_id, p_entity_id, p_amount, p_currency, p_entity_status, 'pending', p_payload)
  ON CONFLICT (event_id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RETURN jsonb_build_object('outcome', 'already_processed');
  END IF;

  SELECT * INTO v_pay FROM payments WHERE razorpay_payment_id = p_payment_id ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    UPDATE payment_events SET outcome = 'unmatched',
           detail = 'no payments row carries this razorpay payment id (capture not processed yet, or unknown)'
     WHERE event_id = p_event_id;
    RETURN jsonb_build_object('outcome', 'unmatched');
  END IF;
  UPDATE payment_events SET payment_row_id = v_pay.id WHERE event_id = p_event_id;
  v_status := v_pay.status;

  -- A refund / dispute in a different currency than the payment is not ours to interpret.
  IF p_event_type IN ('refund.processed', 'payment.dispute.lost')
     AND p_currency IS NOT NULL AND upper(p_currency) IS DISTINCT FROM upper(v_pay.currency) THEN
    UPDATE payment_events SET outcome = 'rejected', detail = 'currency does not match the payment' WHERE event_id = p_event_id;
    RETURN jsonb_build_object('outcome', 'rejected', 'user_id', v_pay.user_id, 'detail', 'currency does not match the payment');
  END IF;

  IF p_event_type = 'refund.processed' THEN
    v_total := payment_refunded_total(p_payment_id);   -- includes the row inserted above
    UPDATE payments SET refunded_amount = v_total WHERE id = v_pay.id;
    IF v_total >= v_pay.amount THEN
      IF v_status NOT IN ('refunded', 'chargeback_lost') THEN v_status := 'refunded'; END IF;
      v_reverse := true;
      v_detail := 'full_refund';
    ELSE
      IF v_status = 'paid' THEN v_status := 'partially_refunded'; END IF;
      v_detail := 'partial_refund_recorded';
    END IF;
    v_outcome := 'applied';

  ELSIF p_event_type = 'payment.dispute.lost' THEN
    IF v_status NOT IN ('refunded', 'chargeback_lost') THEN v_status := 'chargeback_lost'; END IF;
    v_reverse := true;
    v_detail := 'dispute_lost';
    v_outcome := 'applied';

  ELSIF p_event_type = 'payment.dispute.created' THEN
    IF v_status IN ('paid', 'partially_refunded') THEN v_status := 'disputed'; END IF;
    v_detail := 'dispute_opened_no_entitlement_change';
    v_outcome := 'applied';

  ELSIF p_event_type = 'payment.dispute.won' THEN
    IF v_status = 'disputed' THEN
      v_status := CASE WHEN v_pay.refunded_amount > 0 THEN 'partially_refunded' ELSE 'paid' END;
    END IF;
    v_detail := 'dispute_won';
    v_outcome := 'applied';
  END IF;

  IF v_status IS DISTINCT FROM v_pay.status THEN
    UPDATE payments SET status = v_status WHERE id = v_pay.id;
  END IF;

  IF v_reverse THEN
    IF v_pay.entitlement_reversed_days > 0 THEN
      v_detail := v_detail || ';entitlement_already_reversed';
    ELSE
      SELECT premium, premium_expires_at, deleted_at, true
        INTO v_premium, v_expiry, v_deleted, v_found
        FROM users WHERE id = v_pay.user_id FOR UPDATE;
      IF v_found IS NOT TRUE THEN
        v_detail := v_detail || ';user_missing_entitlement_untouched';
      ELSIF v_deleted IS NOT NULL THEN
        v_detail := v_detail || ';deleted_account_entitlement_untouched';
      ELSIF v_expiry IS NULL THEN
        v_detail := v_detail || ';perpetual_entitlement_untouched';
      ELSIF v_premium IS NOT TRUE THEN
        v_detail := v_detail || ';not_premium_nothing_to_reverse';
      ELSE
        v_days := COALESCE(v_pay.granted_days, (p_plan_days ->> v_pay.plan)::int);
        IF v_days IS NULL OR v_days <= 0 THEN
          RAISE EXCEPTION 'process_payment_reversal: cannot determine the days payment % contributed (plan %)', v_pay.id, v_pay.plan
            USING ERRCODE = '22023';
        END IF;
        v_new := v_expiry - make_interval(days => v_days);
        -- clock_timestamp(), not now(): now() is this transaction's START time, and a reversal that began waiting on
        -- the advisory lock before a concurrent grant committed would compare against a moment earlier than the grant
        -- itself and leave premium true on an expiry a few milliseconds away.
        IF v_new <= clock_timestamp() THEN
          UPDATE users SET premium = false WHERE id = v_pay.user_id;
        ELSE
          UPDATE users SET premium_expires_at = v_new WHERE id = v_pay.user_id;
        END IF;
        UPDATE payments SET entitlement_reversed_days = v_days, reversed_at = now() WHERE id = v_pay.id;
        v_changed := true;
        v_detail := v_detail || ';reversed_' || v_days || '_days';
      END IF;
    END IF;
  END IF;

  UPDATE payment_events SET outcome = v_outcome, detail = v_detail WHERE event_id = p_event_id;
  RETURN jsonb_build_object('outcome', v_outcome, 'user_id', v_pay.user_id, 'detail', v_detail,
                            'user_changed', v_changed, 'payment_status', v_status);
END;
$$;

-- Same defense in depth as process_payment_entitlement (migration 022): service role only.
REVOKE ALL ON FUNCTION process_payment_reversal(text, text, text, text, int, text, text, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION payment_refunded_total(text) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION process_payment_reversal(text, text, text, text, int, text, text, jsonb, jsonb) FROM anon;
    REVOKE ALL ON FUNCTION payment_refunded_total(text) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION process_payment_reversal(text, text, text, text, int, text, text, jsonb, jsonb) FROM authenticated;
    REVOKE ALL ON FUNCTION payment_refunded_total(text) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION process_payment_reversal(text, text, text, text, int, text, text, jsonb, jsonb) TO service_role;
    GRANT EXECUTE ON FUNCTION payment_refunded_total(text) TO service_role;
  END IF;
END
$$;

-- --- process_payment_entitlement(): same grant semantics, three additions --------------------
-- Replaces the migration-022 function in place (same signature, privileges are preserved):
--   1. "already processed" is now ANY status other than 'created' (it was status = 'paid'). Once a
--      payment can become refunded / disputed / chargeback_lost, a replayed capture / verify for it
--      must not be able to grant a second time.
--   2. Out-of-order delivery (Razorpay documents it): if a full refund or a lost dispute for this
--      Razorpay payment id was ALREADY recorded in payment_events before our capture processing ran,
--      the payment is marked refunded / chargeback_lost and NOTHING is granted
--      (outcome 'already_reversed'). A partial refund recorded early is carried onto the row.
--   3. granted_days records what this payment added, so a later reversal subtracts exactly that.
-- Everything else - locking order, the stored-plan check (A4), extend-from-max(now, expiry),
-- premium / premium_plan / premium_since - is byte-for-byte the migration-022 behavior.
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
  v_refunded       int;
  v_lost           boolean;
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

  -- Same advisory lock as process_payment_reversal(): see the note there (refund racing capture).
  PERFORM pg_advisory_xact_lock(hashtextextended('byn_payment:' || p_payment_id, 0));

  SELECT * INTO v_pay FROM payments WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;

  IF v_pay.status <> 'created' THEN
    RETURN jsonb_build_object('outcome', 'already_processed', 'user_id', v_pay.user_id);
  END IF;

  IF v_pay.plan IS DISTINCT FROM p_plan THEN
    RAISE EXCEPTION 'process_payment_entitlement: plan % does not match stored order plan %', p_plan, v_pay.plan
      USING ERRCODE = '22023';
  END IF;

  -- (2) a refund / lost dispute that beat this capture is honoured: no grant.
  v_refunded := payment_refunded_total(p_payment_id);
  SELECT EXISTS (SELECT 1 FROM payment_events
                  WHERE razorpay_payment_id = p_payment_id AND event_type = 'payment.dispute.lost')
    INTO v_lost;
  IF v_lost OR (v_pay.amount > 0 AND v_refunded >= v_pay.amount) THEN
    UPDATE payments
       SET status = CASE WHEN v_lost THEN 'chargeback_lost' ELSE 'refunded' END,
           razorpay_payment_id = p_payment_id,
           refunded_amount = v_refunded,
           reversed_at = now()
     WHERE id = v_pay.id;
    UPDATE payment_events SET payment_row_id = v_pay.id
     WHERE razorpay_payment_id = p_payment_id AND payment_row_id IS NULL;
    RETURN jsonb_build_object('outcome', 'already_reversed', 'user_id', v_pay.user_id);
  END IF;

  UPDATE payments
     SET status = CASE WHEN v_refunded > 0 THEN 'partially_refunded' ELSE 'paid' END,
         razorpay_payment_id = p_payment_id,
         refunded_amount = v_refunded,
         granted_days = p_days
   WHERE id = v_pay.id;
  IF v_refunded > 0 THEN
    UPDATE payment_events SET payment_row_id = v_pay.id
     WHERE razorpay_payment_id = p_payment_id AND payment_row_id IS NULL;
  END IF;

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
