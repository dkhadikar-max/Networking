# Current State — Build Your Network

**Verified from repository files. Last updated: 2026-05-16.**

## What the Product Is

A professional networking app (think LinkedIn meets Tinder-swipe) branded "Build Your Network" (BYN).
Users discover and match with other professionals based on shared interests/skills/intent, then chat.

**Primary domains:** buildyournetwork.online, urnetwork.online

---

## Deployment State

| Component | Status | Details |
|---|---|---|
| Backend | Live | Railway, `node server.js`, auto-restart on failure |
| Database | Live | Supabase PostgreSQL (service_role key) |
| Mobile App | Live | NetworkApp (Expo 54) — EAS build, production channel |
| Web App | Live | Served by Express from `public/index.html` and `public/webapp.html` |
| Admin UI | Live | `public/admin.html` at `/admin` route |
| Android APK | Live | `public/apk/BuildYourNetwork.apk` or EAS redirect via `APK_DOWNLOAD_URL` |
| iOS | Unknown | EAS configured for production but no confirmation of App Store status |

---

## Feature Completeness

### Fully Implemented & Working
- Signup / Login (bcrypt + JWT)
- Email OTP verification (Resend) with per-device 7-day remember
- Profile (photos via Cloudinary, bio, skills, interests, social links, location)
- Trust score + profile score gating (must score ≥70 to access discovery)
- Swipe-based discovery with match engine (interest/intent/skill/location scoring)
- Match creation (mutual right-swipe → connection with 5-day expiry)
- Chat (messages, push notifications via Expo Push Service)
- Priority messages (before match, 3/month free, 20/month premium)
- "Who liked me" (count free, profiles premium)
- Works/portfolio (up to 20 items per user)
- Reviews/ratings (1-5 stars + tags, connection required)
- Report + block system
- Razorpay payments (monthly ₹249/USD $19, quarterly ₹599/USD $39)
- Admin dashboard (ban, verify, upgrade, delete, analytics, audit log)
- Onboarding flow (4 stages: acquisition → intent → profile → complete)
- Web static pages (index, webapp, upgrade, admin, privacy, terms)
- Sitemap.xml + robots.txt for SEO

### Partially Implemented
- Conversation starters: rule-based (not actual AI), generates prompts from profile overlap
- Audit log: writes to DB but admin endpoint only reads from in-memory buffer

### Not Implemented / Missing
- No Cloudflare (CDN, DDoS protection, WAF — entirely absent)
- No CI/CD pipeline (no GitHub Actions, no automated testing on push)
- No iOS App Store link confirmed
- No web push notifications (only Expo mobile push)
- No account deletion endpoint for end-users (only admin can delete)
- No email change flow
- No password reset flow (only OTP for email verification; lost password = stuck)
- No premium expiry enforcement (premium_expires_at stored but no background job to revoke)

---

## Recent Changes (from git log)

1. `20acf36` — fix: allow inline event handlers in CSP (Helmet script-src-attr)
2. `62031c4` — fix: JSON attr escaping, photo delete UI, tab/poll bugs, photo upload iOS
3. `ab6906b` — fix: photo upload, tab switching, chat poll leak, photo delete, aria, injection
4. `51b1bda` — web-first: demote APK, fix security vulnerabilities
5. `a6150a9` — fix: stop passing user ID as connection ID in discover card (root cause of 403 on messages)

Recent work has been focused on bug fixes: security hardening, UI polish, iOS compatibility, CSP fixes.

---

## Active Risk Areas

1. **No password reset** — users who forget passwords cannot recover accounts without admin intervention
2. **Premium not auto-expiring** — `premium_expires_at` is stored but no cron job or check revokes premium after it lapses
3. **Schema drift** — `supabase_schema.sql` is incomplete; a fresh DB from this file alone will break the app
4. **OTP in plain text** — `otp_code` stored unhashed in users table
5. **RESEND_FROM env var** — if not set to a verified domain address, OTP emails only reach the account owner

---

## Team / Agent Structure

Roles defined in `/agents/` directory:
- `backend.md` — backend architect
- `frontend.md` — frontend engineer
- `security.md` — security engineer
- `devops.md` — DevOps
- `qa.md` — QA tester
- `ceo.md` — strategy
- `pm.md` — product manager
- `design.md` — UX/design
- `growth.md` — growth/marketing
- `research.md` — research

Workflows in `/workflows/` (bugfix.md, launch.md, sprint.md) are empty templates.
