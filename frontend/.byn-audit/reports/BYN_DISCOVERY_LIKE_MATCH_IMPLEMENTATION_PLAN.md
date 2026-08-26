# BYN Discovery → Like → Match: Implementation Plan

**Target Feature:** Discovery Card Stack, Inbound Likes, Match Celebration, and Chat Transition  
**Objective:** Eliminate conversion friction, resolve mobile modal transform clipping, and unify the mutual match celebration bridge.  
**Constraint:** Strict adherence to existing backend API contracts (`/api/discover`, `/api/connect`, `/api/liked-me`, `/api/messages`). No fabricated signals.

---

## 1. Scope of Changes

| Component | Nature of Problem | Proposed Solution | Expected User & Conversion Impact |
| :--- | :--- | :--- | :--- |
| [`components/discover/MatchModal.tsx`](file:///C:/Networking/frontend/components/discover/MatchModal.tsx) | **BUG-01 (P0):** Framer Motion inline `transform` overrides CSS `translate(-50%, -50%)`, clipping modal to bottom-right corner on mobile. | Wrap modal in a centered flex overlay container (`fixed inset-0 z-[201] flex items-center justify-center p-4`) and remove conflicting absolute CSS transforms. | **100% Mobile Reachability:** Celebratory avatars and `Send a message →` button become perfectly centered across all viewports. |
| [`app/(app)/likes/page.tsx`](file:///C:/Networking/frontend/app/%28app%29/likes/page.tsx) | **UX-01 (P1):** Inbound like connect returns `{ match: true }` but only shows toast; leaves user stranded without opening MatchModal. | Statefully wire `<MatchModal />` in `likes/page.tsx` when `/api/connect` returns `{ match: true }` with `connectionId`. | **Immediate Conversion Bridge:** Instantly triggers celebration and 1-click transition into active chat. |
| [`app/(app)/likes/page.tsx`](file:///C:/Networking/frontend/app/%28app%29/likes/page.tsx) | **VIS-02 (P2):** Raw `<img>` without fallback renders broken image icons on like rows. | Replace raw `<img>` with standard `<Avatar src={profile.photos?.[0]} name={profile.name} size={52} />`. | Eliminates visual broken glyphs on inbound interest feed. |
| [`components/discover/SwipeCard.tsx`](file:///C:/Networking/frontend/components/discover/SwipeCard.tsx) | **VIS-01 & UX-02 (P2):** Multi-photo bars collide with top badges; hero photo height pushes substance below fold on mobile. | Fine-tune top bar vertical layout (`top-2.5` vs `top-6`) and optimize photo aspect ratio on compact mobile so `🚀 Currently Building` is visible immediately. | Instant 2-second scannability of builder identity + substance before swiping. |

---

## 2. Step-by-Step Execution Sequence

1. **Step 1: Fix `MatchModal.tsx` Centering:**
   - Update backdrop and modal container to standard full-screen flex centering.
   - Retain all Framer Motion spring physics on avatars and spark icon.
2. **Step 2: Connect Inbound Likes to Match Celebration (`likes/page.tsx`):**
   - Add `matchInfo` state (`{ connectionId, theirPhoto, theirName }`).
   - Trigger `setMatchInfo` when `res.match === true` upon calling `/api/connect`.
   - Replace raw `<img>` with universal `<Avatar />`.
3. **Step 3: Refine Discovery Top Bar & Substance Visibility (`SwipeCard.tsx`):**
   - Shift intent and match percentage badge below the story bars.
   - Ensure responsive container padding keeps `🚀 Currently Building` above the fold on compact viewports.
4. **Step 4: Full Multi-Breakpoint Verification:**
   - Run `npm run build` to verify 0 TypeScript/build errors.
   - Run automated Playwright test suite across all 7 breakpoints (`320px`, `375px`, `390px`, `430px`, `768px`, `1024px`, `1440px`).
   - Capture before/after screenshots in `.byn-audit/evidence/`.

---

## 3. Risk Assessment & Mitigations

* **Risk:** Does triggering `MatchModal` from `likes/page.tsx` disrupt the list state?
  * *Mitigation:* The liked profile is cleanly removed from the array when connected, while the modal overlays smoothly and offers direct navigation into `/chat/${connectionId}` or dismissal to continue reviewing remaining likes.
* **Risk:** Will layout adjustments cause card height jitter?
  * *Mitigation:* Explicit flex bounding constraints (`aspect-[4/4.5] shrink-0`) ensure zero layout shift.
