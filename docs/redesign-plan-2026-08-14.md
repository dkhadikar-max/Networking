# BYN Website Redesign — Current-State Audit + Screen-by-Screen Plan

Checkpoint document, produced before any redesign code changes, per the CTO directive of 2026-08-14. Grounded entirely in the current `frontend/` codebase (Next.js 16.2.6, App Router, React 19, Tailwind v4) — not assumptions.

---

## 1. Confirmed current state

**Stack (frontend):** Next.js 16.2.6, deployed as its own Railway service (Dockerfile + `frontend/railway.toml`), separate from the Express API (`server.js`, root `railway.toml`/`nixpacks.toml`).

**Design tokens already exist and already match the directive** — `frontend/app/globals.css` defines `--primary: #157A6E` (teal), `--accent: #F4A259` (peach), warm off-white surfaces, a full shadow/radius/easing scale. This is a real foundation, not a blank slate — the redesign should extend these tokens, not replace them.

**Logo:** real asset at `frontend/public/assets/logo.png`, referenced correctly across the app. Keep as-is per directive.

**✅ P0 RESOLVED — live frontend confirmed by hitting production, not by assumption.**

Loaded `https://buildyournetwork.online` and `https://buildyournetwork.online/linkedin-alternative` in a live browser and inspected the actual served HTML:
- Both pages load `/_next/static/chunks/*.css` and `/_next/static/media/*.woff2` — Next.js build output.
- Rendered copy matches `frontend/app/page.tsx` and `frontend/app/(seo)/linkedin-alternative/page.tsx` verbatim (headline, Sarah Kim/James Miller/Aisha Lopez mock cards, demo scenes, FAQ text).
- `server.js` (the Express service) has **no route serving `/`** at all — grepped for every form of `app.get('/', …)` and found none. It only mounts `/uploads`, `/js`, `/apk`, and a set of explicitly-named SEO slugs via its own `sendSeoPage()` helper, which is a separate, overlapping-but-different page set from the Next.js `(seo)` routes.

**Conclusion: `frontend/` (Next.js, deployed as its own Railway service) is the canonical, live implementation of the homepage and all SEO pages.** `public/*.html` at the repo root (index.html, webapp.html, admin.html, the `*-alternative.html` / `networking-for-*.html` files) is **legacy/orphaned — not serving live traffic**. Per your instruction, treating it as legacy infrastructure and **not touching it** in this redesign. (Worth a separate cleanup pass later to avoid confusion, but out of scope here.)

All redesign work below targets `frontend/` only.

---

## 2. Screen inventory — reuse / modify / rebuild

| Screen | File(s) | Current state vs. directive | Verdict |
|---|---|---|---|
| **Homepage** | `app/page.tsx` (834 lines, inline `LANDING_CSS`) | Textbook "AI-generated startup landing page": giant marketing H1, a fake CSS-drawn phone mockup with **invented** profile names (Sarah Kim, James Miller…), a hand-animated CSS "demo" instead of real screenshots, generic 3-card feature/steps/diff grids, heavy paragraph copy. Violates §1, §2, §3, §7, §8 of the directive directly. | **Rebuild** |
| **Discover / decision card** | `components/discover/SwipeCard.tsx` | Already strong: intent banner up top, "Why you matched" reasoning block, trust score + verified badge, drag-to-swipe with rotation and live CONNECT/SKIP labels, real photo carousel. This is close to what the directive is asking the *homepage* to show. | **Polish only** (spacing/typography pass to match new visual system) |
| **Match state** | `components/discover/MatchModal.tsx` | Real connection-state UI, spring-animated avatars, clear CTA to message. Solid. | **Polish only** |
| **Profile** | `components/profile/ProfileView.tsx` | Hero card, verified badge, intent pill, "building" / trust score — matches directive §11 structure already. | **Polish only** |
| **Circles** | `components/circles/CirclePostCard.tsx`, `ComposePost.tsx`, `CreateGroupModal.tsx`, `LinkPreviewCard.tsx` | Real, implemented: like/collaborate actions, structured meta tags (Looking for / Building / Open to), timestamps, edit window. Matches directive §14. | **Polish only** |
| **Onboarding intent step** | `components/onboarding/IntentSelector.tsx` | Already intent-first: 10 labeled intents with icon + one-line description, multi-select grid. Matches directive §13. | **Polish only** |
| **Nav (desktop)** | `components/layout/DesktopNav.tsx` | Discover · Circles · Likes · Chat · Profile + sign out. | **Minor edit** |
| **Nav (mobile bottom)** | `components/layout/BottomNav.tsx` | Same 5 tabs. Directive §10 specifies Discover · Circles · Opportunities · Messages · Profile — see Opportunities note below. | **Minor edit** |
| **Opportunities** | `app/opportunities/page.tsx`, `components/opportunities/OpportunityCard.tsx`, `OpportunityFeed.tsx`, `CollaborationRequest.tsx` | **Not implemented.** The page is a 3-line stub (`return null`); all three components are empty files. This is scaffolding from the original rebuild commit that was never filled in. | **Out of scope** — do not design or ship UI for a feature that doesn't exist. Flagging separately, not folding into this redesign. |

---

## 3. What this means for the 20-point directive

- **§1–§4 (hero, realism, discovery moment):** The fix is almost entirely a **homepage** problem. The actual Discover card the directive describes ("LOOKING FOR 🎬 Video Editor... [Pass] [Connect]") already exists in `SwipeCard.tsx` — the homepage just needs to *show that real component's output* instead of a hand-drawn imitation with fake names.
- **§8 (real product screenshots):** Requires either live screenshots of the real app (Discover, Profile, Circles, Chat) or clearly-labeled demo data — see Open Question 2 below, since I can't create accounts or enter credentials on your behalf.
- **§9 (interaction design):** `SwipeCard.tsx` already has real drag physics or physics, `MatchModal.tsx` already uses spring transitions — mostly a spacing/consistency pass, not new engineering.
- **§10 (nav):** Directive wants Opportunities in the tab bar; the feature doesn't exist. Recommend keeping the current 5 tabs (Discover · Circles · Likes · Chat · Profile) rather than adding a nav item that leads nowhere.
- **§13 (intent as visual language):** Already present in onboarding and Discover; homepage should borrow the same `LOOKING FOR` / `OFFERING` / `BUILDING` chip language instead of inventing new marketing copy.
- **§15 (opportunities section):** Cut from this pass. Can be designed once the feature is actually built.
- **§7 (reduce text ~60%):** Homepage currently has an "About BYN" knowledge-base block, 8-question FAQ, and multiple paragraph-heavy sections. Some of this exists for SEO (matches `docs/` growth strategy), so cuts need to preserve indexable content — likely move dense copy below the fold / into the SEO subpages that already exist (`app/(seo)/*`), and keep the top of the homepage lean.

---

## 4. Proposed sequencing

1. **Settle the two-frontend question** (below) — confirms scope.
2. **Homepage rebuild** — hero showing the real Discover card, real-screenshot section, trimmed copy, existing nav simplified. Biggest lift, biggest visible change.
3. **Polish pass on in-app screens** — Discover, Profile, Circles, Chat, onboarding — typography/spacing/motion consistency with new system, no rebuilds.
4. **Nav cleanup** — confirm final 5-tab set.
5. **Test at 390×844 and 1440px** in the live preview before/after each phase.
6. **Side-by-side comparison** against current production for your review.
7. **Iterate** on your feedback.

---

## 5. Decisions confirmed (2026-08-14)

1. **Live frontend** — resolved above: `frontend/` (Next.js) only. `public/*.html` untouched.
2. **Demo account** — approved. You are creating a dedicated synthetic BYN account (real signup flow, believable-but-fake data: photo, name, profession, intent, offer, verification state, a few discovery cards, Circle activity, a match, a sample conversation). I will not create the account or handle your personal credentials — I'll only use the demo login you hand me, to view/screenshot the real product UI.
3. **SEO copy** — approved: shorten and reposition (About BYN / networking explainer / FAQ) lower on the page, keep it server-rendered HTML (Next.js `page.tsx` already renders this server-side — no client-only hiding), don't delete it.
4. **Opportunities** — confirmed out of scope entirely. No cards, feed, nav entry, or copy referencing it. Also holding the line on: no new matching mechanics, no new nav destinations, no fictional social proof, no fake user activity beyond the clearly-synthetic demo account itself.
5. **Scope discipline** — this phase is presentation of the existing product, not new functionality. Every screenshot/CSS demo currently on the homepage gets replaced with the *actual* rendered output of `SwipeCard.tsx`, `ProfileView.tsx`, `MatchModal.tsx`, `CirclePostCard.tsx`, and `ChatWindow.tsx` — nothing invented.

---

## 6. Approved homepage hierarchy

```
HERO
  ↓
REAL PRODUCT EXPERIENCE      ← replaces the current fake phone-mockup + CSS "demo" scenes
  ↓
WHY BYN                      ← trimmed version of current "Why This Is Different" (3-card diff section)
  ↓
DISCOVERY / INTENT           ← intent-as-visual-language block (LOOKING FOR / OFFERING / BUILDING chips), sourced from real intent taxonomy in IntentSelector.tsx / formatIntent()
  ↓
REAL PRODUCT SCREENS         ← Discover, Profile, Circles, Chat — 3–4 real captured screens, device-frame optional
  ↓
TRUST / PRIVACY              ← keep existing 4-card trust grid, reword to be visual/checklist per directive §12
  ↓
CIRCLES                      ← current "Circles showcase" section is already close to real (mirrors CirclePostCard markup) — swap in an actual captured post once demo data exists
  ↓
SEO CONTENT                  ← About BYN + networking explainer + FAQ, shortened, moved here, still server-rendered
  ↓
FINAL CTA
```

**What this drops from the current page:** the fake phone-mockup hero visual, the hand-animated CSS "demo" scenes (Priya Sharma / Sarah Kim / James Miller / Aisha Lopez are not real users), the separate "Features" 3-card grid and "How It Works" 3-step grid (their content folds into WHY BYN + DISCOVERY/INTENT to cut redundant copy per directive §7), and the "App Preview" mini-phone section (superseded by the real REAL PRODUCT SCREENS section). The "Download"/install-steps section (real — there is a real APK at `public/apk/BuildYourNetwork.apk`) stays but shrinks, folded near the final CTA rather than as its own heavy section.

---

## 7. Desktop layout (1440px)

- Hero: two-column, left = headline + one-line subhead + CTA pair, right = one real captured Discover card at near-native size (not a phone-frame illustration — a card, the way it actually renders in the app), subtle shadow/depth per directive §4.
- Real Product Screens section: 3–4 column grid of captured screens (Discover / Profile / Connection / Conversation), each with a one-line caption, no forced device frames unless a frame genuinely improves hierarchy (directive §8 explicitly allows skipping frames).
- Trust and Circles sections: keep current grid layout patterns (they're already token-consistent), just reduce copy density and swap any invented example content for the real demo account's data once captured.

## 8. Mobile layout (390×844, designed first)

- Hero stacks: headline → subhead → CTA pair (full-width, thumb-reachable) → real Discover card below, cropped to show the top of the card (intent banner + identity + why-matched) so the fold doesn't cut off mid-sentence.
- Real Product Screens section becomes a horizontal snap-scroll row of captured screens (one thumb swipe = one screen), not a squeezed 4-column grid.
- Bottom-nav-style tab bar (Discover · Circles · Likes · Chat · Profile) is an in-app pattern already implemented in `BottomNav.tsx` — the marketing site itself doesn't need its own bottom nav; `MobileNav.tsx` (hamburger) already exists for the site header and stays.

## 9. Motion / interaction spec

Reuse what's already defined in `globals.css` rather than inventing a new motion system:
- Existing durations (`--duration-fast: 150ms`, `--duration-normal: 200ms`) and easings (`--ease-spring`, `--ease-smooth`) apply to hover/press states site-wide — no new curves.
- Button hover: subtle elevation + color shift (already the pattern in `.btn-primary:hover` — `translateY(-2px)` + shadow growth). Keep.
- Card hover (marketing site's screen captures): subtle elevation only, no rotation/parallax — the *real* tactile rotation/drag physics belongs to the actual Discover card in-app (`SwipeCard.tsx`), not to a static screenshot on the marketing page.
- Section entrance: keep the existing IntersectionObserver fade-up (`LandingClient.tsx`) — it's restrained (24px translate, 0.6s) and already respects `prefers-reduced-motion`. No new scroll-jacking or parallax per directive §9.
- Drop: the hand-built `demoScene1/2/3` keyframe animation system (200+ lines of CSS in `page.tsx`) once it's replaced by real captured screens — those don't need to "animate through" fake states.

## 10. SEO preservation plan

- `About BYN`, the networking explainer paragraph, and the 8-question FAQ move down the page (per hierarchy above) but stay in `page.tsx`'s server component — no client-side lazy loading or collapse-on-load that would hide them from crawlers.
- `<details>/<summary>` FAQ markup (current implementation) stays — it's native, indexable, and already accessible.
- JSON-LD (`Organization`, `WebSite`, `SoftwareApplication`) block at the bottom of `page.tsx` is untouched.
- Internal links to the SEO subpages (`/networking-for-founders`, `/linkedin-alternative`, etc.) stay, just visually restyled to match the new system.
- `metadata.alternates.canonical` stays pointed at the apex domain — confirmed correct now that we know the apex *is* the Next.js deployment.

---

## 11. Status — Phase A/B/C structural implementation complete, awaiting demo account for final data swap

Per your instruction not to let the demo account block structural work, implementation has started:

**Done (2026-08-14):**
- Phase A (foundation): `app/page.tsx` rebuilt on the new hierarchy, the 200+ lines of fake `demoScene1/2/3` CSS removed, design tokens de-duplicated (page no longer redefines its own `:root` palette — uses `app/globals.css` tokens directly), JSON-LD/canonical/metadata untouched.
- Phase B (product-first hero): hero right column now renders the **real** `SwipeCard` component (`components/discover/SwipeCard.tsx` — the literal file used in the live app), not a CSS mockup.
- Phase C (product proof): "Real Product Screens" section renders the **real** `ProfileView` component; a same-classes static reuse of the match-state visual (`MatchPreview`) and conversation bubbles (`ConversationPreview`) — the live `MatchModal`/`ChatWindow` components fire network requests on mount/interaction that aren't safe to run for anonymous marketing-page visitors, so those two are pixel-matched static reproductions of the real CSS/markup rather than the live components, clearly commented as such in code. The Circles section renders the **real** `CirclePostCard` component.
- All product-preview components feed from `components/landing/samples.ts` — one clearly-commented file of illustrative sample data (no photo, no invented match/trust score, no "verified" claim), swappable in one place once the demo account exists.
- Trust/Privacy section rewritten as a verified checklist — every bullet cross-checked against a real `server.js` endpoint (`/api/me/privacy`, `/api/admin/verify`, `/api/report`, `/api/block`) before being claimed.
- Nav updated to Discover / Circles / How it works / Log in / Join free per directive §10 (Opportunities excluded).
- Verified in a live dev server: no console errors, no layout overflow at 375px, 390×844, 768px, and 1440px.

**Not yet done:**
- Swap `components/landing/samples.ts` placeholder data for the real captured demo-account content once you provide it.
- Polish pass on in-app screens themselves (Discover/Profile/Circles/Chat) — homepage only so far.

## 12. Phase F QA results (2026-08-14)

Two real bugs found and fixed during QA, not before:
1. **Hydration mismatch** — `CirclePostCard`'s real `timeAgo()` helper renders "time ago" text computed from `Date.now()` at render time. That's fine inside the live app (always client-rendered post-login), but on the server-rendered marketing homepage, the server's render pass and the client's hydration pass compute it independently, at different real moments (the gap grew to 44–46 minutes in one dev-server case), so the text diverges and React discards/regenerates the tree. Making `created_at` a fixed timestamp (my first attempt) didn't fix this — the mismatch is inherent to rendering *any* relative-time text across an SSR/hydration boundary, not particular to how `created_at` is computed. Actual fix: `CirclePreview` is now loaded via `next/dynamic(..., { ssr: false })` (through a small client-only wrapper, `CirclePreviewClient.tsx`, since `ssr:false` can't be called directly from a Server Component) — it renders client-side only, so there's no server-rendered version to conflict with. A `minHeight` on its container avoids a layout-shift gap while it mounts.
2. **Fabricated-looking "Trust 0" badge** — the sample profile had `trust_score: 0`, which `SwipeCard` rendered as a literal "Trust 0" badge — a worse look than no badge, and not something I'd intended to claim. Fixed: `trust_score` is now omitted from the sample so no badge renders in `SwipeCard`/`ProfileView` (both null-guard it); `CirclePostCard` renders it unconditionally, so there it's set to match the sample's own `profile_score` (90) rather than left at a stray 0.

Checked and passing:
- **Broken links** — every internal `href` on the page cross-checked against real routes in `app/`: all 16 resolve (`/discover`, `/circles`, `/login`, `/signup`, all 8 SEO subpages, `/about`, `/contact`, `/privacy`, `/terms`) plus all 4 in-page anchors (`#hero`, `#screens`, `#circles`, `#faq`). Zero broken.
- **Metadata / canonical / structured data** — canonical tag, title, meta description, and JSON-LD all present and the JSON-LD parses validly.
- **Keyboard/a11y structure** — 46 interactive elements on the page, zero with an incorrect `tabindex="-1"`; the global `:focus-visible` outline rule (from `globals.css`) is present in the cascade.
- **Reduced motion** — `@media (prefers-reduced-motion: reduce)` covers the new `.animate`/`.logo-img` rules, in addition to the existing global rule in `globals.css`.
- **TypeScript** — `tsc --noEmit` clean across the whole frontend.

**Could not verify in this session (tooling limitation, not skipped by choice):** this session's browser pane isn't compositing frames (screenshots and some resize calls fail/time out with "pane not displayed"), so I could not do actual pixel-level visual QA, real Tab-key traversal, or Lighthouse/Core Web Vitals — there's no Lighthouse runner available and the sandboxed shell can't reach the dev server's port to run one via CLI either. Only one browser engine (Chromium) is available to me — no real Safari. These need a manual pass by you (or a session where the pane renders) before this ships.
