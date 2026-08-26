-- Passwordless magic-link authentication — second auth method alongside the
-- existing password + OTP flow (untouched). Mirrors the shape of
-- migrations/015_otp_rate_limiting.sql (per-account cooldown/hour/day) but
-- for magic-link tokens specifically, which need their own storage (a hash,
-- an expiry, a used-at marker) distinct from the OTP's 6-digit code.
--
-- magic_link_token_hash is intentionally NOT cleared on successful use —
-- only magic_link_used_at is set. Keeping the hash lets a reused/expired
-- token be looked up to report the correct reason ("already used" vs
-- "expired" vs "invalid") instead of both collapsing into "invalid" once
-- the hash is gone. It's harmless to retain: magic_link_used_at being set
-- permanently blocks that token regardless of whether the hash is present.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS magic_link_token_hash        text,
  ADD COLUMN IF NOT EXISTS magic_link_expires_at         timestamptz,
  ADD COLUMN IF NOT EXISTS magic_link_used_at            timestamptz,
  ADD COLUMN IF NOT EXISTS magic_link_last_sent_at       timestamptz,
  ADD COLUMN IF NOT EXISTS magic_link_hour_count         int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS magic_link_hour_window_start  timestamptz,
  ADD COLUMN IF NOT EXISTS magic_link_day_count          int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS magic_link_day_window_start   timestamptz;

-- Unique (partial — only while a token is actually outstanding) so the
-- verify lookup is O(1) via index, and as free defense-in-depth against two
-- different accounts ever colliding on the same hash (astronomically
-- unlikely with a 256-bit random token, but free to guarantee at the DB
-- level rather than assume).
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_magic_link_token_hash
  ON users (magic_link_token_hash) WHERE magic_link_token_hash IS NOT NULL;
