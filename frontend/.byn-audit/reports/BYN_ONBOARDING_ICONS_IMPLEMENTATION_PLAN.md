# BYN Onboarding & Premium Icon Design: Implementation Plan

**Target Feature:** Onboarding Journey & Icon System  
**Objective:** Elevate visual craft, standardize pixel-perfect geometric vector icons, and eliminate broken avatar fallbacks in Suggested Connections.  
**Constraint:** Zero changes to backend APIs or auth schema. Strict preservation of existing onboarding step progression and form fields.

---

## 1. Scope of Proposed Changes

| Component | Nature of Problem | Proposed Solution | Expected Impact |
| :--- | :--- | :--- | :--- |
| [`components/onboarding/icons.tsx`](file:///C:/Networking/frontend/components/onboarding/icons.tsx) | Current line icons have slight geometric asymmetry and uneven stroke curves. | Re-craft all 19 vector icons using mathematically precise SVG vectors, consistent 2px stroke, optical centering, and round caps/joins. | **Tier-1 Premium Feel:** Crisp, modern, product-led iconography matching Linear/Apple-grade design standards. |
| [`components/onboarding/SuggestedConnections.tsx`](file:///C:/Networking/frontend/components/onboarding/SuggestedConnections.tsx) | Raw `<img>` without fallback renders broken image icons when candidate photos fail to load. | Replace raw `<img>` with universal `<Avatar src={p.photos?.[0]} name={p.name} size={48} />`. | Clean fallback avatars with zero broken image artifacts. |
| [`components/onboarding/ProfileCompletion.tsx`](file:///C:/Networking/frontend/components/onboarding/ProfileCompletion.tsx) | Dashed photo upload container can look sharper on high-DPI screens. | Polish photo upload border styling and camera icon optical weight. | Elevates perceived trust and encourages profile photo uploads. |

---

## 2. Step-by-Step Execution Sequence

1. **Step 1: Upgrade `components/onboarding/icons.tsx`:**
   - Standardize `IconNetwork`, `IconCompass`, `IconRocket`, `IconTeam`, `IconBriefcase`, `IconTarget`, `IconGraduate`, `IconBook`, `IconGlobe`, `IconTrendUp`.
   - Standardize channel icons: `IconLinkedIn`, `IconInstagram`, `IconX`, `IconWhatsApp`, `IconWave`, `IconSearch`, `IconCalendarUsers`, `IconPlay`, `IconSparkle`, `IconCamera`, `IconPin`.
2. **Step 2: Upgrade `SuggestedConnections.tsx`:**
   - Import and use `<Avatar />` for candidate profile cards.
3. **Step 3: Verification:**
   - Run `npm run build` to confirm 0 TypeScript/build errors.
   - Re-run the automated Playwright test suite across all 7 breakpoints (`320px`–`1440px`).
   - Capture before/after screenshots in `.byn-audit/evidence/onboarding/`.
