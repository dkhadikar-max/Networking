-- Run in Supabase SQL editor (Dashboard → SQL)
-- Adds columns required by auth, OTP, lockout, and onboarding flows.
-- All statements use IF NOT EXISTS so this is safe to re-run.

-- Auth / OTP
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified      boolean DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_code            text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_expires_at      timestamptz;

-- Brute-force lockout
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts integer DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS lockout_until         timestamptz;

-- Onboarding funnel
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_stage     text DEFAULT 'acquisition';
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

-- Referral & premium
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by          text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_premium           boolean DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_expires_at   timestamptz;
