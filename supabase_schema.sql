-- ============================================================
-- Networking App — Supabase PostgreSQL Schema
-- Run this in Supabase SQL Editor (once, before deploying)
-- ============================================================

-- USERS
CREATE TABLE IF NOT EXISTS users (
  id                    text PRIMARY KEY,
  email                 text UNIQUE NOT NULL,
  password              text NOT NULL,
  name                  text NOT NULL DEFAULT '',
  bio                   text DEFAULT '',
  photos                text[] DEFAULT '{}',
  instagram             text DEFAULT '',
  linkedin              text DEFAULT '',
  website               text DEFAULT '',
  location              text DEFAULT '',
  lat                   numeric,
  lng                   numeric,
  remote                boolean DEFAULT false,
  skills                text[] DEFAULT '{}',
  interests             text[] DEFAULT '{}',
  currently_exploring   text DEFAULT '',
  working_on            text DEFAULT '',
  interested_in         text DEFAULT '',
  intent                text DEFAULT 'explore-network',
  role                  text DEFAULT 'user',
  premium               boolean DEFAULT false,
  trust_score           integer DEFAULT 0,
  profile_score         integer DEFAULT 0,
  is_profile_complete   boolean DEFAULT false,
  verification          jsonb DEFAULT '{"status":"none","confidence":0}',
  push_token            text,
  banned                boolean DEFAULT false,
  last_active           timestamptz,
  avg_reply_minutes     integer DEFAULT 0,
  reply_count           integer DEFAULT 0,
  response_rate         integer DEFAULT 100,
  created_at            timestamptz DEFAULT now()
);

-- SWIPES  (from_user / to_user to avoid SQL reserved word "from")
CREATE TABLE IF NOT EXISTS swipes (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  from_user   text NOT NULL,
  to_user     text NOT NULL,
  direction   text NOT NULL CHECK (direction IN ('left','right')),
  created_at  timestamptz DEFAULT now(),
  UNIQUE(from_user, to_user)
);

-- CONNECTIONS
CREATE TABLE IF NOT EXISTS connections (
  id                       text PRIMARY KEY,
  user1                    text NOT NULL,
  user2                    text NOT NULL,
  created_at               timestamptz DEFAULT now(),
  expires_at               timestamptz,
  first_response_deadline  timestamptz,
  user1_responded          boolean DEFAULT false,
  user2_responded          boolean DEFAULT false,
  active                   boolean DEFAULT false,
  status                   text DEFAULT 'active'
);

-- MESSAGES  (sender_id to avoid SQL reserved word "from")
CREATE TABLE IF NOT EXISTS messages (
  id             text PRIMARY KEY,
  connection_id  text NOT NULL,
  sender_id      text NOT NULL,
  text           text NOT NULL,
  created_at     timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_connection_id_idx ON messages(connection_id);
CREATE INDEX IF NOT EXISTS messages_sender_id_idx ON messages(sender_id);

-- WORKS
CREATE TABLE IF NOT EXISTS works (
  id           text PRIMARY KEY,
  user_id      text NOT NULL,
  title        text NOT NULL,
  description  text DEFAULT '',
  url          text DEFAULT '',
  image        text DEFAULT '',
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS works_user_id_idx ON works(user_id);

-- REPORTS
CREATE TABLE IF NOT EXISTS reports (
  id          text PRIMARY KEY,
  from_user   text NOT NULL,
  target_id   text NOT NULL,
  reason      text NOT NULL,
  created_at  timestamptz DEFAULT now()
);

-- BLOCKS
CREATE TABLE IF NOT EXISTS blocks (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  from_user   text NOT NULL,
  to_user     text NOT NULL,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(from_user, to_user)
);

-- DAILY VIEWS  (tracks how many profiles each user has seen today)
CREATE TABLE IF NOT EXISTS daily_views (
  user_id  text NOT NULL,
  date     text NOT NULL,
  count    integer DEFAULT 0,
  PRIMARY KEY(user_id, date)
);

-- PRIORITY MESSAGES
CREATE TABLE IF NOT EXISTS priority_msgs (
  id          text PRIMARY KEY,
  from_user   text NOT NULL,
  to_user     text NOT NULL,
  text        text NOT NULL,
  month       text NOT NULL,
  read        boolean DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

-- ── DISABLE ROW LEVEL SECURITY ───────────────────────────────────────────────
-- The backend uses the service_role key which bypasses RLS anyway,
-- but disabling keeps things explicit and avoids any surprises.
ALTER TABLE users         DISABLE ROW LEVEL SECURITY;
ALTER TABLE swipes        DISABLE ROW LEVEL SECURITY;
ALTER TABLE connections   DISABLE ROW LEVEL SECURITY;
ALTER TABLE messages      DISABLE ROW LEVEL SECURITY;
ALTER TABLE works         DISABLE ROW LEVEL SECURITY;
ALTER TABLE reports       DISABLE ROW LEVEL SECURITY;
ALTER TABLE blocks        DISABLE ROW LEVEL SECURITY;
ALTER TABLE daily_views   DISABLE ROW LEVEL SECURITY;
ALTER TABLE priority_msgs DISABLE ROW LEVEL SECURITY;
