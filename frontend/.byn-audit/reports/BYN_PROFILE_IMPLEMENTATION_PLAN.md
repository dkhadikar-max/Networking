# BYN Profile & Profile Picture Quality: Implementation Plan

**Date:** August 26, 2026  
**Status:** PROPOSED (Pending User Review & Approval)  
**Target Scope:** Profile Photo Resilience, "Set as Main" Photo Ordering, Account Erasure Storage Cleanup, and UI Polish  

---

## 1. Overview & Objectives

This implementation plan addresses the P0 and P1 vulnerabilities identified during the Profile Deep Audit:
1. **Hero Avatar Resilience (P0.1):** Ensure `ProfileView.tsx` gracefully falls back to initials gradient when a photo fails to load or is broken.
2. **Account Deletion Cloudinary Hygiene (P0.2):** Ensure `DELETE /api/me` destroys all associated Cloudinary assets upon user erasure.
3. **Primary Photo Selection & Reordering (P1.1):** Allow users in `ProfileEdit.tsx` to click "Make Primary" on any uploaded photo to reorder slot 0 without deleting and re-uploading.
4. **Photo Grid Error Resilience & Accessibility (P1.3 / P2.3):** Equip `ProfileEdit.tsx` photo slots with image load error fallbacks and enlarged touch targets.
5. **Onboarding Upload Error Handling (P2.1):** Alert users when an upload fails in `ProfileCompletion.tsx`.

---

## 2. Proposed Source Code Changes

### Component 1: `components/profile/ProfileView.tsx` (P0.1 Hero Fallback)
- Add image load error state `[imgError, setImgError]` reset on `photoIdx` change.
- Fall back to clean initials gradient with proper contrast if `photos[photoIdx]` errors.
- Ensure PRO badge remains neatly positioned without obscuring avatar initials.

### Component 2: `C:\Networking\server.js` (P0.2 Cloudinary Deletion in `DELETE /api/me`)
- In `app.delete('/api/me')`, fetch the user's `photos` array prior to anonymization and trigger `deleteCloudinaryPhoto(url)` for each uploaded image.

### Component 3: `components/profile/ProfileEdit.tsx` (P1.1 Reordering + P1.3 Grid Polish)
- Add "Make Main" button on non-primary photos (`i > 0`) that shifts the selected photo to index `0` in `photos` state.
- Add `onError` handler to photo thumbnails so broken URLs display an error badge instead of raw broken image icons.
- Expand delete `×` button hit area to 32×32px with accessible aria-labels.

### Component 4: `components/onboarding/ProfileCompletion.tsx` (P2.1 Error Feedback)
- Replace silent catch with a user-facing toast or error state when photo upload fails.

---

## 3. Verification Plan

### Automated Regression Testing
1. Execute `npm run build` in `C:\Networking\frontend` to ensure 0 TypeScript or build regressions across all 88 routes.
2. Re-run `node scratch/audit_profile_flow.js` across all 7 responsive viewports (`320px`, `375px`, `390px`, `430px`, `768px`, `1024px`, `1440px`).
3. Verify 0px horizontal overflow across all screens.
4. Verify "Make Main" action reorders photos and persists correctly.
5. Verify broken image simulation displays initials gradient in `ProfileView`.

---

## 4. Final Recommendation

**Release Verdict:** `REVISE` (Prior to executing this plan) $\longrightarrow$ Expected Post-Fix: `SHIP` (96.5+/100).
