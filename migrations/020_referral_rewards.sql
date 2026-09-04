-- Premium entitlement fix — referral reward atomicity, per the locked spec
-- (2026-09-04 conversation: "Premium entitlement specification", locked
-- decisions table). The referral milestone is one-time-ever per referrer
-- (10 verified referrals -> 1 month Premium, never repeated at 20/30/...),
-- and must be race-proof against concurrent verification events landing at
-- the threshold simultaneously.
--
-- Row existence IS the atomic gate: the grant path does an insert-if-not-
-- exists here and only proceeds to extend premium on a successful insert.
-- A unique-violation (23505) on a duplicate insert means someone/something
-- already claimed the reward for this referrer — safe no-op, not an error.
--
-- referrer_id is `text`, matching users.referred_by's existing convention
-- (migrations/006_auth_and_onboarding_columns.sql — deliberately text, not
-- a formal FK to users.id). No FK constraint here either, for the same
-- reason: consistency with how referred_by already stores the value.
CREATE TABLE IF NOT EXISTS referral_rewards (
  referrer_id      text PRIMARY KEY,
  granted_at       timestamptz NOT NULL DEFAULT now(),
  qualifying_count int NOT NULL
);
