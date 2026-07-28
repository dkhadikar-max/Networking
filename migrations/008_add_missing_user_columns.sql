-- Migration 001 — add columns missing from live users table
-- Run this ONCE in Supabase SQL Editor:
-- https://app.supabase.com/project/swyrdvdarlevzjubqard/sql

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS headline              text DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_premium            boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS premium_expires_at    timestamptz,
  ADD COLUMN IF NOT EXISTS email_verified        boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS otp_code              text,
  ADD COLUMN IF NOT EXISTS otp_expires_at        timestamptz,
  ADD COLUMN IF NOT EXISTS failed_login_attempts integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lockout_until         timestamptz,
  ADD COLUMN IF NOT EXISTS consent_given_at      timestamptz,
  ADD COLUMN IF NOT EXISTS consent_version       text DEFAULT 'v1.0',
  ADD COLUMN IF NOT EXISTS do_not_sell           boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS referred_by           text;
