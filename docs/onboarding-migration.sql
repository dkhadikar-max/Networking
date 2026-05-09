-- =====================================================================
-- BYN Onboarding Extension — Supabase Migration
-- Run this in the Supabase SQL editor before deploying server.js
-- All statements are idempotent (IF NOT EXISTS / ON CONFLICT safe)
-- =====================================================================

-- 1. New columns on users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_stage TEXT NOT NULL DEFAULT 'acquisition';

ALTER TABLE users
  ADD CONSTRAINT IF NOT EXISTS users_onboarding_stage_check
    CHECK (onboarding_stage IN ('acquisition','intent','profile','complete'));

ALTER TABLE users ADD COLUMN IF NOT EXISTS headline         TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profession       TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS industry         TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS experience_level TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS twitter          TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS github           TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS portfolio        TEXT;

ALTER TABLE users
  ADD CONSTRAINT IF NOT EXISTS users_exp_level_check
    CHECK (experience_level IN ('Beginner','Intermediate','Advanced','Expert'));

-- 2. user_acquisition table
CREATE TABLE IF NOT EXISTS user_acquisition (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  source     TEXT NOT NULL,
  referral   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_acquisition
  ADD CONSTRAINT IF NOT EXISTS user_acquisition_source_check
    CHECK (source IN ('LinkedIn','Instagram','Twitter/X','WhatsApp','Friend/Referral','Google Search','Community/Event','YouTube','Other'));

-- 3. user_intents table
CREATE TABLE IF NOT EXISTS user_intents (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  intent     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, intent)
);

ALTER TABLE user_intents
  ADD CONSTRAINT IF NOT EXISTS user_intents_intent_check
    CHECK (intent IN (
      'Networking','Find Opportunities','Build Startup Connections',
      'Find Co-founder','Hiring','Find Clients','Mentorship',
      'Learn from People','Community','Investment Opportunities'
    ));

-- 4. user_education table
CREATE TABLE IF NOT EXISTS user_education (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  school     TEXT,
  university TEXT,
  degree     TEXT,
  field      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. user_work table
CREATE TABLE IF NOT EXISTS user_work (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company         TEXT,
  job_title       TEXT,
  industry        TEXT,
  employment_type TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_work
  ADD CONSTRAINT IF NOT EXISTS user_work_emp_type_check
    CHECK (employment_type IN (
      'Full-time','Part-time','Freelancer','Founder','Self-employed',
      'Student','Intern','Consultant','Open to Work','Other'
    ));

-- 6. Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_acquisition_user ON user_acquisition(user_id);
CREATE INDEX IF NOT EXISTS idx_user_intents_user     ON user_intents(user_id);
CREATE INDEX IF NOT EXISTS idx_user_education_user   ON user_education(user_id);
CREATE INDEX IF NOT EXISTS idx_user_work_user        ON user_work(user_id);

-- 7. MIGRATE: Set all existing verified users to 'complete' so they skip onboarding
UPDATE users
SET onboarding_stage = 'complete'
WHERE email_verified = true
  AND onboarding_stage = 'acquisition';
