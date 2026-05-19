-- Run in Supabase SQL editor (Dashboard → SQL)
-- Verified 2026-05-19: most columns already exist in production.
-- Only the two below are actually missing. Safe to re-run (IF NOT EXISTS).

-- Referral tracking (used in signup referral reward — non-blocking if absent)
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by   text;

-- Premium flag (separate from the existing "premium boolean" column — used for is_premium checks)
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_premium    boolean DEFAULT false;
