-- Closes audit finding A22 (Option B, as decided) — trust_score conflated two incompatible things:
-- calcTrust()'s stateless profile-quality value (photos/interests/intent/bio/location/social/verified),
-- and POST /api/report's attempt at a persistent moderation penalty (trust_score = stored - 10). Seven
-- other write paths (PUT /api/me, photo upload/reorder/delete, onboarding profile, the peer-review
-- bonus, admin verify, and POST /api/login's unconditional "refresh scores" on every login) each
-- recompute calcTrust() from scratch and overwrite the column — silently erasing any report penalty,
-- most commonly on the very next login. Meanwhile trustGuard/discoverGuard (the actual swipe/connect/
-- discover/search eligibility gates) recompute calcTrust() live and never read the stored column at
-- all, so no report penalty, however long it survived, ever reached a reported user's own eligibility.
--
-- DECISION (Option B — the smaller, lower-risk change): calcTrust()/trust_score keep their existing
-- role and formula UNCHANGED — profile/photo/onboarding/login recalculation, trustGuard's >=20 and
-- discoverGuard's >=10 thresholds, all exactly as today. profile_score/calcProfileScore (A13's
-- onboarding-completion system) is untouched, a fully separate concern. The ONLY change: trust_score
-- stops being a moderation-penalty target. Moderation standing becomes this new, independent,
-- event-backed record instead — durable, auditable, and immune to being silently overwritten by an
-- unrelated profile edit.
--
-- A22's qualifying trigger (deliberately narrow — see the investigation for what's deferred):
--   valid ordinary report AND review_count(user_reviews for that user) >= 3 AND avg_rating < 3.0
--     -> one moderation_event, snapshotting report_id / review_count / avg_rating AT THE MOMENT the
--        report qualified (never recalculated in place — a later review changing the average does not
--        retroactively alter or delete a past event). The >=3 sample-size bar mirrors the EXISTING
--        peer-review bonus in calcTrust's neighborhood (allReviews.length>=3 && avgRating>=4 for +20),
--        same minimum, negative case.
-- A report that does NOT meet that bar creates no event and no other automatic effect; it remains
-- only as a row on `reports`. There is deliberately no "flagged for review" pathway yet (no ordinary-
-- report moderation queue or reviewer UI exists to act on one), no severity/category (POST /api/report
-- has no category field and no client anywhere calls it), and nothing in this migration or the
-- server.js change that depends on it DERIVES a standing number from these events or gates any surface
-- on them — Discover's candidate filter, /founders/:id, circles ranking, and the public "Trust Score"
-- display all still read trust_score exactly as before, unaffected by this migration. Remapping any of
-- those onto moderation_events is explicit, separate, later work.
--
-- Schema is intentionally a superset of what A22 populates (weight/active/expires_at/reversed_at/
-- reversed_by exist but nothing yet derives a standing value from them, or reverses/expires an event) —
-- so that later work (deriving standing, admin reversal, expiry) does not need another migration.
--
-- DEPLOY ORDER: apply before deploying the server code that depends on it (same posture as 021/022/024).
-- Purely additive: no column dropped/retyped, no existing row modified, safe to re-run (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS moderation_events (
  id                       bigserial PRIMARY KEY,
  user_id                  text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type               text NOT NULL,             -- 'report_corroborated' for A22; open for future types
  weight                   int NOT NULL DEFAULT 0,     -- not consumed by anything yet — see header
  source_id                text,                       -- e.g. the reports.id this event derives from
  actor_id                 text,                       -- who caused it (the reporter here); null for system events
  reason                   text,
  review_count_at_creation int,
  avg_rating_at_creation   numeric,
  active                   boolean NOT NULL DEFAULT true,   -- false once reversed or expired (unused by A22)
  expires_at               timestamptz,                     -- unused by A22 (no expiry policy decided yet)
  created_at               timestamptz NOT NULL DEFAULT now(),
  reversed_at              timestamptz,                     -- unused by A22 (no reviewer workflow exists yet)
  reversed_by              text
);
CREATE INDEX IF NOT EXISTS moderation_events_user_id_idx ON moderation_events(user_id);
-- Idempotency / defense in depth: a given report can back at most one event of a given type. Not
-- structurally reachable today (POST /api/report already dedupes one ordinary report per (reporter,
-- target) via migrations/024's reports_ordinary_dedup_uidx, so the code path that would create this
-- event runs at most once per report) — kept anyway, the same belt-and-suspenders posture as the rest
-- of this audit.
CREATE UNIQUE INDEX IF NOT EXISTS moderation_events_source_uidx
  ON moderation_events (event_type, source_id) WHERE source_id IS NOT NULL;
ALTER TABLE moderation_events ENABLE ROW LEVEL SECURITY;

-- Make PostgREST notice the new table immediately instead of on its next periodic schema-cache refresh.
NOTIFY pgrst, 'reload schema';
