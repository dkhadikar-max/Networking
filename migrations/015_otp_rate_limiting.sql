-- Email-verification abuse protection: per-account OTP send cooldown/rate
-- limiting + persisted Resend suppression state.
--
-- Root cause being fixed (see docs/email-verification-audit-2026-08-15.md):
-- sendOtpEmail() never checked the Resend SDK's { data, error } result — the
-- SDK resolves normally (never throws) for API-level rejections like a
-- suppressed/bounced recipient, so every such rejection was silently
-- reported as a successful send. These columns let the server persist real
-- send history per account so it can enforce a 60s cooldown, 3/hour and
-- 5/day caps, and stop ever retrying an address Resend has rejected.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS otp_last_sent_at        timestamptz,
  ADD COLUMN IF NOT EXISTS otp_hour_count           int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS otp_hour_window_start    timestamptz,
  ADD COLUMN IF NOT EXISTS otp_day_count            int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS otp_day_window_start     timestamptz,
  ADD COLUMN IF NOT EXISTS email_suppressed         boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_suppressed_reason  text,
  ADD COLUMN IF NOT EXISTS email_suppressed_at      timestamptz;

-- Used by /api/auth/send-otp's atomic cooldown-claim UPDATE ... WHERE, and by
-- any future admin lookup of suppressed accounts.
CREATE INDEX IF NOT EXISTS idx_users_email_suppressed ON users (email_suppressed) WHERE email_suppressed = true;
