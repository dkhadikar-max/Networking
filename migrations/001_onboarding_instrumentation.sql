-- Run in Supabase SQL editor (Dashboard → SQL)
-- Required for avg_completion_seconds in /api/admin/onboarding/funnel

ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;
