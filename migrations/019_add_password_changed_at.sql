-- Restores the missing backing column for a security check that already
-- exists in application code but has been silently inert since it has no
-- column to read: auth() and adminAuth() (server.js) both check
-- `password_changed_at` to invalidate any JWT issued before it, so a stolen
-- token stops working once the legitimate user changes their password. That
-- code predates this migration; the column it depends on was never created.
--
-- Surfaced while fixing /api/auth/reset-password, which also writes this
-- field on a successful reset -- previously that write would have failed
-- the entire UPDATE statement (PGRST204: unknown column), silently
-- discarding the new password along with it.
--
-- Purely additive: NULL for every existing row (nobody's had a reset yet
-- with a working reset flow), same "no rows affected by default" shape as
-- migration 018.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;
