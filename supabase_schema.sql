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
  headline              text DEFAULT '',
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
  is_premium            boolean DEFAULT false,
  premium_expires_at    timestamptz,
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
  -- auth & OTP
  email_verified        boolean DEFAULT false,
  otp_code              text,
  otp_expires_at        timestamptz,
  failed_login_attempts integer DEFAULT 0,
  lockout_until         timestamptz,
  -- consent (GDPR/privacy)
  consent_given_at      timestamptz,
  consent_version       text DEFAULT 'v1.0',
  do_not_sell           boolean DEFAULT false,
  -- referrals
  referred_by           text,
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
CREATE INDEX IF NOT EXISTS connections_user1_idx ON connections(user1);
CREATE INDEX IF NOT EXISTS connections_user2_idx ON connections(user2);

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

-- FEEDBACK
CREATE TABLE IF NOT EXISTS feedback (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     text NOT NULL,
  category    text NOT NULL DEFAULT 'General Feedback',
  message     text NOT NULL,
  created_at  timestamptz DEFAULT now()
);

-- CIRCLE POSTS  (Intent Circles — global feed)
CREATE TABLE IF NOT EXISTS circle_posts (
  id              text PRIMARY KEY,
  user_id         text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text            text NOT NULL,
  tags            text[] NOT NULL DEFAULT '{}',
  structured_meta jsonb NOT NULL DEFAULT '{}',
  links           jsonb NOT NULL DEFAULT '[]',
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS circle_posts_user_id_idx    ON circle_posts(user_id);
CREATE INDEX IF NOT EXISTS circle_posts_created_at_idx ON circle_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS circle_posts_tags_idx       ON circle_posts USING GIN(tags);

-- CIRCLE POST LIKES  (lightweight reaction — see migrations/010_circle_post_likes.sql)
CREATE TABLE IF NOT EXISTS circle_post_likes (
  id         text PRIMARY KEY,
  post_id    text NOT NULL REFERENCES circle_posts(id) ON DELETE CASCADE,
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(post_id, user_id)
);
CREATE INDEX IF NOT EXISTS circle_post_likes_post_id_idx ON circle_post_likes(post_id);
CREATE INDEX IF NOT EXISTS circle_post_likes_user_id_idx ON circle_post_likes(user_id);

-- CIRCLE GROUPS  (joinable communities — see migrations/011_circle_groups.sql)
CREATE TABLE IF NOT EXISTS circle_groups (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  description text,
  photo_url   text,
  privacy     text NOT NULL DEFAULT 'public' CHECK (privacy IN ('public','private')),
  creator_id  text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS circle_groups_creator_id_idx ON circle_groups(creator_id);

CREATE TABLE IF NOT EXISTS circle_group_members (
  id        text PRIMARY KEY,
  group_id  text NOT NULL REFERENCES circle_groups(id) ON DELETE CASCADE,
  user_id   text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      text NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  joined_at timestamptz DEFAULT now(),
  UNIQUE(group_id, user_id)
);
CREATE INDEX IF NOT EXISTS circle_group_members_group_id_idx ON circle_group_members(group_id);
CREATE INDEX IF NOT EXISTS circle_group_members_user_id_idx ON circle_group_members(user_id);
-- circle_posts.group_id (nullable FK to circle_groups) added by migration 011

-- ── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
-- service_role key (used by the backend) bypasses RLS entirely — no policies
-- needed for it. Enabling RLS with no policies means anon/authenticated Supabase
-- roles have zero access, which is correct: all data access must go through the
-- Express backend, never directly to Supabase.
-- NOTE: Run this block in Supabase SQL Editor to apply to the live database.
ALTER TABLE users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE swipes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections   ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE works         ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports       ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_views   ENABLE ROW LEVEL SECURITY;
ALTER TABLE priority_msgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback      ENABLE ROW LEVEL SECURITY;
ALTER TABLE circle_posts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE circle_post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE circle_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE circle_group_members ENABLE ROW LEVEL SECURITY;

-- ── NOTIFICATIONS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          TEXT        PRIMARY KEY,
  user_id     TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT        NOT NULL,
  actor_id    TEXT        REFERENCES users(id) ON DELETE SET NULL,
  actor_name  TEXT,
  actor_photo TEXT,
  ref_id      TEXT,
  ref_type    TEXT        NOT NULL DEFAULT 'circle_post',
  ref_text    TEXT,
  read        BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx       ON notifications(user_id) WHERE read = FALSE;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════════════
-- The following tables were live in production and actively queried by
-- server.js but had never been added to this schema file — reconstructed
-- from actual usage (2026-07-28 architecture audit) so this file is a
-- reliable source of truth. Verify column types/constraints against the
-- live database before relying on this to recreate production from scratch.
-- ══════════════════════════════════════════════════════════════════════════

-- ── PAYMENTS (Razorpay) ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id                 TEXT        PRIMARY KEY, -- = razorpay_order_id
  user_id            TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  razorpay_order_id  TEXT        NOT NULL,
  razorpay_payment_id TEXT,
  plan               TEXT        NOT NULL,
  currency           TEXT        NOT NULL,
  amount             INTEGER     NOT NULL,
  status             TEXT        NOT NULL DEFAULT 'created', -- created | paid
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS payments_user_id_idx ON payments(user_id);
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- ── PUSH SUBSCRIPTIONS (Web Push) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_subscriptions (
  user_id      TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint     TEXT        NOT NULL,
  subscription JSONB       NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, endpoint)
);
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- ── USER ACQUISITION (onboarding source/referral) ────────────────────────────
CREATE TABLE IF NOT EXISTS user_acquisition (
  user_id    TEXT        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  source     TEXT,
  referral   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE user_acquisition ENABLE ROW LEVEL SECURITY;

-- ── USER EDUCATION (onboarding) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_education (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  school     TEXT,
  university TEXT,
  degree     TEXT,
  field      TEXT
);
CREATE INDEX IF NOT EXISTS user_education_user_id_idx ON user_education(user_id);
ALTER TABLE user_education ENABLE ROW LEVEL SECURITY;

-- ── USER WORK (onboarding) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_work (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company         TEXT,
  job_title       TEXT,
  industry        TEXT,
  employment_type TEXT
);
CREATE INDEX IF NOT EXISTS user_work_user_id_idx ON user_work(user_id);
ALTER TABLE user_work ENABLE ROW LEVEL SECURITY;

-- ── USER INTENTS (multi-intent onboarding) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS user_intents (
  id         TEXT        PRIMARY KEY,
  user_id    TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  intent     TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, intent)
);
ALTER TABLE user_intents ENABLE ROW LEVEL SECURITY;

-- ── USER REVIEWS (peer trust reviews) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_reviews (
  id           TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  reviewer_id  TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewed_id  TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating       INTEGER     NOT NULL,
  tags         TEXT[]      DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (reviewer_id, reviewed_id)
);
CREATE INDEX IF NOT EXISTS user_reviews_reviewed_id_idx ON user_reviews(reviewed_id);
ALTER TABLE user_reviews ENABLE ROW LEVEL SECURITY;

-- ── AUDIT LOGS (admin actions) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id         BIGSERIAL   PRIMARY KEY,
  admin_id   TEXT        NOT NULL,
  action     TEXT        NOT NULL,
  target_id  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_logs_admin_id_idx ON audit_logs(admin_id, created_at DESC);
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
