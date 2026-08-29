# Phase 4 — Profile UI/UX Audit

No code changed in this pass. `ProfileView.tsx` not touched.

Grounded in: `components/profile/ProfileView.tsx` (full read), `components/ui/ProfileDrawer.tsx`, `components/ui/ProfileModal.tsx`, `context/ProfileDrawerContext.tsx`, `app/(app)/profile/page.tsx`, `app/(app)/profile/[id]/page.tsx`, `app/(app)/app.css` (profile-\* rules), and the relevant `server.js` endpoints (`/api/profiles/:id`, `cleanPublic()`, `buildReviewSummary()`, review/works schema in `supabase_schema.sql`). One live, throwaway render check (`ProfileView` mounted with local sample data, no auth/backend involved) was used to measure actual widths at 390/768/1440 and confirm the duplication finding below — built and deleted in this session, not part of any diff.

Each finding below is labeled **Observed** (verified in code or the live render), **Recommendation** (my proposal), or **Inference** (reasoned but not directly verifiable without the demo account/real users).

---

## A. Current-state inventory

Profile is not one screen — it's **three separate implementations** that don't agree with each other:

| Surface | Component | Reached from | Notable |
|---|---|---|---|
| Full profile (self) | `ProfileView.tsx` (`isSelf`) | `/profile` tab | Edit, Go Pro, Sign out (mobile), Delete account |
| Full profile (other) | `ProfileView.tsx` | `/profile/[id]` — from Circles author tap, Notifications, or the drawer's "View full profile" link | Connect, Priority |
| Quick-view drawer | `ProfileDrawer.tsx` (**different component**, own Tailwind-based markup, not `ProfileView`) | Likes list, Chat header tap (`useProfileDrawer()`) | Shows trust score + "insight" line that `ProfileView` doesn't |
| Unused | `ProfileModal.tsx` | **Nowhere** — grepped the whole frontend, zero imports | Dead code |

**Observed:** Discover's `SwipeCard` never opens any of these — the card itself is the only profile presentation a user sees during discovery. There is no "Discover → tap for full profile → Connect" step today; the transition you asked me to evaluate is actually **Discover card (already contains full profile info inline) → Connect → Match → Message**. `ProfileView.tsx` sits outside that primary path entirely — it's reached from Circles, Notifications, or self-viewing your own profile.

`ProfileView.tsx` layout, top to bottom: avatar (+ photo dots, + PRO badge if self) → name + verified check → headline → location → intent chip **+ working_on**, boxed → up to 4 chips (mixed skills/interests, truncated) → *(self only)* profile-completion score bar + checklist → social icons → action row (Edit/Go Pro, or Connect/Priority) → *(if already connected)* Message button — that's the "hero." Below it, separate boxed panels repeat: About (bio) → **Working On** (verbatim repeat of the hero's working_on) → Exploring (currently_exploring, not in the hero) → **Interests** (full list, hero already showed up to 2) → **Skills** (full list, hero already showed up to 2) → *(self)* Sign out, Delete account.

## B. P0 / P1 / P2 findings

**P0**
1. **Observed — genuine content duplication.** `working_on` renders twice (hero's intent box, then the "Working On" panel, byte-for-byte identical text — confirmed in a live render, not just code reading). Skills/interests render twice (truncated 4-chip mix in the hero, then full separate lists below). This is measurable bloat, not a stylistic quibble — it's extra scrolling to reach content the viewer already saw seconds earlier.
2. **Observed — desktop layout has no width constraint.** Live-measured: at 1440px viewport, `.profile-hero` renders at **1412px wide** (768px viewport: 452px, capped correctly by the existing tablet phone-shell rule; 390px: 358px, fine). Discover's card caps at 456px and gets a dedicated context panel for the extra space (Phase 4, already shipped); Profile has no equivalent — the hero card and every panel below it just stretch edge-to-edge of the sidebar-adjusted content column. A centered-text hero card nearly 1.5x wider than Discover's card, at the same breakpoint, in the same app, is a direct visual-language mismatch with the design language you just approved for Discover.
3. **Observed — real backend trust/credibility data exists and is never shown.** `/api/profiles/:id` (`server.js:4392`) already computes and returns `trust_score` (present via `cleanPublic()`, which only strips password/email/lat-lng/role/etc. — `trust_score` survives), `review_summary` (`{count, avg_rating, top_tags}`, built from an actual peer-review system — 12 real tags like "Trustworthy," "Reliable," "Responsive," only submittable between connected users, `server.js:3180-3196`), `mutual_count`, and `is_connected`. `ProfileView.tsx` renders **none** of these. The quick-view `ProfileDrawer.tsx` shows trust score and an "insight" line that the supposedly-fuller `ProfileView` doesn't — the drawer is more informative than the full page, which is backwards.

**P1**
4. **Observed — intent is not first here, unlike Discover.** Discover's card leads with a full-width intent banner before anything else. `ProfileView`'s hero leads with photo → name → headline → location, résumé-header order, and only reaches intent after all of that. Same product, two different information priorities for the same signal.
5. **Observed — `works` (portfolio) table exists but is fully orphaned.** `server.js` returns `u.works` from `/api/profiles/:id`; the schema (`supabase_schema.sql:97`) defines title/description/url/image. But `ProfileEdit.tsx` has zero references to `works` — there's no way for any user to ever populate it. Recommending you *show* an always-empty portfolio section would be wrong; flagging it only so it isn't mistaken for "available data we forgot to surface" the way trust/reviews are. Distinct from finding #3 — reviews are reachable and real; works is inert.
6. **Inference — the "5-question test" partially fails on Profile specifically because of #1 and #4, not missing information.** Per your framing ("is this a hierarchy/density/sequencing problem, or a missing-functionality problem"): the *raw* information is already sufficient to answer "who are you / what are they doing / what are they looking for / what can they offer" — it's all present in the hero + panels. What's actually missing is "**why should I trust you**," which is a missing-functionality problem (finding #3), while the first four questions are a **hierarchy and duplication** problem, not a data problem.

**P2**
7. **Observed — `hero-intent` CSS class name is applied to `headline`, not `intent`.** Naming-only confusion in the codebase; not user-facing, flagging for whoever touches this file next.
8. **Observed — `ProfileModal.tsx` is dead code.** ~215 lines, zero imports anywhere. Not a UX issue, a maintenance one.
9. **Observed — Priority button on `ProfileView` (others' profiles) still uses the old equal-weight full-text pill** (`⚡ Priority`, same visual weight as Connect used to have pre-Discover-fix). Discover's `SwipeCard` now uses the de-emphasized `.priority-fab` icon control; `ProfileView` wasn't touched in that pass, so the two screens currently disagree on how Priority should look. Worth aligning once this phase is approved.

## C. Information hierarchy analysis

Current order optimizes for "resume skim" (photo → identity → credentials → bio → tags), not "decision support" (why should I act). Compare to Discover's now-explicit hierarchy (intent → identity+trust → why-matched → substance → action) — Profile doesn't follow that pattern at all, despite being the same product's deeper look at the same person. The duplication (#1) means the page is longer than its actual information content requires, which independently hurts hierarchy — a viewer scanning quickly hits the same fact twice before reaching new information.

**Recommendation (not yet implemented):** collapse the hero's compact preview (working_on snippet + 4 mixed chips) *or* the full panels below — not both. If the hero stays a quick preview, the panels are the "full" version and should be the only place with complete text; if the hero already shows the full text, drop the redundant panel.

## D. Intent-first analysis

**Observed:** the intent chip + working_on box is present and functionally correct, but positioned after photo/name/headline/location — the fourth thing on the page, not the first. This is a direct contradiction of the intent-first design language now established on both the homepage and Discover (both lead with intent). **Recommendation:** move intent to the top of the hero, above or beside the name — mirroring Discover's banner treatment (same visual language, not a new pattern) — so BYN's actual differentiator reads first on every core screen, not just two of three.

## E. Trust analysis

**Observed, and this is the crux of the "résumé vs. person" question:** a résumé shows self-reported claims — name, title, bio, skills, links. Everything currently on `ProfileView` for another person is exactly that category: self-reported. Verification is a single checkmark. There is no visible trust score, no peer review, no mutual-connection context — despite all three existing server-side and already being returned by the API this component consumes. This is very likely *the* concrete reason Profile reads as a résumé: **it structurally cannot show anything a résumé can't, because the one category of information that would (peer-verified trust, real review tags from real past connections) is computed and shipped by the backend but never rendered.**

**Recommendation:** surface `trust_score`, `review_summary.avg_rating` + `top_tags`, and `mutual_count` — no backend change needed, the data is already in the prop this component receives (confirmed in the `/api/profiles/:id` response shape). This is squarely "hierarchy/missing functionality on the frontend," not "invent new data" — every field named here already exists in the current API contract.

**Inference:** I can't verify how *often* real reviews exist for typical profiles (that needs live data / the demo account) — if review counts are usually 0 early in the product's life, the review section needs a defined empty state (not fabricated content), which is a design decision for implementation, not something to solve in an audit.

## F. Privacy analysis

**Observed, and this is a genuine strength worth protecting, not changing:** `cleanPublic()` strips `email`, `lat`, `lng`, `role`, `otp_code`, `push_token`, `banned` status, and login-security fields before any profile data reaches the client — confirmed at the source (`server.js:3118-3135`), not just from the frontend. `ProfileView.tsx` never attempts to render any of these (there's nothing to render — they're not in the payload). Exact location is never shown, only the free-text `location` field the user themselves wrote. This matches the "Protected contact info" claim already shipped on the homepage's Trust/Privacy section — Profile's actual behavior backs that claim up. No findings, no recommendations here — just confirming it holds.

## G. Interaction analysis

**Observed:** Connect/Priority on `ProfileView` are two full-width-ish flex buttons, same pattern Discover used *before* the Phase 4 fix (equal visual weight, no touch-target audit done here). Edit/Go Pro (self) are a similar even split. The delete-account confirmation is a solid, deliberate two-step pattern (button → inline confirm card with explicit copy, not a browser `confirm()`) — worth keeping as-is. Sign-out is correctly scoped to mobile only (desktop sidebar already has one) — good existing decision, not a finding.

**Recommendation:** once approved, align Connect/Priority's visual hierarchy with the already-shipped Discover pattern (Connect dominant, Priority a distinct smaller control) rather than inventing a new treatment for this screen.

## H. Visual-system analysis

**Observed:** same design tokens as Discover and the homepage (`var(--primary)`, `var(--card)`, shared `.chip`/`.chip-gold` classes) — no palette drift, teal/peach identity intact everywhere. The structural mismatch is layout (B-2, unconstrained desktop width) and information density (B-1, duplication), not color or typography. Typography weights/sizes are consistent with the rest of the app shell.

## I. Responsive analysis

Live-measured, real render, this session:

| Width | `.profile-hero` rendered width | Notes |
|---|---|---|
| 390px | 358px | Fine — matches app-wrap width minus padding |
| 768px | 452px | Fine — existing tablet "phone shell" rule (480px `app-wrap` cap) already applies here, inherited for free |
| 1440px | **1412px** | **Not fine** — no cap, stretches to the sidebar-adjusted content column width |

No horizontal overflow at any width (confirmed). The problem is exclusively the ≥1024px desktop range, where `DesktopNav`'s sidebar kicks in and the content column widens past what `.profile-hero`/`.profile-panel` were designed for — they have no `max-width` at all, unlike `.swipe-card`'s explicit desktop caps.

## J. Acceptance criteria (for when implementation is approved)

1. No fact appears twice in the same profile view — working_on, skills, and interests each render in exactly one place.
2. `.profile-hero` and `.profile-panel` have a defined max-width at ≥1024px, consistent in spirit with Discover's card-width treatment (doesn't need to be identical, needs to stop stretching edge-to-edge).
3. Intent renders at or near the top of the hero, not after headline/location.
4. At least trust score and review summary (when present) are visible on another person's profile — using only fields already in the current API response, zero backend changes.
5. Priority on `ProfileView` matches the visual weight established for Priority on Discover's `SwipeCard` (distinct tertiary, not equal to Connect).
6. `tsc --noEmit` clean, production build succeeds, no console errors — same bar as prior checkpoints.
7. Test 390×844, 768px, 1440px — no overflow, hero/panels appropriately capped at desktop.
8. The five-question test: a new viewer can answer who/what-they-do/what-they-want/what-they-offer *and now* why-should-I-trust-them, without any fact requiring a second scroll past something already shown.

---

## Not addressed here, and why

- **`ProfileDrawer.tsx` / `ProfileModal.tsx` reconciliation** — real finding (A, #8), but a second implementation existing alongside `ProfileView.tsx` is a separate scoping decision (delete `ProfileModal.tsx`? Unify `ProfileDrawer` with `ProfileView`'s data model?) that affects Chat/Likes, not just Profile. Flagging, not deciding, in this audit.
- **`works`/portfolio** — exists in the backend, unreachable via any UI, would require new edit-flow functionality to activate. Out of scope per "no new features."
- **Real click-through, screen reader, keyboard testing** — same demo-account gap as Discover and the homepage; everything above is code- and live-render-verified, not user-tested.

No code changed. Waiting for review before touching `ProfileView.tsx`.
