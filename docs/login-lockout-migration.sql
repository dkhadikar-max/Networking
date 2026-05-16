-- ============================================================
-- BYN — Login brute-force lockout columns
-- Safe to run: ADD COLUMN IF NOT EXISTS is idempotent
-- ============================================================
--
-- What this adds
-- --------------
-- failed_login_attempts: counts consecutive wrong-password attempts
--   for this account (across all IPs). Resets to 0 on successful
--   login or password reset.
-- lockout_until: when set and in the future, the account rejects
--   all login attempts until this timestamp passes.
--
-- These work alongside the existing IP-level authLimiter
-- (50 req / 15 min). Per-account lockout kicks in after 10
-- consecutive wrong-password attempts regardless of source IP.
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS failed_login_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lockout_until timestamptz DEFAULT NULL;

-- Fast lookup when checking active lockouts
CREATE INDEX IF NOT EXISTS users_lockout_until_idx ON users(lockout_until)
  WHERE lockout_until IS NOT NULL;


-- ── ROLLBACK ────────────────────────────────────────────────
-- ALTER TABLE users DROP COLUMN IF EXISTS failed_login_attempts;
-- ALTER TABLE users DROP COLUMN IF EXISTS lockout_until;
-- DROP INDEX IF EXISTS users_lockout_until_idx;
-- ============================================================
