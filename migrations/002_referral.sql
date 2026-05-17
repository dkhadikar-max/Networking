-- Run in Supabase SQL editor (Dashboard → SQL)
-- Required for referral attribution system

ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by UUID;
