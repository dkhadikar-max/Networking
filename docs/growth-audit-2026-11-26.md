# BYN growth audit — 2026-11-26

Why Build Your Network isn't growing, ranked by impact. Everything below was checked against the
repo or the live site on 2026-11-26. Anything not verified is marked **unverified**.

## TL;DR

BYN isn't growing because **new people can't get in**. It's not a marketing problem first.

1. **Production database unreachable (live, today).** The Supabase host for the production project
   (`swyrdvdarlevzjubqard.supabase.co`) does not resolve in DNS (local resolver and 8.8.8.8 both
   return NXDOMAIN). `api.buildyournetwork.online/api/stats/public` returns `{"users":0,"connections":0}`.
   It was 179 on 2026-10-08. If this holds, **every signup, login, Discover load and chat is failing
   right now**. The most likely cause is a free-tier Supabase project that got paused (Supabase removes
   DNS for paused projects). It could also have been deleted. **unverified:** the dashboard needs
   your sign-in.
2. **Email-only signup with a provider that was suspended.** Magic link is the *only* way to create
   an account. The Resend account was suspended in September (memory: 0 of 24 magic-link signups ever
   verified after ~Sep 3). Current Resend status is **unverified**.
3. **Every failure looked like success.** Signup always said "a sign-in link is on its way", login said
   "wrong password" during outages, and `/api/health` said ok without touching the DB. Nobody, you
   included, could see the funnel was broken. **Fixed in code today (not deployed).**
4. **Analytics that recorded nothing.** *(Corrected: the first version of this audit wrongly said
   there was no analytics; the search had missed the file.)* GA4 (`G-5NQDBYG4CJ`) is installed in
   `components/ui/CookieBanner.tsx` and loads after cookie consent. But its loader pushed plain
   arrays into `dataLayer`, which gtag.js ignores, so it sent **zero hits** (verified in a browser
   on 2026-11-26). There were also no funnel events, and the privacy policy promised a "cookie
   settings" link that didn't exist. All three are fixed in the working tree (see below).

Until 1 and 2 are fixed, SEO, referrals and content can't produce users: the traffic they bring hits a
dead signup.

## Funnel walk-through

| Stage | What exists (verified) | Problem |
|---|---|---|
| **Discover BYN** | 728-URL sitemap, ~650 templated `/startup-networking-<city>` pages (~1,000 words each), 21 blog posts, comparison pages. CTAs go to `/signup`. | 673 of 728 `lastmod` dates are 2026-05-18, with nothing since June. Near-identical city templates risk being treated as thin/doorway content. With no analytics or Search Console data in the repo, it's unknown whether any of it ranks. |
| **Sign up** | Name + email → magic link (`/api/auth/magic-link/request`), 18+ and Terms checkboxes. | 100% dependent on one email provider. No Google/LinkedIn sign-in fallback. Sender defaults to `onboarding@resend.dev` (sandbox, only delivers to the account owner) unless `RESEND_FROM` is set on Railway (**unverified**). |
| **Verify + set password** | Link valid 15 min, then set a password. | Extra step; the link may go to spam on a new sending domain. |
| **Onboarding** | 4 stages (acquisition → intent → profile → complete); Discover needs profile score ≥ 70 **and** a photo. | On 2026-10-08, 80 of 202 accounts were "Incomplete" (~40% stuck before Discover). The gate is strict for a network with ~180 people. |
| **First value (Discover → match → chat)** | Mutual-like matching, 24h first-response window, connections expire. | Cold start. With ~180 total users across many cities and roles, a new user in a given city/role sees few relevant people. Expiring matches punish a thin network further. |
| **Come back** | Expo push (mobile app only), email nudges. | Web users get no push. Email nudges also go through the suspended provider. |
| **Invite others** | `/r/:code` referral links, a verified-referral premium reward. | Referred signups go through the same broken email signup. Memory (2026-10-08): 0 referred users in prod. |

## Bugs fixed today (in the working tree, uncommitted)

All in `server.js`, covered by the new isolated test `test-outage-honesty.mjs` (16/16 pass; the
unfixed server fails 10 of them, including reproducing the live `{"users":0}`).

1. `/api/stats/public` ignored query errors, turned them into `0` and **cached the zero for 5
   minutes**. It now never caches a failed count, serves the last real value if there is one, and
   otherwise returns 503.
2. `/api/login` turned a database error into `401 Invalid email or password`. It now returns 503
   `SERVICE_UNAVAILABLE`; the answer doesn't depend on the email, so it gives no enumeration signal.
3. `/api/auth/magic-link/request`:
   - ignored the lookup error and still said "link on its way". It now returns 503 `SERVICE_UNAVAILABLE`.
   - sent the email fire-and-forget, so a suspended provider was invisible. The send is now awaited;
     a provider failure returns 503 `EMAIL_SERVICE_DOWN` (the signup page already shows "Email service
     temporarily unavailable" for that code). Both the new-user and registered-user branches use the
     same provider, so this gives no enumeration signal either. Per-address outcomes (cooldown,
     limits, suppression) keep the generic answer.
   - after a failed send, the 60s cooldown was still consumed, so the visitor's retry was silently
     dropped. The cooldown is now released when nothing was delivered.
   - the error text said "16 or older"; the signup page and Terms say 18. It now says 18.
4. New `GET /api/health/deep` checks the database (5s timeout) and email provider state (observed from
   real sends through one wrapper around `ResendClient.emails.send`). It returns 503 with
   `{db, email}` when either is down. `/api/health` is unchanged (still a pure liveness probe), so
   Railway behavior doesn't change.

## What to do, in order

**This week: make signup possible again**
1. Sign in to Supabase and check the production project. If it's paused, restore it. Free projects pause
   after inactivity, so consider the Pro plan or at least a keep-alive. If it was deleted, stop and
   plan a restore before anything else.
2. Check Resend: is the suspension lifted, and is `RESEND_FROM` on a verified domain? If Resend stays
   suspended, add a second provider. (You said "keep Resend" in October; this is a decision for you.)
3. Deploy the fixes above (after QA, per CLAUDE.md), then point a free uptime monitor
   (UptimeRobot, Better Stack, etc.) at `https://api.buildyournetwork.online/api/health/deep` so an
   outage pages you within minutes.
4. Do one real signup end to end yourself from a fresh email address.

**Next: measure, then cut friction**
5. Deploy the GA4 fix and funnel events (`lib/analytics.ts`): `sign_up_link_requested`,
   `sign_up_link_failed` (with error code), `sign_up` / `login`, `onboarding_step` (with the
   self-reported acquisition source), `onboarding_complete`, `connect_request`, `match`,
   `message_sent`. In GA, build a funnel exploration over them. Only visitors who accept cookies
   are counted, so treat numbers as a sample, not a total.
6. Add "Continue with Google" so signup doesn't depend on email delivery alone.
7. Let people into Discover sooner (for example, after name + intent + photo) and nudge them to finish
   their profile afterwards, instead of a hard 70-point gate.
8. Fight cold start: launch one city + one role at a time (for example, Hyderabad founders),
   seed it by hand, and show "X founders in your city" on the landing pages, using real numbers only.

**Then: grow traffic**
9. Connect Google Search Console and check which of the 728 URLs are actually indexed. Prune or merge
   city pages with no impressions; refresh `lastmod` only when content really changes.
10. Make referrals visible after a first match, when people are happiest. The reward logic already
    exists.

## Not checked

- Live Supabase project state and Resend account state (need your dashboard sign-in).
- Search rankings and traffic (no Search Console or analytics access in the repo).
- The mobile app (`NetworkApp`, `NetworkMobile`) funnel.
