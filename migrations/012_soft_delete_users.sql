-- Migration 012 — soft-delete support for account deletion
-- Run this ONCE in Supabase SQL Editor:
-- https://app.supabase.com/project/swyrdvdarlevzjubqard/sql
--
-- Self-delete now anonymizes the users row instead of hard-deleting it, so
-- connections and messages a deleted user was part of still resolve for the
-- other party (the deleted user's own messages are still removed; the
-- counterparty's messages are preserved). deleted_at marks the row as gone
-- for every user-facing purpose (login, discovery, connections list, etc.)
-- even though the row physically remains.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS users_deleted_at_idx ON users(deleted_at) WHERE deleted_at IS NOT NULL;
