# Combined Journey Review — Homepage → Discover → Profile

Review only, no code changed. Covers the current working-tree state, including the paused/uncommitted Profile implementation (still live in the repo, not committed) alongside the two committed checkpoints (`87ca79f`, `9598f12` homepage; `a9f7308` Discover).

One empirical check grounds this review rather than reasoning from code alone: the homepage's "Real Product Screens" section renders the *actual* `ProfileView.tsx` component via `ProfilePreview.tsx` — so the paused Profile changes are already live on the running homepage even though uncommitted. Confirmed via the dev server: the "Looking for / Building / Skills / Interests" sequence now renders exactly once each, and no Trust & feedback panel appears (correctly — the homepage's sample data has no review data, so nothing is fabricated there either). That single check answers part of Q1 and Q4 with certainty rather than inference.

---

## 1. Does the homepage promise exactly what Discover delivers?

**Yes, provably.** The homepage's hero doesn't describe Discover — it renders Discover's actual `SwipeCard` component (`DiscoverPreview.tsx` imports it directly). Same intent banner, same why-matched structure, same Skip/Connect buttons, same code path. There's no gap between promise and delivery because they're not two things — the "Real Product Screens" section works the same way for Profile, Match, and Conversation. This was the explicit goal of the homepage phase and it holds under this review.

## 2. Does Discover naturally lead users toward deeper evaluation?

**No.** This is the standing P1 finding, restated in this journey context because it's the crux of the whole review: `SwipeCard.tsx` has no tap-through to anything beyond the card itself. A user's only path forward is Skip or Connect — there is no "look closer first" option. Discover *establishes* relevance (intent banner, why-matched reasons) but doesn't *invite* deeper evaluation; it only offers a binary decision.

## 3. Can a user move from a discovery card to the richer Profile experience?

**No, not from Discover specifically.** Elsewhere in the product, yes — Circles (author tap), Notifications (actor tap), and Likes/Chat (via `ProfileDrawer`'s "View full profile" link) all reach `ProfileView`. Discover is the *one* surface that doesn't, despite being the highest-traffic entry point into evaluating a new person. The richer Profile experience exists and is reachable from the rest of the product — just not from the screen where the decision that matters most (Connect) actually happens.

## 4. Does Profile provide materially deeper evidence rather than repeating Discover?

**Yes, now — confirmed, not assumed.** Before the paused Profile pass, this wasn't reliably true (the old `ProfileView` sometimes showed *less* context than `SwipeCard`'s why-matched section, and duplicated working_on/skills within itself). After the paused changes: Profile has trust score, average rating, peer-review tags, and mutual-connection count — none of which `/api/discover` returns, so `SwipeCard`/`ContextPanel` structurally cannot show them regardless of any frontend work. Profile is now genuinely additive, not redundant. The problem is exclusively reachability (Q2/Q3), not content quality.

## 5. Is the intent → relevance → trust → connection progression obvious?

**Within each screen, yes. Across the journey, no — because there's no connective link.** Discover: intent (banner) → relevance (why-matched) → capability (skills/building) → connect. Profile: intent (chip) → capability (building/skills) → trust (new panel) → connect. Both screens independently follow the right internal order. But since nothing routes from one to the other, a user experiences two well-ordered *fragments*, not one progression. The "trust" step of the intended sequence is only reachable by accident (via Circles/Notifications/Likes), never as part of the primary discovery loop.

## 6. Are terminology, visual hierarchy, motion, spacing, and interaction patterns consistent?

**Tokens and structure: yes, consistently.** Everything reads from the same `globals.css` variables; both screens use the same card/panel radius-and-shadow language (Profile's panels are visually a notch quieter than Discover's card, which is appropriate — Profile is a read, Discover is a decision).

**Terminology: mostly, with one standing gap.** "Trust" language is now used consistently everywhere it appears (homepage's Trust/Privacy section, Discover's trust badge, Profile's "Trust & feedback" panel) — no new inconsistency introduced by the Profile pass. The pre-existing gap, restated from the Discovery audit: "why matched" has three different visual treatments across `SwipeCard`, `ContextPanel`, and onboarding's `WhyThisMatch` — still unresolved, still not urgent, still worth a dedicated pass eventually.

**Motion: consistent by design, one item unverified live.** `MatchModal`/`DiscoverFilters` explicitly respect `useReducedMotion()`. Profile's paused implementation uses no motion library at all — nothing to be inconsistent with. `SwipeCard`'s own swipe animation still relies on the global CSS `!important` rule rather than an explicit check, same open item as the Discovery audit — a real device/OS test would close this, code reasoning alone shouldn't be treated as final.

## 7. Does the entire journey feel distinctly BYN, or borrowed from LinkedIn/Bumble?

**Distinctly BYN in content, undercut by the journey gap in execution.** The swipe *mechanic* is necessarily Bumble-shaped (cards, skip, connect) — that was always going to be true and was the explicit, accepted trade-off from the start ("borrow interaction principles, not visual identity"). What's not borrowed: intent-first cards, backend-computed why-matched reasoning, and — new in the paused Profile work — peer-review trust (real ratings and tags from actually-connected users, not self-reported claims). That's closer to how Airbnb or Uber build trust than how LinkedIn or Bumble do, and it's genuinely BYN's own idea.

But right now the product *feels* like two well-built apps stitched together — a swipe deck, and a separate résumé-with-receipts page — rather than one continuous system, purely because nothing connects them. Closing the Q2/Q3 gap wouldn't just fix a missing button; it's the specific thing that would make the "distinctly BYN" answer to this question unqualified instead of "yes, but."

---

## Where this leaves the three surfaces

| Surface | Job (per your table) | Delivering? |
|---|---|---|
| Homepage | Explain why BYN exists | Yes — confirmed, renders real product UI, not marketing copy |
| Discover | Show who is relevant to me | Yes for relevance; no for "can I learn more before deciding" |
| Profile | Explain why this person is worth connecting with | Yes, materially — but only reachable outside the Discover flow |

**One finding, unchanged from the Discovery audit, is now the entire blocker for the north-star journey:** Discover → Profile has no link. Every other piece of "Homepage → Discover → Profile → Connect" already exists and already works; they're just not wired to each other at the one point that matters most.

No implementation in this pass, per your instruction. This review exists to confirm that finding is still the right one to prioritize once implementation resumes, rather than something to solve alongside a batch of smaller polish items.
