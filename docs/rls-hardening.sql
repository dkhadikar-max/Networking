-- ============================================================
-- BYN — Row Level Security Hardening
-- Target: block all direct anon/authenticated Supabase access
-- Effect: zero change to server.js (service_role bypasses RLS)
-- Safe to run: idempotent, wrapped in a transaction
-- ============================================================
--
-- HOW THIS WORKS
-- --------------
-- service_role has BYPASSRLS in PostgreSQL — it skips every policy
-- unconditionally. All 157 server.js DB calls use service_role.
-- Enabling RLS therefore has zero production impact.
--
-- anon + authenticated are standard Supabase roles. Anyone who
-- obtains your anon key (or a Supabase JWT) can use them to query
-- PostgREST directly, bypassing Express entirely. The RESTRICTIVE
-- policy below closes that path completely.
--
-- RESTRICTIVE policy semantics:
--   PERMISSIVE policies are OR'd together (any pass = access).
--   RESTRICTIVE policies are AND'd on top (all must pass too).
--   USING(false) means the condition is always false, so no row
--   ever satisfies it — effectively a hard deny for all operations.
--   WITH CHECK(false) covers INSERT/UPDATE write paths.
-- ============================================================

BEGIN;

-- ── STEP 1: ENABLE RLS ───────────────────────────────────────

-- Core tables
ALTER TABLE users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE swipes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections    ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE works          ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports        ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_views    ENABLE ROW LEVEL SECURITY;
ALTER TABLE priority_msgs  ENABLE ROW LEVEL SECURITY;

-- Onboarding tables
ALTER TABLE user_acquisition  ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_intents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_education    ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_work         ENABLE ROW LEVEL SECURITY;


-- ── STEP 2: DROP EXISTING POLICIES (idempotent re-run safety) ─

DROP POLICY IF EXISTS "block_direct_access" ON users;
DROP POLICY IF EXISTS "block_direct_access" ON swipes;
DROP POLICY IF EXISTS "block_direct_access" ON connections;
DROP POLICY IF EXISTS "block_direct_access" ON messages;
DROP POLICY IF EXISTS "block_direct_access" ON works;
DROP POLICY IF EXISTS "block_direct_access" ON reports;
DROP POLICY IF EXISTS "block_direct_access" ON blocks;
DROP POLICY IF EXISTS "block_direct_access" ON daily_views;
DROP POLICY IF EXISTS "block_direct_access" ON priority_msgs;
DROP POLICY IF EXISTS "block_direct_access" ON user_acquisition;
DROP POLICY IF EXISTS "block_direct_access" ON user_intents;
DROP POLICY IF EXISTS "block_direct_access" ON user_education;
DROP POLICY IF EXISTS "block_direct_access" ON user_work;


-- ── STEP 3: CREATE RESTRICTIVE DENY POLICIES ──────────────────
-- Targets anon + authenticated only. service_role is NOT listed
-- here and bypasses RLS unconditionally via BYPASSRLS.

CREATE POLICY "block_direct_access" ON users
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "block_direct_access" ON swipes
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "block_direct_access" ON connections
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "block_direct_access" ON messages
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "block_direct_access" ON works
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "block_direct_access" ON reports
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "block_direct_access" ON blocks
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "block_direct_access" ON daily_views
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "block_direct_access" ON priority_msgs
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "block_direct_access" ON user_acquisition
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "block_direct_access" ON user_intents
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "block_direct_access" ON user_education
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "block_direct_access" ON user_work
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);


-- ── STEP 4: VERIFY (run after commit, results should be 13 rows) ─
-- SELECT schemaname, tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- ORDER BY tablename;
--
-- SELECT tablename, policyname, roles, cmd, qual
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename;

COMMIT;


-- ============================================================
-- ROLLBACK (run this block to fully revert — copy/paste as-is)
-- ============================================================
--
-- BEGIN;
--
-- DROP POLICY IF EXISTS "block_direct_access" ON users;
-- DROP POLICY IF EXISTS "block_direct_access" ON swipes;
-- DROP POLICY IF EXISTS "block_direct_access" ON connections;
-- DROP POLICY IF EXISTS "block_direct_access" ON messages;
-- DROP POLICY IF EXISTS "block_direct_access" ON works;
-- DROP POLICY IF EXISTS "block_direct_access" ON reports;
-- DROP POLICY IF EXISTS "block_direct_access" ON blocks;
-- DROP POLICY IF EXISTS "block_direct_access" ON daily_views;
-- DROP POLICY IF EXISTS "block_direct_access" ON priority_msgs;
-- DROP POLICY IF EXISTS "block_direct_access" ON user_acquisition;
-- DROP POLICY IF EXISTS "block_direct_access" ON user_intents;
-- DROP POLICY IF EXISTS "block_direct_access" ON user_education;
-- DROP POLICY IF EXISTS "block_direct_access" ON user_work;
--
-- ALTER TABLE users          DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE swipes         DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE connections    DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE messages       DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE works          DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE reports        DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE blocks         DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE daily_views    DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE priority_msgs  DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE user_acquisition  DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE user_intents      DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE user_education    DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE user_work         DISABLE ROW LEVEL SECURITY;
--
-- COMMIT;
-- ============================================================
