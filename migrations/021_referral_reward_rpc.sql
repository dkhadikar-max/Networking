-- Referral reward atomicity — closes a real gap found in the final
-- pre-commit security review (2026-09-04): maybeGrantReferralReward()
-- previously did the referral_rewards INSERT and the premium UPDATE as two
-- separate Supabase calls. A unique constraint prevents a DOUBLE claim, but
-- it does not make the two writes transactional — if the INSERT succeeded
-- and the UPDATE then threw (network blip, transient Supabase error), the
-- referrer's one-time reward was permanently burned with no Premium ever
-- granted. The reverse ordering isn't safe either: granting Premium before
-- the claim would reopen the double-grant race the unique constraint exists
-- to prevent.
--
-- A single PL/pgSQL function body is one implicit transaction — the INSERT
-- and UPDATE below either both commit or both roll back together. This is
-- the only way to get true atomicity across two tables through Supabase's
-- REST client, which cannot itself span a client-side multi-statement
-- transaction.
--
-- Also closes a related, smaller gap in the same review: the referrer could
-- have been deleted/banned between accumulating 9 verified referrals and
-- the 10th verifying, in which case the old code would still insert the
-- claim and then silently no-op the UPDATE (0 rows matched) — same
-- permanently-burned-claim outcome. The existence/eligibility check below
-- runs inside the same transaction as the claim, closing that race too
-- (not just a caller-side check beforehand, which would leave its own
-- window).
--
-- referrer_id stays `text`, matching referral_rewards.referrer_id and
-- users.referred_by's existing convention (no formal FK — see
-- migrations/006 and 020's own comments).
CREATE OR REPLACE FUNCTION grant_referral_reward(
  p_referrer_id text,
  p_qualifying_count int,
  p_days int
) RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_expiry timestamptz;
  v_base timestamptz;
BEGIN
  -- Referrer must still be a real, active account to receive the reward.
  IF NOT EXISTS (
    SELECT 1 FROM users
    WHERE id = p_referrer_id AND deleted_at IS NULL AND banned = false
  ) THEN
    RETURN false;
  END IF;

  -- Atomic one-time claim — ON CONFLICT DO NOTHING is the same gate the
  -- unique constraint already provided, just evaluated inside this
  -- transaction instead of surfacing as a 23505 for the caller to catch.
  INSERT INTO referral_rewards (referrer_id, qualifying_count)
  VALUES (p_referrer_id, p_qualifying_count)
  ON CONFLICT (referrer_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN false; -- already claimed by a concurrent call
  END IF;

  -- Extend-from-max(now, current_expiry) — identical semantics to
  -- grantOrExtendPremium() in server.js (the paid-purchase path), so
  -- referral and paid entitlements stack consistently regardless of which
  -- fires first. Kept as its own copy here rather than calling back into
  -- JS, since the whole point is for this to run inside the one
  -- transaction below the claim, not as a second round-trip.
  SELECT premium_expires_at INTO v_current_expiry FROM users WHERE id = p_referrer_id;
  v_base := GREATEST(COALESCE(v_current_expiry, now()), now());

  UPDATE users
  SET premium = true, premium_expires_at = v_base + make_interval(days => p_days)
  WHERE id = p_referrer_id;

  RETURN true;
END;
$$;
