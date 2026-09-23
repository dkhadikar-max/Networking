-- Closes audit finding A21 — three independent check-then-act races, none of them backed by
-- anything at the database level:
--
--   A21a  CONNECT. Two mutual matches racing (both sides swipe/connect right on each other within
--         the same narrow window) can each pass "does the other side already have a matching swipe"
--         before either has inserted its own connection row — connections has no unique constraint
--         at all, so BOTH inserts succeed: two connection rows for the same pair, two "You matched!"
--         notifications, a split thread. server.js already has 23505-recovery code for this (in both
--         POST /api/swipe's and POST /api/connect's match branches) — written assuming a constraint
--         that was never added to the schema, so it has never been reachable.
--   A21b  PRIORITY MESSAGE. POST /api/priority-message read this month's message count, read whether
--         one was already sent to this recipient, and only THEN inserted — three separate REST calls
--         with nothing serializing them. A burst of concurrent requests can each read the same
--         under-the-limit count before any of them commits, exceeding the monthly cap (3 free / 20
--         premium), and/or send two priority messages to the same recipient in the same month.
--   A21c  DUPLICATE REPORTS. POST /api/report's "have I already reported this person" check is the
--         same shape: concurrent identical reports can each pass the dedupe SELECT before either
--         commits, each insert its own row, and each apply its own -10 trust-score penalty to the
--         target — unboundedly, from a single reporter racing their own request.
--
-- THE FIX, one object per defect:
--   A21a  A unique index on connections normalizing (user1,user2) and (user2,user1) to the same key
--         (LEAST/GREATEST), so a second concurrent insert for the same pair — in EITHER order —
--         hits 23505 and the existing recovery code (already correct, already deployed) takes over.
--   A21b  process_priority_message(): one PL/pgSQL function doing the quota check, the
--         duplicate-recipient check and the insert inside a single transaction, exactly like
--         migrations/022's process_payment_entitlement. There is no natural row to SELECT ... FOR
--         UPDATE on (a first-time sender has zero priority_msgs rows this month, so there is nothing
--         to lock), so the serialization point is a transaction-scoped advisory lock keyed on
--         (sender, month) instead — pg_advisory_xact_lock releases automatically at COMMIT or
--         ROLLBACK, so a raised exception can never leave it held.
--   A21c  A PARTIAL unique index on reports(from_user, target_id) — partial, not a plain UNIQUE,
--         because reports also holds DSA illegal-content reports (type='illegal_content', added by
--         migration 023) which are a deliberately SEPARATE channel: the same reporter must still be
--         able to file one ordinary report AND one illegal-content report against the same target.
--         The index only applies to ordinary reports (type IS NULL OR type <> 'illegal_content'),
--         mirroring the exact condition POST /api/report's own dedupe query already uses.
--
-- DEPLOY ORDER: apply this migration BEFORE deploying the server code that depends on it (same
-- posture as migrations/022). Until then: A21a's constraint being absent is today's existing (racy)
-- behavior, unchanged by an early deploy; A21b's server code calls process_priority_message and fails
-- closed (503, nothing sent) if the function does not exist yet; A21c's constraint being absent is
-- likewise today's existing behavior. Nothing here is destructive - no column dropped, retyped or
-- backfilled, no existing row modified. Re-running this file is safe (IF NOT EXISTS / OR REPLACE
-- throughout).

-- -- A21a — connections: one row per pair, regardless of which side "wins" the match race ---------
CREATE UNIQUE INDEX IF NOT EXISTS connections_pair_uidx
  ON connections (LEAST(user1, user2), GREATEST(user1, user2));

-- -- A21c — reports: one ORDINARY report per (reporter, target); illegal-content stays a separate
-- channel (see the identical condition in POST /api/report's existing dedupe query) --------------
CREATE UNIQUE INDEX IF NOT EXISTS reports_ordinary_dedup_uidx
  ON reports (from_user, target_id)
  WHERE type IS NULL OR type <> 'illegal_content';

-- -- A21b — priority messages: atomic quota + duplicate-recipient check + insert -------------------
CREATE OR REPLACE FUNCTION process_priority_message(
  p_from_user text,
  p_to_user   text,
  p_text      text,
  p_month     text,
  p_limit     int
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_count int;
  v_id    text;
BEGIN
  IF p_from_user IS NULL OR p_from_user = '' THEN
    RAISE EXCEPTION 'process_priority_message: from_user required' USING ERRCODE = '22023';
  END IF;
  IF p_to_user IS NULL OR p_to_user = '' THEN
    RAISE EXCEPTION 'process_priority_message: to_user required' USING ERRCODE = '22023';
  END IF;
  IF p_month IS NULL OR p_month = '' THEN
    RAISE EXCEPTION 'process_priority_message: month required' USING ERRCODE = '22023';
  END IF;
  IF p_limit IS NULL OR p_limit <= 0 THEN
    RAISE EXCEPTION 'process_priority_message: limit must be positive' USING ERRCODE = '22023';
  END IF;

  -- Serialization point: every concurrent call for THIS sender and THIS month queues on the same
  -- advisory lock (other senders, and the same sender in a different month, are never blocked by
  -- this). Transaction-scoped: released automatically at COMMIT or ROLLBACK, including if one of the
  -- RAISEs above already returned before reaching here — never needs an explicit unlock.
  PERFORM pg_advisory_xact_lock(hashtext(p_from_user || ':' || p_month)::bigint);

  -- Re-read AFTER acquiring the lock: any concurrent sender that got here first has already
  -- committed its insert by the time we're unblocked, so this count is never stale.
  SELECT count(*) INTO v_count FROM priority_msgs WHERE from_user = p_from_user AND month = p_month;
  IF v_count >= p_limit THEN
    RETURN jsonb_build_object('outcome', 'limit_reached', 'count', v_count);
  END IF;

  IF EXISTS (
    SELECT 1 FROM priority_msgs WHERE from_user = p_from_user AND to_user = p_to_user AND month = p_month
  ) THEN
    RETURN jsonb_build_object('outcome', 'duplicate_recipient');
  END IF;

  v_id := gen_random_uuid()::text;
  INSERT INTO priority_msgs (id, from_user, to_user, text, month, read, created_at)
  VALUES (v_id, p_from_user, p_to_user, p_text, p_month, false, now());

  RETURN jsonb_build_object('outcome', 'sent', 'id', v_id, 'remaining', p_limit - v_count - 1);
END;
$$;

-- Same defense-in-depth posture as migrations/022's money function: only the backend's service role
-- may call it through the REST API. Guarded so this stays a no-op on a bare Postgres without
-- Supabase's roles (local/scratch databases, this repo's own test harnesses).
REVOKE ALL ON FUNCTION process_priority_message(text, text, text, text, int) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION process_priority_message(text, text, text, text, int) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION process_priority_message(text, text, text, text, int) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION process_priority_message(text, text, text, text, int) TO service_role;
  END IF;
END
$$;

-- Make PostgREST notice the new function/indexes immediately instead of on its next periodic
-- schema-cache refresh.
NOTIFY pgrst, 'reload schema';
