-- Per-user "last read" watermark on a connection, mirroring the existing
-- user1_responded/user2_responded per-party pattern already on this table.
--
-- Without this, GET /api/connections had no way to know whether a user had
-- actually opened and read a conversation — it only knew whether they'd
-- *replied*, so the "unread" indicator in chat never cleared just from
-- viewing a thread; only sending a message cleared it. See
-- docs/matching-chat-audit-2026-08-14.md, finding #1.
--
-- Nullable and additive — safe to apply without downtime. Until applied,
-- server.js falls back to treating "no watermark" as "unread since account
-- creation" (i.e. counts every message from the other party), which is a
-- strict improvement over the previous always-boolean unread_count but not
-- as accurate as after this migration runs.
ALTER TABLE connections
  ADD COLUMN IF NOT EXISTS user1_last_read_at timestamptz,
  ADD COLUMN IF NOT EXISTS user2_last_read_at timestamptz;
