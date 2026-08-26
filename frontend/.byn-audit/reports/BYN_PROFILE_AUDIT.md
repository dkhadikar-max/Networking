# BYN Profile & Profile Picture Quality Deep Audit Report

**Date:** August 26, 2026  
**Audited Journey:** Profile Ecosystem (Own Profile, Profile Edit, Other User Profile, Onboarding Profile Step, Image Pipeline, Avatar System)  
**Tested Breakpoints:** `320px`, `375px`, `390px`, `430px`, `768px`, `1024px`, `1440px`  
**Overall Profile Readiness Score:** **`82.80 / 100`**  
**Final Release Recommendation:** **`REVISE`** (Do not ship without addressing P0/P1 profile photo resilience and ordering)

---

## 1. Executive Summary & Core Verdict

In Build Your Network (BYN), the profile picture is the primary visual trust anchor of the entire product conversion loop:
$$\text{Discovery Photo} \longrightarrow \text{Intent Interpretation} \longrightarrow \text{Like / Connect} \longrightarrow \text{Match} \longrightarrow \text{Collaboration}$$

If a profile picture appears blurry, awkwardly cropped, broken, or mismatched between Discovery (rectangular) and Profile (circular), users make snap judgements in under **1.5 seconds**, causing significant conversion drop-off.

This deep audit evaluated the full profile experience, from browser uploads to storage, transformations, database persistence, and cross-feature rendering.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                             BYN PROFILE READINESS AUDIT SCORECARD                                │
├─────────────────────────────────────────────────┬────────┬─────────────┬────────────────────────┤
│ Dimension                                       │ Weight │ Score (/100)│ Weighted Contribution  │
├─────────────────────────────────────────────────┼────────┼─────────────┼────────────────────────┤
│ 1. Profile Identity & Substance Hierarchy       │ 25%    │ 88          │ 22.00%                 │
│ 2. Photo Upload, Ordering & Pipeline Security   │ 25%    │ 74          │ 18.50%                 │
│ 3. Image Fallback & Error Resilience            │ 20%    │ 72          │ 14.40%                 │
│ 4. Trust, Verification & Social Proof Signals   │ 15%    │ 90          │ 13.50%                 │
│ 5. Mobile Responsiveness (320px – 1440px)       │ 15%    │ 96          │ 14.40%                 │
├─────────────────────────────────────────────────┴────────┼─────────────┼────────────────────────┤
│ TOTAL SCORE                                              │ 100%        │ 82.80 / 100            │
│ VERDICT                                                  │             │ REVISE                 │
└──────────────────────────────────────────────────────────┴─────────────┴────────────────────────┘
```

---

## 2. Seven-Breakpoint Responsive Audit Matrix

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                       PROFILE 7-BREAKPOINT RESPONSIVE AUDIT MATRIX                               │
├───────────┬──────────────┬──────────────┬──────────────────┬─────────────────┬───────────────────┤
│ Viewport  │ Screen Width │ Scroll Width │ Own Profile View │ Edit Profile    │ Other Profile     │
├───────────┼──────────────┼──────────────┼──────────────────┼─────────────────┼───────────────────┤
│ 320px     │ 320px        │ 320px (0px)  │ PASS ✅ (100px)  │ PASS ✅ (3-col) │ PASS ✅ (Mutual)  │
│ 375px     │ 375px        │ 375px (0px)  │ PASS ✅ (100px)  │ PASS ✅ (3-col) │ PASS ✅ (Mutual)  │
│ 390px     │ 390px        │ 390px (0px)  │ PASS ✅ (100px)  │ PASS ✅ (3-col) │ PASS ✅ (Mutual)  │
│ 430px     │ 430px        │ 430px (0px)  │ PASS ✅ (100px)  │ PASS ✅ (3-col) │ PASS ✅ (Mutual)  │
│ 768px     │ 768px        │ 768px (0px)  │ PASS ✅ (Center) │ PASS ✅ (Center)│ PASS ✅ (Center)  │
│ 1024px    │ 1024px       │ 1024px (0px) │ PASS ✅ (640max) │ PASS ✅ (560max)│ PASS ✅ (640max)  │
│ 1440px    │ 1440px       │ 1440px (0px) │ PASS ✅ (640max) │ PASS ✅ (560max)│ PASS ✅ (640max)  │
└───────────┴──────────────┴──────────────┴──────────────────┴─────────────────┴───────────────────┘
```

---

## 3. End-to-End Image Pipeline Architecture

```
Browser Client (React)
  ├── 1. Input: <input type="file" accept="image/*"> in ProfileEdit / ProfileCompletion
  ├── 2. Client Payload: FormData with 'photo' binary stream
  ↓
Express Server (`server.js:3078-3093`)
  ├── 3. Multer Guard:
  │      - Rate Limit: 10 uploads / min (uploadLimiter)
  │      - File Size: 8MB max
  │      - File Types: image/jpeg, image/png, image/webp (.jpg, .jpeg, .png, .webp)
  │      - Fail-closed in production if Cloudinary unconfigured
  ↓
Cloudinary Storage (`multer-storage-cloudinary`)
  ├── 4. Upload params:
  │      - Folder: 'networkapp'
  │      - Auto-transformation: [{ quality: 'auto', fetch_format: 'auto' }]
  │      - EXIF Stripping: Active on auto-format delivery
  ↓
Database Persistence (`Supabase users table`)
  ├── 5. Array: `users.photos` (TEXT[] / JSONB, max 6 URLs)
  ├── 6. Profile Score & Trust Score recalculation on upload/delete
  ↓
Consumers Across BYN
  ├── ProfileView.tsx (.hero-av 100px circle)
  ├── ProfileEdit.tsx (1:1 square grid preview)
  ├── SwipeCard.tsx (Discover 4:3.8 tall rectangular hero with story progress bars)
  ├── Inbound Likes (Avatar 56px circular)
  ├── MatchModal (Dual Avatar 72px)
  ├── SuggestedConnections (Avatar 48px)
  └── Circles Posts (Avatar 40px)
```

---

## 4. Prioritized Audit Findings

### P0 — High Severity (Conversion & Data Hygiene Blockers)

1. **[P0.1 - BUG / VISUAL] `ProfileView.tsx` Hero Avatar Missing Broken Image Fallback**
   - **Location:** `components/profile/ProfileView.tsx` lines 88–91.
   - **Observation:** `ProfileView.tsx` renders `{photos[photoIdx] ? <img src={photos[photoIdx]} alt={name} /> : inits}` with a raw `<img>` tag and NO `onError` event handler.
   - **Impact:** If an image URL is expired, deleted from storage, blocked by network, or corrupted, the browser renders a broken image placeholder icon instead of falling back to the branded two-letter gradient avatar (`Avatar.tsx`).
   - **Classification:** `BUG` / `VISUAL ISSUE`.

2. **[P0.2 - BUG / SECURITY] Account Deletion Leaves Orphaned Cloudinary Assets**
   - **Location:** `server.js` lines 4747–4773 (`DELETE /api/me`).
   - **Observation:** When an account is deleted/anonymized, the server clears user records and sets `photos: []`, but never iterates over existing `user.photos` to invoke `deleteCloudinaryPhoto(url)`.
   - **Impact:** Photos of deleted accounts remain permanently cached on Cloudinary CDN indefinitely, creating GDPR Art. 17 data erasure compliance gaps and storage waste.
   - **Classification:** `SECURITY` / `BUG`.

---

### P1 — Medium-High Severity (UX Friction & Crop Disparity)

3. **[P1.1 - UX / PRODUCT] No Photo Reordering or "Set as Main" Action in Profile Edit**
   - **Location:** `components/profile/ProfileEdit.tsx` lines 165–194.
   - **Observation:** `photos[0]` is unconditionally hardcoded as the "Main" photo. Users cannot re-order uploaded photos or promote photo #2 or #3 to primary.
   - **Impact:** To change their primary profile photo, a user is forced to delete all prior photos and re-upload them in the desired order.
   - **Classification:** `UX ISSUE` / `PRODUCT OPPORTUNITY`.

4. **[P1.2 - VISUAL / TRUST] Circular vs Rectangular Aspect Ratio Mismatch without Focus Guidance**
   - **Location:** `ProfileView.tsx` (1:1 Circle) vs `SwipeCard.tsx` (4:3.8 Rectangle).
   - **Observation:** In Discover (`SwipeCard`), images render with substantial vertical bleed. In Profile (`ProfileView`), images are cropped to a circle. Without face-detection or a crop helper, images with non-centered faces get heads or chins cut off in the circular profile view.
   - **Impact:** Profiles look unpolished and untrustworthy in Profile inspection when the top of the head is clipped.
   - **Classification:** `VISUAL ISSUE` / `UX ISSUE`.

5. **[P1.3 - UX / RESILIENCE] `ProfileEdit.tsx` Photo Grid Lacks Error & Loading States**
   - **Location:** `components/profile/ProfileEdit.tsx` lines 167–193.
   - **Observation:** The 6-slot photo grid uses unhandled `<img>` tags without thumbnail loading skeletons or error badges.
   - **Impact:** If an image fails to load during editing, the slot shows broken text.
   - **Classification:** `UX ISSUE` / `VISUAL ISSUE`.

---

### P2 — Medium Severity (Validation & Social Proof Polish)

6. **[P2.1 - UX / ERROR HANDLING] `ProfileCompletion.tsx` Silently Swallows Upload Failures**
   - **Location:** `components/onboarding/ProfileCompletion.tsx` line 66.
   - **Observation:** `catch { /* silently ignore — photo is optional */ }` suppresses all upload errors during onboarding.
   - **Impact:** If a user selects a photo that exceeds size limits or fails network transfer, the camera icon simply resets with zero user feedback.
   - **Classification:** `UX ISSUE`.

7. **[P2.2 - SECURITY] Cloudinary Public ID Extraction Fragility**
   - **Location:** `server.js` lines 3105–3108.
   - **Observation:** `publicId` extraction splits on `/` and assumes the last segment without extension is the public ID inside `networkapp/`. If Cloudinary generates nested paths or version prefixes, deletion may fail silently.
   - **Classification:** `SECURITY` / `BUG`.

8. **[P2.3 - ACCESSIBILITY] Photo Delete Button Touch Targets Below 44×44px**
   - **Location:** `components/profile/ProfileEdit.tsx` line 176.
   - **Observation:** The `×` delete button is `24×24px`, below WCAG 2.5.5 minimum touch target recommendation (44×44px).
   - **Classification:** `ACCESSIBILITY`.

---

### P3 — Low Severity & Polish

9. **[P3.1 - VISUAL / POLISH] Bare Emoji in Location GPS Button**
   - **Location:** `components/profile/ProfileEdit.tsx` line 232.
   - **Observation:** GPS button renders bare `📍` emoji.
   - **Classification:** `VISUAL ISSUE` / `SUBJECTIVE DESIGN OPINION`.

---

## 5. Security & Privacy Deep Dive Summary

| Security Area | Implementation Status | Risk Assessment | Recommendation |
| :--- | :--- | :---: | :--- |
| **MIME / Extension Validation** | Checks `ALLOWED_MIMETYPES` (`jpeg`, `png`, `webp`) + `ALLOWED_EXTENSIONS`. SVGs blocked. | **LOW ✅** | Adequate server-side barrier against XSS image polyglots. |
| **Upload Size Limits** | Multer `8MB` limit + `uploadLimiter` (10/min/IP). | **LOW ✅** | Protects against DoS storage exhaustion. |
| **Public vs Signed URLs** | URLs are public Cloudinary CDN links. | **ACCEPTABLE ℹ️** | Standard for public founder networking profiles. |
| **EXIF / Metadata Stripping** | Cloudinary auto-transform strips location metadata on delivery. Local storage fails closed in production. | **LOW ✅** | User privacy protected. |
| **Cross-User Tampering** | Deletion checks `user.photos.includes(url)` for `req.user.id`. | **LOW ✅** | Users cannot delete photos from other users' DB arrays. |
| **Erasure Compliance** | `DELETE /api/me` clears DB rows but orphans Cloudinary files. | **MEDIUM ⚠️** | Implement batch Cloudinary cleanup in `DELETE /api/me`. |

---

## 6. Actionable Implementation Order

1. **Step 1 (P0):** Add robust image fallback (`Avatar.tsx` / `onError` state) to `ProfileView.tsx` hero avatar.
2. **Step 2 (P0):** Add Cloudinary asset cleanup loop in `DELETE /api/me` account deletion endpoint.
3. **Step 3 (P1):** Enhance `ProfileEdit.tsx` with "Set as Main" photo promotion or drag/reorder capability.
4. **Step 4 (P1):** Standardize photo grid slots in `ProfileEdit.tsx` with error fallbacks and accessible delete buttons.
5. **Step 5 (P2):** Provide clear toast feedback on photo upload failure in `ProfileCompletion.tsx`.
