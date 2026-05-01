-- ============================================================
-- NETWORKING PLATFORM — SUPABASE SCHEMA
-- Run in Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- for ILIKE search

-- ============================================================
-- TABLES
-- ============================================================

-- USERS (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  bio             TEXT,
  working_on      TEXT,
  currently_exploring TEXT,
  intent          TEXT CHECK (intent IN ('hiring','job_seeking','co_founder','collaboration','networking','learning','mentoring','investing')),
  interests       TEXT[]   DEFAULT '{}',
  skills          TEXT[]   DEFAULT '{}',
  photos          TEXT[]   DEFAULT '{}',  -- S3/Storage public URLs
  linkedin        TEXT,
  instagram       TEXT,
  website         TEXT,
  -- Location (approximate — rounded to 2 dp ~1.1km)
  lat             NUMERIC(8,2),
  lng             NUMERIC(8,2),
  location_label  TEXT,
  -- Trust & verification
  trust_score     INT      NOT NULL DEFAULT 0 CHECK (trust_score BETWEEN 0 AND 100),
  is_verified     BOOLEAN  NOT NULL DEFAULT FALSE,
  -- Premium
  is_premium      BOOLEAN  NOT NULL DEFAULT FALSE,
  premium_until   TIMESTAMPTZ,
  -- Moderation
  is_banned       BOOLEAN  NOT NULL DEFAULT FALSE,
  -- Swipe quota reset
  swipes_today    INT      NOT NULL DEFAULT 0,
  swipes_reset_at DATE     NOT NULL DEFAULT CURRENT_DATE,
  -- Priority message quota
  priority_msgs_this_month INT NOT NULL DEFAULT 0,
  priority_reset_at        DATE NOT NULL DEFAULT DATE_TRUNC('month', CURRENT_DATE),
  -- Timestamps
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- VERIFICATIONS
CREATE TABLE IF NOT EXISTS public.verifications (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','failed')),
  confidence_score NUMERIC(5,2),
  video_url        TEXT,  -- signed URL path in storage
  reviewed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- SWIPES
CREATE TABLE IF NOT EXISTS public.swipes (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  swiper_id  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_id  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  direction  TEXT NOT NULL CHECK (direction IN ('like','pass')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (swiper_id, target_id)
);

-- MATCHES
CREATE TABLE IF NOT EXISTS public.matches (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_a     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_b     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','expired')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '5 days',
  -- Active when both reply within 48h of match
  a_replied  BOOLEAN NOT NULL DEFAULT FALSE,
  b_replied  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_a, user_b),
  CHECK (user_a < user_b)  -- canonical ordering prevents duplicates
);

-- MESSAGES
CREATE TABLE IF NOT EXISTS public.messages (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id   UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  sender_id  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content    TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PRIORITY MESSAGES (send before match)
CREATE TABLE IF NOT EXISTS public.priority_messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content     TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','replied','expired')),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (sender_id, receiver_id)  -- 1 priority msg per pair
);

-- LIKES (who liked you — visible to premium users)
CREATE TABLE IF NOT EXISTS public.likes (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  liker_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_id  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (liker_id, target_id)
);

-- SUBSCRIPTIONS
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider            TEXT NOT NULL CHECK (provider IN ('stripe','razorpay')),
  provider_sub_id     TEXT NOT NULL UNIQUE,
  status              TEXT NOT NULL CHECK (status IN ('active','cancelled','expired')),
  amount_paise        INT,   -- INR paise (39900 = ₹399)
  current_period_end  TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- REPORTS
CREATE TABLE IF NOT EXISTS public.reports (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reason      TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (reporter_id, target_id)
);

-- BLOCKS
CREATE TABLE IF NOT EXISTS public.blocks (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  blocker_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (blocker_id, blocked_id)
);

-- AUDIT LOG (admin actions)
CREATE TABLE IF NOT EXISTS public.audit_log (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id   UUID REFERENCES public.users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  target_id  UUID,
  meta       JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PORTFOLIO / WORK ITEMS
CREATE TABLE IF NOT EXISTS public.works (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  url         TEXT,
  image_url   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_swipes_swiper    ON public.swipes(swiper_id);
CREATE INDEX IF NOT EXISTS idx_swipes_target    ON public.swipes(target_id);
CREATE INDEX IF NOT EXISTS idx_matches_user_a   ON public.matches(user_a);
CREATE INDEX IF NOT EXISTS idx_matches_user_b   ON public.matches(user_b);
CREATE INDEX IF NOT EXISTS idx_matches_status   ON public.matches(status);
CREATE INDEX IF NOT EXISTS idx_messages_match   ON public.messages(match_id, created_at);
CREATE INDEX IF NOT EXISTS idx_prio_receiver    ON public.priority_messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_prio_sender      ON public.priority_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_likes_target     ON public.likes(target_id);
CREATE INDEX IF NOT EXISTS idx_reports_target   ON public.reports(target_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocker   ON public.blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked   ON public.blocks(blocked_id);
CREATE INDEX IF NOT EXISTS idx_users_intent     ON public.users(intent);
CREATE INDEX IF NOT EXISTS idx_users_trust      ON public.users(trust_score DESC);
CREATE INDEX IF NOT EXISTS idx_users_name_trgm  ON public.users USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_users_interests  ON public.users USING GIN (interests);
CREATE INDEX IF NOT EXISTS idx_users_skills     ON public.users USING GIN (skills);
CREATE INDEX IF NOT EXISTS idx_verifications_user ON public.verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_works_user       ON public.works(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_admin      ON public.audit_log(admin_id, created_at DESC);

-- ============================================================
-- AUTO-UPDATE updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- TRUST SCORE AUTO-COMPUTE TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION recompute_trust()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  score INT := 0;
BEGIN
  IF array_length(NEW.photos, 1) >= 4               THEN score := score + 15; END IF;
  IF NEW.bio IS NOT NULL AND trim(NEW.bio) <> ''     THEN score := score + 15; END IF;
  IF (trim(COALESCE(NEW.currently_exploring,'')) <> ''
   OR trim(COALESCE(NEW.working_on,'')) <> '')       THEN score := score + 10; END IF;
  IF array_length(NEW.interests, 1) >= 1             THEN score := score + 10; END IF;
  IF array_length(NEW.skills, 1) >= 1                THEN score := score + 10; END IF;
  IF (NEW.linkedin IS NOT NULL OR NEW.instagram IS NOT NULL
   OR NEW.website IS NOT NULL)                       THEN score := score + 10; END IF;
  IF NEW.is_verified                                 THEN score := score + 30; END IF;
  NEW.trust_score := score;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_trust_score
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION recompute_trust();

-- ============================================================
-- MATCH CANONICALIZATION (ensure user_a < user_b)
-- ============================================================

CREATE OR REPLACE FUNCTION canonicalize_match()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_a > NEW.user_b THEN
    DECLARE tmp UUID := NEW.user_a;
    BEGIN
      NEW.user_a := NEW.user_b;
      NEW.user_b := tmp;
    END;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_canonicalize_match
  BEFORE INSERT ON public.matches
  FOR EACH ROW EXECUTE FUNCTION canonicalize_match();

-- ============================================================
-- EXPIRE MATCHES (call via pg_cron or scheduled function)
-- ============================================================

CREATE OR REPLACE FUNCTION expire_matches()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.matches
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at < NOW();
END;
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verifications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swipes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.priority_messages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.likes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.works              ENABLE ROW LEVEL SECURITY;

-- ---- USERS ----
-- Public: read non-banned profiles (no email/lat/lng — use cleanPublic in API)
CREATE POLICY users_select_public ON public.users
  FOR SELECT USING (is_banned = FALSE);

-- Own row: full read
CREATE POLICY users_select_own ON public.users
  FOR SELECT USING (id = auth.uid());

-- Insert own row on signup
CREATE POLICY users_insert_own ON public.users
  FOR INSERT WITH CHECK (id = auth.uid());

-- Update own row only
CREATE POLICY users_update_own ON public.users
  FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- ---- VERIFICATIONS ----
CREATE POLICY verif_select_own ON public.verifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY verif_insert_own ON public.verifications
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- ---- SWIPES ----
CREATE POLICY swipes_select_own ON public.swipes
  FOR SELECT USING (swiper_id = auth.uid());

CREATE POLICY swipes_insert_own ON public.swipes
  FOR INSERT WITH CHECK (swiper_id = auth.uid());

-- ---- MATCHES ----
CREATE POLICY matches_select_own ON public.matches
  FOR SELECT USING (user_a = auth.uid() OR user_b = auth.uid());

CREATE POLICY matches_insert_own ON public.matches
  FOR INSERT WITH CHECK (user_a = auth.uid() OR user_b = auth.uid());

CREATE POLICY matches_update_own ON public.matches
  FOR UPDATE USING (user_a = auth.uid() OR user_b = auth.uid());

-- ---- MESSAGES ----
CREATE POLICY messages_select_own ON public.messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = match_id
        AND (m.user_a = auth.uid() OR m.user_b = auth.uid())
    )
  );

CREATE POLICY messages_insert_own ON public.messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = match_id
        AND m.status = 'active'
        AND (m.user_a = auth.uid() OR m.user_b = auth.uid())
    )
  );

-- ---- PRIORITY MESSAGES ----
CREATE POLICY prio_select_participant ON public.priority_messages
  FOR SELECT USING (sender_id = auth.uid() OR receiver_id = auth.uid());

CREATE POLICY prio_insert_own ON public.priority_messages
  FOR INSERT WITH CHECK (sender_id = auth.uid());

CREATE POLICY prio_update_receiver ON public.priority_messages
  FOR UPDATE USING (receiver_id = auth.uid());

-- ---- LIKES ----
-- Only premium users can read who liked them (enforced in API layer)
CREATE POLICY likes_select_target ON public.likes
  FOR SELECT USING (target_id = auth.uid());

CREATE POLICY likes_insert_own ON public.likes
  FOR INSERT WITH CHECK (liker_id = auth.uid());

-- ---- SUBSCRIPTIONS ----
CREATE POLICY subs_select_own ON public.subscriptions
  FOR SELECT USING (user_id = auth.uid());

-- Subscriptions inserted via service role (webhook) only — no user insert policy

-- ---- REPORTS ----
CREATE POLICY reports_insert_own ON public.reports
  FOR INSERT WITH CHECK (reporter_id = auth.uid());

CREATE POLICY reports_select_own ON public.reports
  FOR SELECT USING (reporter_id = auth.uid());

-- ---- BLOCKS ----
CREATE POLICY blocks_select_own ON public.blocks
  FOR SELECT USING (blocker_id = auth.uid());

CREATE POLICY blocks_insert_own ON public.blocks
  FOR INSERT WITH CHECK (blocker_id = auth.uid());

CREATE POLICY blocks_delete_own ON public.blocks
  FOR DELETE USING (blocker_id = auth.uid());

-- ---- WORKS ----
CREATE POLICY works_select_all ON public.works
  FOR SELECT USING (TRUE);

CREATE POLICY works_insert_own ON public.works
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY works_update_own ON public.works
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY works_delete_own ON public.works
  FOR DELETE USING (user_id = auth.uid());

-- ---- AUDIT LOG (admin only via service role) ----
-- No user-facing policies — accessed via service_role key only

-- ============================================================
-- STORAGE BUCKETS
-- Run these in Supabase Dashboard → Storage, or via SQL below
-- ============================================================

-- Profile photos bucket (public read, authenticated write)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile_photos',
  'profile_photos',
  TRUE,
  5242880,  -- 5 MB
  ARRAY['image/jpeg','image/png','image/webp']
) ON CONFLICT (id) DO NOTHING;

-- Verification videos bucket (private — signed URLs only)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'verification_videos',
  'verification_videos',
  FALSE,
  52428800,  -- 50 MB
  ARRAY['video/mp4','video/webm']
) ON CONFLICT (id) DO NOTHING;

-- Portfolio / work media bucket (public read)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'portfolio_media',
  'portfolio_media',
  TRUE,
  10485760,  -- 10 MB
  ARRAY['image/jpeg','image/png','image/webp','video/mp4']
) ON CONFLICT (id) DO NOTHING;

-- ---- STORAGE RLS ----

-- profile_photos: authenticated users upload to their own folder (user_id/filename)
CREATE POLICY storage_photos_upload ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'profile_photos' AND
    (storage.foldername(name))[1] = auth.uid()::TEXT
  );

CREATE POLICY storage_photos_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'profile_photos' AND
    (storage.foldername(name))[1] = auth.uid()::TEXT
  );

CREATE POLICY storage_photos_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'profile_photos' AND
    (storage.foldername(name))[1] = auth.uid()::TEXT
  );

-- verification_videos: own folder only, private
CREATE POLICY storage_verif_upload ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'verification_videos' AND
    (storage.foldername(name))[1] = auth.uid()::TEXT
  );

CREATE POLICY storage_verif_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'verification_videos' AND
    (storage.foldername(name))[1] = auth.uid()::TEXT
  );

-- portfolio_media: own folder, public bucket
CREATE POLICY storage_portfolio_upload ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'portfolio_media' AND
    (storage.foldername(name))[1] = auth.uid()::TEXT
  );

CREATE POLICY storage_portfolio_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'portfolio_media' AND
    (storage.foldername(name))[1] = auth.uid()::TEXT
  );
