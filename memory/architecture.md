# Architecture — Build Your Network

**Verified from repository files. Last updated: 2026-05-16.**

## System Overview

```
[NetworkApp (Expo 54)] ──HTTPS──► [Railway: server.js (Express)]
                                          │
                         ┌────────────────┼────────────────┐
                    [Supabase/PG]   [Cloudinary]       [Resend / Razorpay / Expo Push]
```

## Backend Structure

Single file: `server.js` (2,607 lines, ESM). No modules, no routers — all logic inline.

**Initialization order:**
1. `optionalRequire()` pattern loads all packages gracefully (missing packages disable features, not crash)
2. Environment validation — exits on missing `JWT_SECRET` or `ADMIN_SECRET`
3. Express app + middleware stack
4. Helper functions (sanitize, scoring, match engine)
5. All route definitions
6. `app.listen()` + startup migration

**Middleware stack (applied globally):**
```
helmet → cors → globalLimiter (120/min) → requestLogger → express.json (1MB) → express.static
```

## Auth Architecture

1. Signup: bcrypt(password, 12) → insert user → issue JWT(24h) → send OTP email async
2. Login: bcrypt.compare → refresh scores → issue JWT(24h)
3. Every auth'd request: `auth` middleware → verify JWT → DB lookup → banned check → attach `req.user` + `req.userData`
4. `last_active` update via `setImmediate` (non-blocking, fire-and-forget)
5. `/api/me` issues a silent token refresh (`_token` in response) to prevent mid-session expiry

**Device verification (OTP):**
- OTP stored in `users.otp_code` / `users.otp_expires_at` (10 min TTL)
- After verify: `email_verified=true` in DB + client stores `deviceVerifiedUntil` (epoch ms) in SecureStore for 7 days
- `emailVerified = DB.email_verified && Date.now() < deviceVerifiedUntil`
- Intentionally: verified users on a new device still need OTP (per-device trust)

**Admin auth:**
- Two paths: `users.role = 'admin'` OR email in `ADMIN_EMAILS` env var (auto-grants on login)
- `adminAuth` middleware checks DB role; ADMIN_EMAILS users get role upgraded at login time

**Payment auth:**
- Scoped JWT: `POST /api/payments/session` issues a 15-min token with `scope: 'payment'`
- `/api/payments/create-order` and `/api/payments/verify` reject non-payment-scoped tokens

## Database Schema (9 core tables)

| Table | PK | Key Fields |
|---|---|---|
| `users` | text | email, password (bcrypt), photos[], skills[], interests[], trust_score, profile_score, premium, role, verification (jsonb), push_token |
| `swipes` | uuid | from_user, to_user, direction ('left'\|'right'), UNIQUE(from_user,to_user) |
| `connections` | text | user1, user2, active, expires_at, first_response_deadline, user1/2_responded |
| `messages` | text | connection_id, sender_id, text (max 2000 chars) |
| `works` | text | user_id, title, description, url, image (max 20 per user) |
| `reports` | text | from_user, target_id, reason (max 500 chars) |
| `blocks` | uuid | from_user, to_user, UNIQUE(from_user,to_user) |
| `daily_views` | composite(user_id,date) | count |
| `priority_msgs` | text | from_user, to_user, text (max 500 chars), month, read |

**Onboarding tables** (separate migration in `docs/onboarding-migration.sql`):
- `user_acquisition` — referral source
- `user_intents` — networking goals (multi-select)
- `user_education` — school/degree entries
- `user_work` — company/job entries
- `user_reviews` — peer ratings (1-5) + tags, UNIQUE(reviewer_id,reviewed_id)
- `payments` — order tracking for Razorpay
- `audit_logs` — admin action log
- `feedback` — user feedback submissions

**Note:** `users` table also has columns added via migration (not in `supabase_schema.sql`):
- `email_verified`, `otp_code`, `otp_expires_at`
- `onboarding_stage` ('acquisition'|'intent'|'profile'|'complete')
- `headline`, `profession`, `industry`, `experience_level`
- `premium_plan`, `premium_since`, `premium_expires_at`

## Scoring System

**Trust score (max 120):**
- 4+ photos: +20
- Interests: +10
- Intent: +10
- Bio (≥10 chars): +10
- Location: +10
- Social link: +10
- Verified: +30
- Peer review bonus: +20 (if ≥3 reviews, avg ≥4)

**Profile score (max 100) — must be ≥70 to access discovery:**
- 4+ photos: +30 (or 1+: +10)
- 3+ interests: +20 (or 1+: +8)
- Intent: +20
- Bio ≥10 chars: +10
- Name ≥2 chars: +10
- Location: +10

## Match Engine

`matchScore(a, b)` → integer 1–99:
- Interest overlap (max 35 pts)
- Intent compatibility via `INTENT_COMPAT` map (25 or 8 pts)
- Skill overlap (max 12 pts) + context text match (max 20 pts combined)
- Location: haversine distance → <10km: 20, <50km: 15, <200km: 8, else: 3
- Active users (last 24h) get +8 boost on final score

**Discovery limits:** Free: 30 swipes/day, Premium: 200/day

## Rate Limiters (9 total)

| Limiter | Window | Max | Applied To |
|---|---|---|---|
| global | 1 min | 120 | all routes |
| auth | 15 min | 50 (skip success) | signup, login |
| upload | 1 min | 10 | photo upload |
| verify | 15 min | 5 | OTP verify |
| otpSend | 15 min | 5 | OTP send |
| msg | 1 min | 30 | send message |
| bootstrap | 1 hr | 10 | admin bootstrap |
| works | 1 min | 5 | create work |
| profileView | 1 min | 30 | public profile, reviews |

## Mobile App Structure (NetworkApp)

```
NetworkApp/
├── index.js → App.js
├── src/
│   ├── context/AuthContext.js   — auth state, device verification, push token registration
│   ├── navigation/AppNavigator.js
│   ├── utils/api.js             — axios (BASE_URL: https://buildyournetwork.online, timeout: 8s)
│   ├── utils/analytics.js
│   ├── utils/theme.js
│   ├── hooks/useNetworkStatus.js
│   ├── components/BYNLogo.js
│   └── screens/ (16 screens)
│       LoginScreen, SignupScreen, VerifyEmailScreen, ProfileScreen,
│       ProfileCompleteScreen, UserProfileScreen, DiscoverScreen,
│       LikesScreen, ChatListScreen, ChatScreen, PriorityScreen,
│       UpgradeScreen, SettingsScreen, SupportScreen, PrivacyScreen, TermsScreen
```

## Payment Flow (Razorpay)

1. `POST /api/payments/session` → scoped JWT (15 min)
2. `POST /api/payments/create-order` (scoped token) → create Razorpay order + insert `payments` row
3. Client completes payment on Razorpay checkout
4. `POST /api/payments/verify` (scoped token) → HMAC-SHA256 verify → activate premium
5. Razorpay webhook `payment.captured` → redundant activation (handles webhook-first race)

**Plans:** Monthly INR ₹249 / USD $19 | Quarterly INR ₹599 / USD $39

## Onboarding Flow (4 stages, sequential)

`acquisition` → `intent` → `profile` → `complete`

- Stage tracked in `users.onboarding_stage`
- Startup migration: existing verified users auto-set to 'complete'
- Each POST endpoint enforces exact stage, returns 409 if wrong

## Static Assets Served

- `/` → `public/index.html` (74KB web app shell)
- `/app` → `public/webapp.html` (156KB full web app)
- `/admin` → `public/admin.html` (25KB admin dashboard)
- `/upgrade` → `public/upgrade.html` (29KB)
- `/download/android` → APK file or EAS redirect
- `/uploads/*` → user-uploaded images (local fallback only)

## What Does NOT Exist in This Repo

- **No Cloudflare** — no wrangler.toml, no Workers, no Pages config
- **No Next.js** — memory/stack.md previously said Next.js; that was wrong
- **No Vercel** — no vercel.json or Vercel config
- **No ORM** — all DB access is raw PostgREST queries via supabase-js client
- **No test runner** — test.js is a standalone integration test, not jest/mocha
- **No CI/CD pipeline** — no GitHub Actions, no CircleCI config
