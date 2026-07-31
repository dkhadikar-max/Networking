-- SUPERSEDED — never applied. 006_auth_and_onboarding_columns.sql added
-- referred_by as `text` instead; that's what's live in production (verified
-- 2026-07-31). Kept here only as historical record — do not run this file.

-- ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by UUID;
