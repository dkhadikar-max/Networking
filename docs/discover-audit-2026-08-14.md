# Phase 4 — Discover UI/UX Audit

No code changed in this pass. Grounded entirely in the current implementation:
`app/(app)/discover/page.tsx` → `DiscoverFeed.tsx` → `SwipeCard.tsx` / `MatchModal.tsx` / `DiscoverFilters.tsx`, styled by `app/(app)/app.css`, shelled by `app/(app)/layout.tsx` (`DesktopNav` + `BottomNav`).

I could not log in as a real user in this session (no demo account yet — same constraint as the homepage phase), so "running application" behavior below is traced from the actual fetch/state code paths in `DiscoverFeed.tsx`, not click-tested. Flagged explicitly wherever that matters.

---

## A. Current-state audit — the full journey

**Entry.** `/discover` → `DiscoverFeed` mounts → `load(true)` fires immediately (`app/(app)/discover/page.tsx:4`, `DiscoverFeed.tsx:110`). No skeleton — see Loading below.

**Loading.** `loading && !current` → centered `.spinner` (a bare 28px spinning ring, `app.css:589`) in an otherwise empty `.disc-empty` container. No skeleton card, no placeholder shape.

**Discovery card composition** (`SwipeCard.tsx`), top to bottom:
1. Intent banner — full-width, teal gradient, uppercase (`.card-intent-banner`)
2. Identity row — avatar (photo or initials) + name + headline/location, trust cluster top-right (Verified badge, match %, trust score)
3. "Why you matched" — up to ~5 bullet reasons, real and backend-computed (`getMatchReasons()`, `server.js:3323`) — see note below, this is a genuine strength
4. Scrollable body: Building → Looking for → Bio → **Photo(s)** → Skills → Interests
5. Sticky action row: Skip / Priority (only if `uid` present) / Connect

**Intent visibility.** Strong — it's literally the first thing rendered, a full-width colored banner, not a small tag buried in metadata.

**Profile photo treatment.** Deliberately *not* first. Photo comes after "Why you matched," "Building," "Looking for," and bio — behind substance, not in front of it. This is a real, working expression of "context before connection" (matches the homepage directive's §3), not an oversight — worth protecting, not "fixing."

**Trust-score presentation.** Three signals stacked top-right of the identity row: a "✓ Verified" pill (only if `identity_verified`), a match-% pill (gradient, always shown if `match_score` present), and a trust pill (`✓ Trusted` if ≥70, else `Trust {n}`). All three competing for the same visual corner.

**"Why you matched."** Backed by `getMatchReasons()` — same city, same/complementary intent, shared skills, shared interests, exploring↔building overlap (`server.js:3323-3359`). This is real, not decorative, and populates whenever the other user has set an intent (a required, gated field — see Trust below) — so it's rarely empty in practice.

**Primary vs. secondary actions.** Three buttons, equal visual weight: Skip (neutral), Priority (gold gradient, only when `uid` exists), Connect (teal gradient). Priority sits between Skip and Connect — a paid upsell action given the same button size and row position as the two core actions.

**Swipe physics.** Real, not decorative: `touchmove` tracks `dx/dy`, rotates the card (`dx * 0.04deg`), fades in CONNECT/SKIP corner labels past a 20px threshold, commits past an 80px threshold with a fly-out animation, snaps back otherwise (`SwipeCard.tsx:65-109`). This already does what the homepage now visually promises.

**Touch targets.** Action buttons: `padding: 10px 8px` + text/icon, roughly 40-44px tall — borderline-acceptable, not generous. Photo nav dots use an explicit 28px invisible touch target around a 6px visual dot — correctly done. Skip/Connect share screen width three ways with Priority, so each is materially narrower on small screens than a 2-button row would allow.

**Animation/motion.** Swipe rotation/fly-out (SwipeCard), spring-in avatars + delayed reveals (MatchModal), bottom-sheet spring for Filters (DiscoverFilters). All framer-motion or transform-based, no `prefers-reduced-motion` guard on any of the three — `app/globals.css`'s blanket reduced-motion rule (`animation-duration: 0.01ms !important`) does cover the CSS-keyframe pieces but **not** the framer-motion `transition={{ type: 'spring', ... }}` calls, which framer-motion doesn't auto-disable.

**Loading states.** One state only — spinner, no skeleton, no per-action loading distinction beyond the Connect button's own inline spin-replace (`connecting` state, `SwipeCard.tsx:282-288`, which is well done).

**Empty states.** Three, correctly differentiated by cause:
- `NO_PHOTO` → "Add a photo…" + CTA to `/profile`
- `TRUST_TOO_LOW` → "Set your networking goal…" + CTA to `/profile`
- Exhausted (no more profiles) → "You've seen everyone nearby" + CTA to `/circles` + "Refresh"

All three share the same `.disc-empty` shell and are genuinely distinct, well-written, and actionable — this is already good work.

**Error states.** ⚠️ Not actually distinct. A generic fetch failure (network error, 500, anything that isn't the two known error codes) falls into the `else` branch of `load()`'s catch (`DiscoverFeed.tsx:101-103`): shows a toast ("Failed to load profiles") and nothing else — `current` stays `null`, `blockReason` stays `null`, so the UI renders the **exhausted** empty state ("You've seen everyone nearby for now — check back later"). A user who hit a real connectivity/server error sees the same message as someone who's genuinely out of profiles, with no retry affordance beyond the generic "Refresh" button borrowed from the wrong state. There's also `app/(app)/error.tsx`, a route-level boundary — but that only catches render-time throws, not this handled-and-swallowed fetch failure.

**Accessibility.** Skip/Connect/Priority are real `<button>` elements (good). No `aria-label` on the icon-only photo-nav buttons or the swipe-indicator overlays (`aria-hidden` is correctly set on those, though, so that's fine). No live-region announcement when a card is removed/replaced — a screen-reader user gets no signal that the "next card" swap happened. The whole swipe gesture has no keyboard equivalent — Skip/Connect buttons are the only accessible path, which is actually fine as a fallback, but isn't obviously discoverable as *the* way to do it via keyboard since there's no visible focus order hint on card entry.

**Mobile 390×844.** `.disc-header` + `.card-stack-area` stack correctly; `.swipe-card` sizes to `calc(100% - 28px)` up to 420px max. `BottomNav` is fixed at the bottom (hidden only inside an open chat thread). No horizontal overflow risk given the flex/percentage sizing.

**Desktop 1440px.** Not a 2-column layout despite `.discover-wrap`/`.discover-left` class names implying one — those two classes carry **zero CSS rules** (grep confirms only one mobile-only override on `.discover-left`, `app.css:723`). The whole app shell is capped at `max-width: 1440px` with a 220px left sidebar (`DesktopNav`) and the Discover column filling the rest — but the actual card stays capped at `max-width: 456px` (`app.css:719,732`) centered in that column. On a real 1440px display that's roughly **700px+ of dead horizontal space** on either side of a single card, doing nothing. `.disc-logo` (the "BYN" wordmark) is `visibility:hidden` on desktop rather than removed, so it silently keeps taking up flex space to push the filter button right (documented in a code comment, intentional, not a bug — but a bit fragile).

**Visual consistency with the new homepage.** Same design tokens (both read from `app/globals.css`), so colors/shadows/radii already match. The homepage's product-preview cards (`ProfilePreview`, `DiscoverPreview` etc.) literally render this same `SwipeCard`/`ProfileView`/`app.css`, so there is zero visual drift between "what the homepage promises" and "what the app delivers" — that was the whole point of Phase 3, and it holds up under this audit.

---

## B. Critical UX problems, ranked

**P0 — must fix**
1. **Generic errors masquerade as "you're out of profiles."** A real fetch failure and genuine exhaustion render identical copy and the same "Refresh" CTA. A user with a flaky connection gets told they've "seen everyone nearby" — false, discouraging, and untraceable without opening devtools.
2. **Desktop wastes the majority of the viewport.** A single ~456px card centered in a ~1180px content column leaves the largest, most valuable screen real estate doing nothing. This isn't "matching Bumble" — it's under-using desktop at all, on a product whose stated edge (intent, trust, why-matched context) has *more*, not less, to say per profile than a dating-app card does.
3. **Trust-signal crowding.** Verified badge + match % + trust score all compete in one small top-right cluster on the identity row. Three different numeric/badge signals in ~120px of width is hard to parse at a glance — works against "immediate comprehension."

**P1 — should fix**
4. **No skeleton loading state.** A bare spinner on first load (and on every subsequent page-fetch trigger, since `loading` flips true again inside `load()`) is a missed opportunity to preserve layout and perceived speed — especially since the card shape itself is fixed and easy to skeleton.
5. **Priority sits at equal visual weight with Skip/Connect.** A monetization upsell action occupies the same row, same size, as the two core decisions. It measurably competes with Connect for thumb real estate and attention on the single most important interaction in the product.
6. **Framer-motion animations bypass `prefers-reduced-motion`.** The CSS-based reduced-motion rule doesn't touch framer-motion's own transition engine (MatchModal, DiscoverFilters). Anyone with the OS setting enabled still gets full spring animations there.
7. **No live-region for card transitions.** Screen-reader users get no announcement when a card is skipped/connected and replaced.

**P2 — worth doing**
8. Photo-nav buttons and a few icon-only controls lack `aria-label`.
9. `.discover-wrap`/`.discover-left` are functionally dead CSS class names (all real layout is inline styles or `.app-views`/`.card-stack-area`) — harmless today, but misleading for whoever edits this next.
10. `components/layout/Sidebar.tsx` is unused dead code (superseded by `DesktopNav.tsx`) — unrelated to Discover UX directly, flagging since I found it while auditing the shell.
11. Touch targets on the 3-button action row are adequate but not generous, and get proportionally worse per-button the more buttons are in that row (relevant if P1 #5 is addressed by *adding* rather than *removing* visual weight for Priority).

---

## C. Specific redesign recommendations

- **Fix the error/exhausted conflation first** (P0-1): give `load()` a third, real error state (`blockReason`-style flag, e.g. `'FETCH_ERROR'`) with its own copy ("Couldn't load profiles — check your connection") and a genuine retry action, distinct from "you're caught up."
- **Give desktop a reason to be desktop** (P0-2): not a second unrelated panel bolted on, but content that's already implicit in the data — e.g. expand "Why you matched" and Building/Looking-for into a persistent side panel next to the card at ≥1024px, rather than requiring a scroll inside the card. This uses the extra width to show *more of the same real information*, not new invented features.
- **Consolidate the trust cluster** (P0-3): one visual unit instead of three competing badges — e.g. a single line ("92% match · Verified · Trust 88") or a compact combined chip, ranked by what actually drives the decision (match relevance first).
- **Skeleton card on loading** (P1-4): reuse `.swipe-card`'s exact shape with shimmer placeholders instead of a bare spinner.
- **De-emphasize Priority** (P1-5): move it off the primary action row — a smaller icon-affordance near the card edge, or a secondary reveal — so Skip/Connect are unambiguously the two decisions being made.
- **Respect reduced motion in framer-motion** (P1-6): read `useReducedMotion()` (framer-motion's own hook) in `MatchModal` and `DiscoverFilters`, drop transition durations to ~0 when true.
- **Add a live region** (P1-7): `aria-live="polite"` announcing "Showing next profile" or similar on card swap.

---

## D. Components that can be reused as-is

- `SwipeCard.tsx` — core structure, swipe physics, and information hierarchy are sound. Needs the trust-cluster consolidation and Priority de-emphasis, not a rebuild.
- `MatchModal.tsx` — solid motion/structure; deep content change ("show *why* the match makes sense," per your Phase 4 priority #3) is its own later phase, not part of this Discover pass.
- `DiscoverFilters.tsx` — well-built bottom sheet, multi-intent selection, sensible defaults and hints. No changes needed for this phase.
- Empty-state copy for `NO_PHOTO` / `TRUST_TOO_LOW` / exhausted — keep verbatim, just add the missing fourth (fetch-error) state alongside them.
- `getMatchReasons()` / `getInsight()` (`server.js`) — real, working, no changes needed.

## E. Components requiring modification

- `DiscoverFeed.tsx` — add the distinct fetch-error state; no other structural changes.
- `SwipeCard.tsx` — trust-cluster consolidation, Priority button repositioning, `aria-label`s on photo-nav controls, live-region announcement hook.
- `app/(app)/app.css` — desktop layout for the (new, info-reuse-only) side panel at ≥1024px; skeleton-card styles; either give `.discover-wrap`/`.discover-left` real rules or drop them in favor of the inline-style approach already in use (pick one, stop straddling).
- `MatchModal.tsx`, `DiscoverFilters.tsx` — reduced-motion guard only, for this phase.

## F. Proposed Discover layout (desktop, ≥1024px)

```
┌───────────┬──────────────────────────────┬───────────────────────┐
│  Sidebar  │         Discovery card        │   Context panel       │
│ (220px,   │     (max-width ~456px,        │   (fills remaining    │
│  existing)│      centered, unchanged      │    width)             │
│           │      structure/physics)       │                       │
│           │                                │  · Why you matched    │
│           │                                │    (full reasons list,│
│           │                                │    not truncated)     │
│           │                                │  · Building / Looking │
│           │                                │    for, full text     │
│           │                                │  · Skills & interests │
│           │                                │    as the real chips  │
└───────────┴──────────────────────────────┴───────────────────────┘
```
No new data, no invented sections — this panel mirrors content already inside the scrollable card body today, just given room to breathe instead of competing for card height. Below ~1024px, it collapses away entirely and the card returns to today's single-column behavior (unchanged).

## G. Mobile layout (390×844)

Unchanged structurally — it already works. Two concrete additions:
- Replace the bare spinner with a skeleton card shape on load.
- Move Priority off the 3-button row (frees width for Skip/Connect, which become the only two buttons in that row on mobile).

## H. Interaction/motion specification

- Keep existing swipe physics exactly (rotation, threshold, fly-out) — this is already the "tactile interaction" the homepage now promises; don't touch it.
- Card-swap transition: keep current instant-replace (via `key={getUid(current)}` remount) — no new animation needed, adding one risks slowing down the core loop.
- MatchModal / DiscoverFilters: add `useReducedMotion()` branch; when true, set spring transitions to `{ duration: 0 }`.
- Skeleton shimmer: reuse the existing `shimmer` keyframe already defined in `app/globals.css` (`animate-shimmer`), don't add a new one.

## I. Accessibility requirements

- `aria-label` on photo prev/next tap zones and dot buttons.
- `aria-live="polite"` region announcing card changes (skip/connect/next).
- Verify focus lands sensibly after a card swap (currently untested — no demo account to click through with a screen reader/keyboard in this session; flag for manual QA once available).
- Reduced-motion coverage extended to framer-motion transitions (per H above).

## J. Acceptance criteria

A change in this phase is done when:
1. A simulated fetch failure (e.g. offline) shows distinct "couldn't load, try again" copy — never the "you've seen everyone" message.
2. At 1024px+ width, the context panel shows real match-reason/building/looking-for content already present in the API response — no new fields, no invented copy.
3. Skip and Connect are the only two buttons at equal visual weight on the primary action row at all breakpoints; Priority is visually secondary.
4. `prefers-reduced-motion: reduce` measurably shortens/removes MatchModal and DiscoverFilters spring transitions (verified via `useReducedMotion()`, not just the existing CSS blanket rule).
5. Photo-nav controls have `aria-label`s; card swap fires a live-region announcement.
6. `tsc --noEmit` clean, production build succeeds, no console errors — same bar as the homepage checkpoint.
7. The five-question test holds: on the card alone (no side panel needed, since side panel is a desktop-only enhancement), a new viewer can answer *who is this person, what are they looking for, why am I seeing them, what can I offer, what happens if I connect* — all five are already answerable today from the card's existing structure (intent banner → identity → why-matched → building/looking-for → skills/interests → Connect button leading to MatchModal). This phase should not regress any of that while fixing B/1-3.

---

## Not touched, and why

- **Opportunities** — confirmed still an unbuilt stub (`app/opportunities/page.tsx` returns `null`; `OpportunityCard/Feed/CollaborationRequest.tsx` are empty files). Excluded, as instructed.
- **Match content redesign** ("show why the connection makes sense") — that's Phase 4 priority #3, its own audit, after Discover and Profile. This audit only covers Match as the *terminal step* of the Discover journey, not a redesign of the modal's content.
- **Real click-through/screen-reader testing** — blocked on the same demo-account dependency as the homepage phase. Everything above is traced from the actual code paths, not observed live; flagged wherever that distinction matters.
