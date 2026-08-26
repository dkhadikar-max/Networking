-- Tracks whether an account has a real, user-chosen password vs. the
-- random, never-disclosed placeholder hash /api/auth/magic-link/request
-- generates for a brand-new email (see migrations/016_passwordless_auth.sql
-- and docs/passwordless-auth-2026-08-25.md). Magic link is scoped to
-- signup only — after first verifying via the link, a new account must set
-- a real password before continuing; all logins after that use the
-- password (OTP fallback unaffected). DEFAULT true means every existing
-- account (all of which already have a real password) needs no backfill.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_set boolean DEFAULT true;
