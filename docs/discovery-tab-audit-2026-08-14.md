# Discovery Tab — Full Product-Surface Audit

Audit only. No code changed. Matching logic, API, database, trust algorithm, auth, messaging, and the (uncommitted, paused) Profile implementation are all untouched.

Scope: the whole Discovery tab as a surface — not just `SwipeCard.tsx` in isolation, which the earlier Phase 4 audit/implementation already covered. This pass adds entry, filters, intent, the Discover→Profile transition, and cross-surface consistency (including against the Profile work just paused) on top of confirming the shipped Phase 4 fixes still hold.

Grounded in: `app/onboarding/page.tsx`, `app/(auth)/login/page.tsx`, `app/(auth)/verify/page.tsx`, `components/landing/LandingClient.tsx`, `components/discover/{DiscoverFeed,SwipeCard,DiscoverFilters,ContextPanel,MatchModal,SwipeCardSkeleton}.tsx`, `components/onboarding/WhyThisMatch.tsx`, `components/layout/{DesktopNav,BottomNav}.tsx`, `app/(app)/app.css`, and `server.js`'s `getMatchReasons()`/`getInsight()`/`getMatchScore` (read for context, not modified).

---

## The critical question, answered first

**Does Discovery say "here are people relevant to what you're trying to accomplish," or "here are profiles to swipe through"?**

**Mostly the former, and it's real, not marketing copy** — the intent banner leads every card, "Why you matched" is backend-computed from actual shared intent/city/skills (not decorative), and the swipe gesture is the *interaction*, not the *point* (skip/connect buttons do the same job for anyone who doesn't swipe). That's a genuine, structural difference from a dating-app clone.

**Where it slips toward "profiles to swipe through":** the decision is made with strictly less evidence than what a viewer would see if they could look at the person's full `ProfileView` — reviews, average rating, mutual connections (all real, all just shipped in the paused Profile work) are **not in the Discover payload at all** (`/api/discover` doesn't return them; only `/api/profiles/:id` does). There's no way to see more before deciding — you either act on the card's information or you don't. A relevance-first product should let you go deeper before committing, not just present one card and two buttons. That gap is the single biggest thing standing between "swipe deck" and "relevance engine," and it's structural, not cosmetic.

---

## 1. Discovery entry

**Observed:** four real entry paths — post-login (`(auth)/login/page.tsx:29`), post-email-verify (`verify/page.tsx:26`), post-onboarding (`onboarding/page.tsx:269`), and the homepage's own already-logged-in redirect (`LandingClient.tsx:13`). All `router.replace`/`push('/discover')`.

**Observed, and this is a genuine strength:** the onboarding path is the *good* version of this journey — 4 stages (acquisition → intent → profile → complete), and the final "complete" stage shows `SuggestedConnections` (an actual preview of relevant people, using `WhyThisMatch` reasoning chips) *before* pushing to `/discover`. A brand-new user's first Discover session happens seconds after declaring intent and seeing a preview of who that intent surfaces — that's exactly the "relevant to what you're trying to accomplish" framing, delivered structurally, not just in copy.

**Observed:** returning users (login/verify) land on Discover cold, no re-orientation. That's appropriate for a returning user, not a gap.

## 2. Filters

**Observed:** `DiscoverFilters.tsx` — sort (Match Score / Recent), intent (multi-select up to 3, from a fixed 6-item list: Hiring/Freelance/Co-founder/Mentorship/Investing/Networking), location (Nearby/Remote/Worldwide). Well-built bottom sheet, sensible hint copy ("1 of 3 — add up to 2 more to broaden"), already reduced-motion-safe (Phase 4).

**Observed — worth being precise about:** `DEFAULT_FILTERS.intents` is an **empty array**, meaning by default Discovery does *not* filter to a specific intent — it shows nearby people **ranked** by relevance score (which factors intent-compatibility server-side via `getMatchScore`), not **filtered** to one intent. That's a reasonable, defensible default (broad-but-ranked beats narrow-but-empty for a new user), but it does mean the "relevant to what you're trying to accomplish" promise rests entirely on the ranking algorithm and the card's own why-matched explanation, not on a hard filter — the Filters sheet is where a user actively narrows further, it's not what makes the base feed relevant. Not a bug; a distinction worth naming precisely so it isn't misdescribed later.

## 3. Intent selection

**Observed — this phrase covers two different things, and they're not the same UI:**
- **Your own intent** (what you're declaring) is set once, during onboarding's `IntentSelector` (10 options, icon + description, multi-select) or later via Profile edit — never inside Discovery itself. Discovery doesn't let you change your own stated intent.
- **Filtering by others' intent** (the 6-item list above) *is* inside Discovery, via the Filters sheet.

**Inference:** this split is probably fine — intent is a durable profile attribute, not a per-session toggle — but if a user's real-world goal changes mid-session (e.g. they came to Discover looking for a co-founder today, mentorship next week), there's currently no fast path back to "change what I'm declaring" from within Discovery; they'd need to know to go to Profile → Edit. Not a P0, flagging as a possible friction point, not confirmed without real usage data.

## 4. Swipe / discovery card

Already audited and implemented in Phase 4 — confirmed still holding: intent banner leads, trust cluster has an explicit primary/secondary/tertiary hierarchy, photo is deliberately behind substance, skeleton replaces the bare spinner, touch targets ≥44px. Nothing new to add here beyond what shipped.

## 5. Why matched

**Observed, real strength:** `getMatchReasons()`/`getInsight()` (`server.js`) compute genuine reasons (same city, shared/complementary intent, shared skills/interests, exploring↔building overlap) — this isn't decorative copy.

**Observed — a consistency gap across the product, not a Discovery-specific bug:** the *same concept* ("why you matched") has **three different visual treatments** depending on where you encounter it:
- `SwipeCard.tsx`: labeled section, bulleted list, checkmark icons.
- `ContextPanel.tsx` (desktop, Phase 4): renamed "Why this person," highlighted headline treatment.
- `WhyThisMatch.tsx` (onboarding's `SuggestedConnections`): pill-shaped chips with a `✦` prefix, entirely different visual language (also seen in `ProfileDrawer.tsx`'s "insight" line).

Three components computing/rendering the same idea with three different visual grammars is the kind of thing that quietly erodes "this is one coherent product" even though each individual instance is well-built. Not proposing a fix here — flagging for whenever cross-surface consistency work is prioritized.

## 6. Profile transition

**This is the most important finding in this audit.** Confirmed by tracing every `onClick` in `SwipeCard.tsx`: **there is no way to see more about a person than what's already on the card.** Tapping the card does nothing (only the left/right photo-nav zones and the dot indicators respond to taps, and only to cycle photos). There is no "view full profile" affordance anywhere in the Discovery flow.

This means: the richer Profile experience just built (trust score, review summary with peer tags, mutual connections) is **completely unreachable from Discovery** — not because it was scoped out, but because Discovery never links to it at all. A user deciding whether to Connect is working from strictly less evidence than what exists for that same person one click away, if only there were a click.

**Recommendation (not implemented — audit only):** a lightweight "view profile" affordance on the card (e.g. a small chevron/expand near the identity row, or making the avatar/name tappable) that opens `ProfileView` for that person, without disrupting the swipe stack underneath. This needs no backend change — `/api/profiles/:id` already exists and already returns everything needed. This is squarely a frontend wiring gap, not a missing feature.

## 7. Skip / Connect / Priority

Already implemented in Phase 4 — confirmed unchanged and holding: Skip/Connect are the only two buttons in the primary row (≥44px each), Priority is a distinct `.priority-fab` icon control in the identity row, same ⚡ icon/language used consistently in `ChatWindow.tsx` and now `ProfileView.tsx` (paused, uncommitted) — genuinely consistent across all three surfaces that offer Priority.

## 8. Loading / error / exhaustion

Already implemented in Phase 4 — confirmed unchanged: skeleton card on load, a real fetch-error state distinct from "you've seen everyone," `NO_PHOTO`/`TRUST_TOO_LOW` gates with actionable copy pointing to Profile.

## 9. Desktop context panel

Already implemented in Phase 4, revised per your review to lead with "Why this person" as a highlighted centerpiece rather than a duplicate card — confirmed unchanged and holding. One nuance worth naming for this broader audit: the context panel shows match reasons/looking-for/building/skills — the *same fields* Discovery already had — while the richer Social Proof data (finding #6, reviews/mutual) still isn't there either, since it isn't in the Discover API response. The context panel doesn't solve finding #6; only a Discover→Profile link would.

## 10. Mobile experience

Already implemented and QA'd in Phase 4 (390×844: no overflow, context panel correctly absent, all touch targets ≥44px). Nothing new surfaced in this broader pass.

## 11. Accessibility + reduced motion

**Observed:** `MatchModal`/`DiscoverFilters` explicitly gate framer-motion transitions via `useReducedMotion()` (Phase 4). `SwipeCard`'s own swipe/fly-out animation isn't framer-motion — it's a raw `element.style.transition` set imperatively in the touch handlers. **Inference, not confirmed live:** the existing global CSS rule in `globals.css` (`transition-duration: 0.01ms !important` under `prefers-reduced-motion: reduce`) should still apply here, because an `!important` stylesheet declaration overrides a non-important inline style for that property even though the property was set via JS — but this specific inline-vs-!important interaction is subtle enough that it deserves an actual OS-level reduced-motion test before being called confirmed, not just reasoned through. Flagging as "likely fine, verify directly" rather than either a pass or a finding.

**Observed:** no `aria-live` announcement on card swap (this was flagged in the original Discover audit as P1 and wasn't part of the approved Phase 4 scope — still outstanding, restating here since this pass is meant to be complete).

## 12. Consistency with the new homepage

**Observed, strong:** same design tokens throughout (`app/globals.css` is the single source both the homepage and the app shell read from). The homepage's `DiscoverPreview` component literally renders the real `SwipeCard` with sample data — there is zero drift between what the homepage shows and what Discovery actually looks like, which was the explicit goal of the homepage phase and it holds up under this audit too. The homepage's icon-language pass (semantic, non-generic icons) hasn't been extended to Discovery, but per your own scoping in that pass, Discovery's icons (Skip/Connect/Priority) were deliberately left alone as already-appropriate — consistent, not an oversight.

---

## Summary — what actually needs deciding before any implementation

1. **The Discover→Profile link (finding #6)** is the one gap in this audit that materially affects the core "relevant person, not a swipe deck" promise. Everything else here is either already fixed (Phase 4) or a lower-priority consistency/polish item.
2. **Cross-surface "why matched" fragmentation (finding #5)** and the **intent-change friction (finding #3)** are real but not urgent — flagging for a future consistency pass, not blocking anything.
3. **Reduced-motion on `SwipeCard`'s own animation (finding #11)** needs a real device/OS test, not just code reasoning, before being called settled.

No code touched. Stopping here per your instruction — waiting for the combined Homepage → Discover → Profile review before any further implementation.
