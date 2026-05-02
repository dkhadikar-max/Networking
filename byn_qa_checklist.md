# BYN QA Validation Checklist
**Version:** 1.0.0  
**Date:** May 2025  
**Tester:** _______________

---

## HOW TO USE THIS CHECKLIST
For each item: mark **PASS** or **FAIL**, note observable proof, and document repro steps if FAIL.  
Any FAIL in **RELEASE BLOCKERS** section stops the release.

---

## PRE-TEST SETUP
- [ ] Fresh install (not update) on physical Android device
- [ ] App started with no existing account (fresh state)
- [ ] Wi-Fi connected, then airplane mode test as noted
- [ ] Keep device in portrait orientation throughout

---

## TEST FLOW (EXECUTE IN ORDER)

### Step 1 — Launch App

| # | Check | Status | Proof / Notes |
|---|-------|--------|---------------|
| 1.1 | Splash screen shows peach (#FFF4EC) background | | |
| 1.2 | Splash shows BYN logo symbol (no text) centered | | |
| 1.3 | No crash on launch | | |
| 1.4 | Status bar text is dark (readable on peach) | | |
| 1.5 | Auth screen loads — Login and Signup visible | | |

**Repro for FAIL:** Launch app → observe splash → check background color + logo presence.

---

### Step 2 — Signup + Consent

| # | Check | Status | Proof / Notes |
|---|-------|--------|---------------|
| 2.1 | Signup screen shows BYN symbol logo (no text) at top | | |
| 2.2 | Create Account button is disabled/greyed when consent unchecked | | |
| 2.3 | Error shown if user tries to submit without checking consent | | |
| 2.4 | Checking consent checkbox enables button | | |
| 2.5 | Signup succeeds and navigates to profile setup or main app | | |
| 2.6 | Consent stored in AsyncStorage key `byn_consent_v1` | | |

**Repro for 2.2:** Open signup → fill all fields → do NOT check consent → tap Create Account → verify button is grey/disabled.  
**Repro for 2.6:** After signup, use `AsyncStorage.getItem('byn_consent_v1')` in dev tools.

---

### Step 3 — Swipe 3x (RELEASE BLOCKER)

| # | Check | Status | Proof / Notes |
|---|-------|--------|---------------|
| 3.1 | Cards render with correct height (~68% screen) | | |
| 3.2 | Swipe 1 RIGHT — card animates off right, next card appears | | |
| 3.3 | Swipe 2 LEFT — card animates off left, next card appears | | |
| 3.4 | Swipe 3 RIGHT — card animates off right, next card appears | | |
| 3.5 | All 3 swipes succeed without crash or freeze | | |
| 3.6 | CONNECT/SKIP overlay labels appear during swipe drag | | |
| 3.7 | Skip button triggers left swipe (card leaves left) | | |
| 3.8 | Connect button triggers right swipe (card leaves right) | | |
| 3.9 | After all profiles swiped → empty state shown (not blank) | | |
| 3.10 | Swiped profiles do NOT reappear on refresh | | |

**Repro for 3.1–3.4:** Log into app → go to Discover tab → drag card right beyond 28% screen width → release → verify animation completes and new card appears.  
**Repro for 3.10:** Swipe all profiles → tap Refresh → verify previously swiped profiles are absent.

---

### Step 4 — Open Profile (RELEASE BLOCKER)

| # | Check | Status | Proof / Notes |
|---|-------|--------|---------------|
| 4.1 | Tapping card opens UserProfileScreen | | |
| 4.2 | Loading spinner shown while profile fetches | | |
| 4.3 | Profile data loads correctly (name, bio, skills, interests) | | |
| 4.4 | Error UI shown if profile fails to load (not blank screen) | | |
| 4.5 | "Go back" button works from error state | | |
| 4.6 | Profile hero image OR initials fallback shown | | |
| 4.7 | Verified badge visible if profile is verified | | |
| 4.8 | Back navigation returns to Discover without crash | | |

**Repro for 4.4:** Set device to airplane mode → tap profile → verify error message + Go back button appears.

---

### Step 5 — Priority Message (RELEASE BLOCKER)

| # | Check | Status | Proof / Notes |
|---|-------|--------|---------------|
| 5.1 | ⚡ Message button visible on Discover screen | | |
| 5.2 | Button shows spinner while request in progress | | |
| 5.3 | Button disabled during API call (cannot double-tap) | | |
| 5.4 | Success → navigates to ChatScreen | | |
| 5.5 | Error → toast message appears (not blank) | | |
| 5.6 | Toast disappears after ~4 seconds | | |
| 5.7 | API call sends `{ toUserId: string }` (check network logs) | | |

**Repro for 5.3:** Tap ⚡ Message → immediately tap again → verify only one request sent.  
**Repro for 5.5:** Set airplane mode → tap ⚡ Message → verify error toast appears.

---

### Step 6 — Filters

| # | Check | Status | Proof / Notes |
|---|-------|--------|---------------|
| 6.1 | Filters button opens bottom sheet without crash | | |
| 6.2 | Can select Sort, Intent, Interest options | | |
| 6.3 | Active filter count badge appears on button | | |
| 6.4 | Apply filters closes sheet and refreshes profiles | | |
| 6.5 | Reset all clears all filter selections | | |
| 6.6 | Empty state shown when no profiles match filters | | |

---

### Step 7 — Chat

| # | Check | Status | Proof / Notes |
|---|-------|--------|---------------|
| 7.1 | Chat tab loads chat list without crash | | |
| 7.2 | BYN logo (symbol) visible in Chat list header | | |
| 7.3 | Tapping a chat opens ChatScreen | | |
| 7.4 | Messages load correctly | | |
| 7.5 | Can send a message | | |
| 7.6 | Unread indicator shown for unread chats | | |

---

### Step 8 — Settings → Support (RELEASE BLOCKER)

| # | Check | Status | Proof / Notes |
|---|-------|--------|---------------|
| 8.1 | Profile tab → Settings button visible | | |
| 8.2 | Settings screen opens without crash | | |
| 8.3 | "Support" row navigates to SupportScreen | | |
| 8.4 | SupportScreen shows FAQ items (not blank) | | |
| 8.5 | Email Support button opens email client | | |
| 8.6 | If email unavailable → Alert shown with email address | | |
| 8.7 | support_clicked analytics event fires (check console in dev) | | |

**Repro for 8.6:** On a device with no email client → tap Email Support → verify Alert with address appears.

---

### Step 9 — Terms & Privacy (RELEASE BLOCKER)

| # | Check | Status | Proof / Notes |
|---|-------|--------|---------------|
| 9.1 | Settings → Terms & Conditions opens TermsScreen | | |
| 9.2 | TermsScreen has scrollable content (all 13 sections) | | |
| 9.3 | Version and last updated date visible | | |
| 9.4 | Settings → Privacy Policy opens PrivacyScreen | | |
| 9.5 | PrivacyScreen has scrollable content with data table | | |
| 9.6 | "No data selling" badge visible in Privacy header | | |
| 9.7 | Back navigation works from both screens | | |
| 9.8 | Neither screen has a blank state | | |

---

### Step 10 — Safe Area (RELEASE BLOCKER)

| # | Check | Status | Proof / Notes |
|---|-------|--------|---------------|
| 10.1 | Header does NOT overlap device notch on iPhone | | |
| 10.2 | Header does NOT overlap status bar on Android | | |
| 10.3 | Tab bar not hidden behind home indicator | | |
| 10.4 | No content clipped on small screen (360×640) | | |
| 10.5 | Logo in header does not stretch or distort | | |

---

### Step 11 — Kill + Reopen

| # | Check | Status | Proof / Notes |
|---|-------|--------|---------------|
| 11.1 | Force-kill app and reopen | | |
| 11.2 | Auth state preserved (stays logged in) | | |
| 11.3 | Discover screen loads fresh profiles | | |
| 11.4 | No crash on reopen | | |
| 11.5 | Swiper session deduplication resets (fresh session) | | |

---

## OFFLINE / NETWORK TESTS

| # | Check | Status | Proof / Notes |
|---|-------|--------|---------------|
| O.1 | Airplane mode → Discover shows orange offline banner | | |
| O.2 | Offline banner text readable (dark text on orange-tinted bg) | | |
| O.3 | API error state shows Retry button (not blank screen) | | |
| O.4 | Tap Retry → reconnect Wi-Fi → profiles load | | |
| O.5 | Offline banner disappears after successful API response | | |

---

## DESIGN SYSTEM CHECKS

| # | Check | Status | Proof / Notes |
|---|-------|--------|---------------|
| D.1 | Background is warm peach #FFF4EC throughout | | |
| D.2 | All action buttons are teal #0F766E | | |
| D.3 | No green/blue buttons anywhere (only teal) | | |
| D.4 | Orange used only as accent (<10% of any screen) | | |
| D.5 | White text on teal buttons (WCAG contrast passing) | | |
| D.6 | Logo is symbol-only in ALL headers (no text mark) | | |
| D.7 | Touch targets ≥ 44×44pt (Skip, Connect, Message buttons) | | |
| D.8 | Cards height ~68% screen height | | |

---

## RELEASE BLOCKERS SUMMARY

Any FAIL in these items **blocks release**:

| Blocker | Status |
|---------|--------|
| Swipe works (3 consecutive) — Steps 3.1–3.5 | |
| Profile opens with data — Step 4.1–4.3 | |
| Priority message navigates to chat — Step 5.4 | |
| Safe area respected — Step 10.1–10.2 | |
| Support screen opens email / fallback — Step 8.5–8.6 | |
| Terms & Privacy scrollable with content — Step 9.2, 9.5 | |

---

## SIGN-OFF

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Developer | | | |
| QA | | | |
| Product Owner | | | |

---

*Generated by Build Your Network — Production QA v1.0*
