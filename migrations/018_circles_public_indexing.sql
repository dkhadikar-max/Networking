-- Circles public indexing (AEO) — Phase 1 data model only. No public page yet.
--
-- Locked exposure policy (2026-09-03):
--   Public Circle required + explicit per-post opt-in (default false, never
--   inferred) + 72h moderation delay anchored to public_opt_in_at (not post
--   creation) + zero reports on the post at both the opt-in check and the
--   72h checkpoint + author unrestricted (not banned/deleted) + 15-word
--   minimum + any edit after indexing invalidates and restarts the window +
--   a separately-stored, PII-stripped public_excerpt (never raw text, never
--   a naive slice) + no replies/counts/profile links ever exposed publicly +
--   immediate revocation on opt-out (indexed_at cleared) + external-cache
--   persistence explicitly acknowledged as a residual risk, not solved here.
--
-- indexed_at is the single source of truth for "this post is currently
-- public." It is set ONLY by the server-side sweep job (see server.js,
-- runCirclesPublicIndexingSweep) — never by client input, and the public
-- read endpoint re-verifies live conditions on top of it rather than
-- trusting it blindly.

ALTER TABLE circle_posts
  ADD COLUMN IF NOT EXISTS public_opt_in    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_opt_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS public_excerpt   text,
  ADD COLUMN IF NOT EXISTS indexed_at       timestamptz,
  -- Set once, on transition from indexed -> not-indexed (opt-out, a report
  -- landing on a live post, or a live-recheck failure). Never cleared again.
  -- Distinguishes "was public, now revoked" (410) from "never was" (404) on
  -- the public read endpoint -- required for the locked spec's "immediate
  -- revocation -> 410/noindex" behavior to actually mean anything to a
  -- crawler, rather than both cases looking identically like 404.
  ADD COLUMN IF NOT EXISTS revoked_at       timestamptz;

-- No post-level report primitive existed before this — /api/report (see
-- server.js) only targets users. The locked spec's "zero reports on the
-- post" gate needs a real signal to check, so this is added as the minimal
-- data layer for it (dedup per reporter+post, same shape as the existing
-- user-report table).
CREATE TABLE IF NOT EXISTS circle_post_reports (
  id         text PRIMARY KEY,
  post_id    text NOT NULL REFERENCES circle_posts(id) ON DELETE CASCADE,
  from_user  text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason     text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, from_user)
);
CREATE INDEX IF NOT EXISTS circle_post_reports_post_id_idx ON circle_post_reports(post_id);

-- Sweep job scans opted-in, not-yet-indexed posts whose window has elapsed.
CREATE INDEX IF NOT EXISTS circle_posts_public_opt_in_pending_idx
  ON circle_posts (public_opt_in_at)
  WHERE public_opt_in = true AND indexed_at IS NULL;

-- Public read endpoint looks up by id and checks indexed_at IS NOT NULL.
CREATE INDEX IF NOT EXISTS circle_posts_indexed_at_idx
  ON circle_posts (indexed_at)
  WHERE indexed_at IS NOT NULL;

ALTER TABLE circle_post_reports ENABLE ROW LEVEL SECURITY;
