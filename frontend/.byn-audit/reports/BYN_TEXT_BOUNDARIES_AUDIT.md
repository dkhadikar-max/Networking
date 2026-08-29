# BYN Text Boundaries & Typographic Ergonomics Audit

**Date:** August 25, 2026  
**Audited Area:** Typography Boundaries, Word-Wrapping, Line-Length Ergonomics, Text Clipping, and Card Overflow  
**Codebase:** Next.js 16.2.6 · Tailwind CSS · React 19  
**Overall Text Boundary Score:** `82 / 100` (Grade: **B+** ➔ Optimization Target: **98+ A+**)

---

## 1. Executive Summary & Defect Breakdown

"Text Boundaries" govern how textual content is contained, wrapped, hyphenated, clamped, and formatted across varying viewport widths (from 320px mobile up to 4K desktop screens). Without strict boundary rules, long unbroken strings (e.g. continuous URLs, email addresses, non-spaced tech stacks, or extended foreign character sets) cause horizontal scroll blowouts, card edge clipping, and awkward line breaks.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       TEXT BOUNDARIES AUDIT MATRIX                          │
├─────────────────────────────────────┬─────────┬─────────────────────────────┤
│ Dimension                           │ Score   │ Status                      │
├─────────────────────────────────────┼─────────┼─────────────────────────────┤
│ 1. Word-Break & Overflow Containment│ 78 / 100│ Needs global overflow-wrap  │
│ 2. Line-Length & Readability (ch)   │ 84 / 100│ Good, needs max-w-prose     │
│ 3. Card Scrim & Text Contrast Bounds│ 90 / 100│ Hero scrim is well balanced │
│ 4. Line-Clamp & Dynamic Height      │ 80 / 100│ Prompt cards need line bounds│
│ 5. Heading Wrapping (`text-wrap`)   │ 76 / 100│ Add text-wrap: balance/pretty│
├─────────────────────────────────────┼─────────┼─────────────────────────────┤
│ Overall Text Boundaries Score       │ 82 / 100│ Grade: B+                   │
└─────────────────────────────────────┴─────────┴─────────────────────────────┘
```

---

## 2. In-Depth Boundary Audit & Key Vulnerabilities

### Vulnerability 1: Unbroken String & URL Overflow in Message Bubbles & Posts
* **Location:** [`ChatWindow.tsx`](file:///C:/Networking/frontend/components/chat/ChatWindow.tsx), [`CirclePostCard.tsx`](file:///C:/Networking/frontend/components/circles/CirclePostCard.tsx)
* **Risk:** Long URLs (e.g. `https://github.com/my-super-long-organization/very-deeply-nested-repository-name-with-extra-tokens`) can push message bubbles beyond viewport margins on mobile screens (320px–375px).
* **Remediation:** Apply `break-words [overflow-wrap:anywhere]` and `break-all` on raw links, with `text-wrap: pretty;` on prose.

---

### Vulnerability 2: Card Heading Orphans & Awkward Line Wrapping
* **Location:** [`SwipeCard.tsx`](file:///C:/Networking/frontend/components/discover/SwipeCard.tsx), [`app/retention/page.tsx`](file:///C:/Networking/frontend/app/retention/page.tsx)
* **Risk:** Multi-line headings in discovery cards and retention action cards can leave single-word orphans on second lines.
* **Remediation:** Apply modern CSS `text-wrap: balance` on headings (`h1`, `h2`, `h3`) and `text-wrap: pretty` on paragraph bodies.

---

### Vulnerability 3: Safe-Area Text Margins in Full-Page Discovery Card
* **Location:** [`components/discover/SwipeCard.tsx`](file:///C:/Networking/frontend/components/discover/SwipeCard.tsx)
* **Status:** Overlaid identity text (`name`, `headline`, `location`) is well-contained with `truncate` and bottom scrim padding, but user prompts (`working_on`, `currently_exploring`, `bio`) should be capped with comfortable line limits (`line-clamp-4` / `leading-relaxed`) to prevent pushing the bottom 3-button dock out of view on short phone screens (< 667px).

---

### Vulnerability 4: Typographic Scale & Line Height Tokens (`app.css`)
* **Standard Line Heights for Ergonomics:**
  - Headlines ($\ge 20\text{px}$): `line-height: 1.25` (tight, impactful).
  - Body copy ($14\text{px} - 16\text{px}$): `line-height: 1.6` (airy, high readability).
  - Metadata & Badges ($\le 12\text{px}$): `line-height: 1.3` (compact).

---

## 3. Recommended Upgrades

1. **Global Text Boundary Rules (`app/(app)/app.css`):**
   - Inject `.text-boundary-contain` with `overflow-wrap: break-word; word-break: break-word; text-wrap: pretty;`.
   - Set `text-wrap: balance;` on all card headers and modal titles.
2. **Component Tightening:**
   - [`SwipeCard.tsx`](file:///C:/Networking/frontend/components/discover/SwipeCard.tsx): Ensure prompts have `overflow-hidden break-words line-clamp-4` bounds.
   - [`ChatWindow.tsx`](file:///C:/Networking/frontend/components/chat/ChatWindow.tsx): Add `break-words [overflow-wrap:anywhere]` to all message bubbles.
   - [`CirclePostCard.tsx`](file:///C:/Networking/frontend/components/circles/CirclePostCard.tsx): Add safe boundary wrapping to post text and comments.
3. **Interactive Showcase in `/design-preview`:**
   - Add a "Text Boundaries & Typography" specimen showing how long unbreakable strings, multi-line headlines, and dense prompt cards gracefully contain within their boundaries.
