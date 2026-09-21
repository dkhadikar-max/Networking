-- Production schema drift - closes audit finding A6 (three objects the code
-- already depends on but the live database never had):
--
--   A6a  reports.type
--   A6b  audit_logs
--   A6c  users.deletion_scheduled_at
--
-- Confirmed against the live database (read-only PostgREST introspection,
-- 2026-09-20):
--   reports.select('type')                       -> 42703 column reports.type does not exist
--   audit_logs.select('*')                       -> PGRST205 table 'public.audit_logs' not in schema cache
--   users.select('deletion_scheduled_at')        -> 42703 column users.deletion_scheduled_at does not exist
--
-- WHY IT WAS SILENT. Every write to these objects went through supabase-js,
-- which returns {error} instead of throwing - and the callers never looked at
-- it. So POST /api/report/illegal-content answered "Report received" while the
-- INSERT was being rejected, admin actions "succeeded" with no audit row, and
-- the GDPR retention job's queries all failed without a trace. server.js now
-- checks those errors (see the A6 changes there); this migration adds the
-- missing objects.
--
-- SAFE TO APPLY TO THE CURRENT PRODUCTION SCHEMA: purely additive.
--   * every statement is IF NOT EXISTS (re-runnable; a second run is a no-op)
--   * no column is dropped, renamed, retyped or given a default that rewrites data
--   * no existing row is modified (existing reports keep type = NULL, existing
--     users keep deletion_scheduled_at = NULL)
--   * no table other than reports, users and the new audit_logs is touched

-- -- A6a - reports.type --------------------------------------------------------
-- server.js writes type = 'illegal_content' for DSA Art. 16 reports
-- (POST /api/report/illegal-content) and leaves it unset for ordinary user
-- reports (POST /api/report), which therefore stay NULL - the admin DSA report
-- treats "NULL or anything other than 'illegal_content'" as a social report.
-- Nullable text with no default matches how the code uses it. No CHECK
-- constraint: 'illegal_content' is the only value in use and inventing an enum
-- here would be guesswork. reports is admin-read-only and tiny; no index yet.
ALTER TABLE reports ADD COLUMN IF NOT EXISTS type text;

-- -- A6b - audit_logs ----------------------------------------------------------
-- Schema is exactly what auditLog() inserts ({admin_id, action, target_id,
-- created_at}) and matches the definition already recorded in
-- supabase_schema.sql. Deliberately NO foreign key on admin_id/target_id: audit
-- rows must outlive the accounts they describe (users are soft-deleted and may
-- be purged), and self_delete / dsa_auto_ban events use ordinary user ids.
CREATE TABLE IF NOT EXISTS audit_logs (
  id         BIGSERIAL   PRIMARY KEY,
  admin_id   TEXT        NOT NULL,
  action     TEXT        NOT NULL,
  target_id  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Per-admin history (as declared in supabase_schema.sql).
CREATE INDEX IF NOT EXISTS audit_logs_admin_id_idx ON audit_logs(admin_id, created_at DESC);
-- The read GET /api/admin/audit actually makes: newest first, ties broken by id.
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs(created_at DESC, id DESC);
-- Same posture as every other table: only the backend's service role reads/writes.
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- -- A6c - users.deletion_scheduled_at ----------------------------------------
-- Written and read only by runRetentionCycle() (GDPR Art. 5(1)(e)): step 1 sets
-- it to now + 30 days for accounts inactive for 18 months (and sends the
-- warning e-mail); step 2 acts on accounts whose date has passed. Nullable
-- timestamptz, no default: NULL means "not scheduled" - the code tests
-- `IS NULL` and `< now()`. (Self-delete never touches this column; it
-- anonymizes immediately.)
ALTER TABLE users ADD COLUMN IF NOT EXISTS deletion_scheduled_at timestamptz;
-- Step 2's query (`deletion_scheduled_at < now`). Partial: almost every row is
-- NULL. Same pattern as users_deleted_at_idx in migration 012.
CREATE INDEX IF NOT EXISTS users_deletion_scheduled_at_idx ON users(deletion_scheduled_at) WHERE deletion_scheduled_at IS NOT NULL;

-- Make PostgREST notice the new objects immediately instead of on its next
-- periodic schema-cache refresh (the "not in the schema cache" errors above).
NOTIFY pgrst, 'reload schema';
