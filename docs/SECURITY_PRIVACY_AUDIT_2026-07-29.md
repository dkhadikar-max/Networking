# BYN — Security & Privacy Readiness Report
**Date:** 2026-07-29
**Scope:** Full-codebase audit — root Express app (`server.js`, marketing site + API, buildyournetwork.online), `frontend/` (Next.js, gated app, separate Railway service), `services/ai-orchestrator` (Python/FastAPI), `NetworkApp` (shipped Expo mobile app), `NetworkMobile` (dead prototype), Supabase Postgres schema/migrations, Railway/Docker deployment config.

Method: 8 parallel read-only audit passes against actual code (no assumptions), followed by implementation of fixes that were verified safe and non-breaking. Architectural/product-impacting items were **not** changed unilaterally — they're listed under "Flagged for your decision" below.

---

## 1. Fixed this session

| # | Finding | Severity | Where |
|---|---|---|---|
| 1 | **Stored XSS** — `user.name`/`user.bio` flowed unescaped into a JSON-LD `<script>` block on the public, crawlable `/founders/:id` page. A crafted bio (`</script><script>...`) broke out of the tag and executed for any visitor, including search bots. | **P0** | `server.js` — JSON-LD now escapes `<` as `<` before embedding |
| 2 | Cookie-consent banner was non-functional — GA4 loaded unconditionally on every page in `frontend/app/layout.tsx` regardless of consent choice, while a separate consent-gated loader (`CookieBanner.tsx`) already existed and did the right thing. Same bug independently on the Express blog template. | **P1** | `frontend/app/layout.tsx`, `server.js` blog template — both now rely solely on the consent-gated loader |
| 3 | `javascript:`/`data:` URI injection via unvalidated `linkedin`/`website` profile fields — no scheme check before persisting. | **P1** | `server.js` — new `sanitizeUrlField()` restricts to `http:`/`https:` on `/api/me` PUT |
| 4 | Raw `last_active` timestamp leaked in every `cleanPublic()` response (`/api/discover`, `/api/profiles/:id`, `/api/connections`, `/api/liked-me`) and in the Circles feed author object — only the derived `is_recently_active` boolean was meant to be exposed. | P2 | `server.js` |
| 5 | Upload validation trusted client-supplied MIME type only; extension wasn't checked, and the code silently fell back to less-validated local-disk storage if Cloudinary env vars were ever missing — live risk of stored-XSS-via-SVG on that fallback path. | P2 | `server.js` — now validates extension too, and fails closed (rejects uploads) in production if Cloudinary isn't configured, instead of silently downgrading |
| 6 | Circle Groups `/collaborate` endpoint shipped with no rate limiter, unlike every sibling action route (a repeat of the exact gap already fixed for like/join/leave/promote/demote/remove in commit `3fe48df`). | P2 | `server.js` |
| 7 | `/api/events` — the only fully public, unauthenticated POST route — had no rate limit, and logged attacker-controlled strings without stripping `\r\n` (log-injection / forged log lines). | P2 | `server.js` — added limiter + control-character stripping |
| 8 | `/api/priority-message` let a user send a message to any UUID with no check the recipient exists. | P2 | `server.js` — added existence check (the separate question of whether a *relationship* should be required is a product decision, not changed — see below) |
| 9 | Webhook signature (Razorpay) and admin-bootstrap secret were compared with `!==` (not constant-time). | P3 | `server.js` — both now use a shared `timingSafeStringEqual()` |
| 10 | Several routes returned raw Postgres/driver error text (`e.message`) to the client on user-triggered actions (self-delete, admin-delete). Internal admin/agent-tooling routes with the same pattern were left as-is — they're admin-gated already and the raw messages aid operator debugging. | P3 | `server.js` |
| 11 | Plaintext user emails logged in OTP-send/login/reset flows (`console.log`), ending up in Railway's log aggregation. | P3 | `server.js` — new `maskEmail()` helper applied at all 4 sites |
| 12 | `services/ai-orchestrator` Docker container ran as root (frontend's Dockerfile already used a non-root user; this one didn't). | P3 | `services/ai-orchestrator/Dockerfile` |
| 13 | `ai-orchestrator`'s public, unauthenticated `/health` endpoint echoed raw startup exception text. | P3 | `services/ai-orchestrator/main.py` — now logs server-side only |
| 14 | Next.js app had **zero** security headers (Express side already had helmet+CSP). | P3 | `frontend/next.config.ts` — added `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`. Full CSP not added — see below. |
| 15 | No `Permissions-Policy` header anywhere. | P3 | `server.js` — added, deliberately leaving `payment` unrestricted since Razorpay checkout needs it |
| 16 | NetworkApp requested `RECORD_AUDIO`, `RECEIVE_BOOT_COMPLETED`, and legacy `READ/WRITE_EXTERNAL_STORAGE` Android permissions with zero corresponding code — iOS build even states in its own `Info.plist` that the mic isn't used. | P3 | `NetworkApp/app.json` (needs a new EAS build to take effect — permission changes aren't OTA) |
| 17 | Weak password minimum (6 chars) inconsistent with the frontend web signup form, which already required 8. | P3 | `server.js` (both signup + reset-password), `frontend` reset-password page, `NetworkApp` signup + reset screens — all aligned to 8 |
| 18 | 9 known-vulnerable dependency versions (`npm audit`): `body-parser`, `brace-expansion`, `form-data`, `qs`, `undici`, `ws` — all had non-breaking fixes available. | P2-P3 | `npm audit fix` applied; **`cloudinary` (2.7→2.10) and one transitive `brace-expansion` via `resend→pretty→js-beautify` remain — see below, not force-applied** |

All edits were syntax/type-checked (`node -c server.js`, `tsc --noEmit` on frontend, `py_compile` on the orchestrator) before being called done.

---

## 2. Flagged for your decision (not changed)

These either change behavior a user could notice, require infrastructure access I don't have, or are genuine product-intent questions — touching them without a green light would violate the brief.

- **Auth token duplication (P1, the single most consequential open item):** login/signup correctly set an httpOnly, secure, SameSite=Lax cookie — but the same JWT is *also* returned in the JSON body and stored in `localStorage` by the web frontend, then sent as a `Bearer` header. Any XSS anywhere on the frontend's origin can read `localStorage.byn_token` directly, which makes the httpOnly cookie's XSS protection moot in practice. Fixing this properly means dropping the bearer/localStorage path and relying solely on the cookie for the web app — but the mobile apps (which can't use browser cookies) likely need the bearer path to keep working, so this needs a coordinated auth-flow decision, not a silent edit.
- **No end-to-end message encryption.** Messages are stored in plaintext in Postgres; Supabase's disk-level encryption is a platform default, not something BYN implements at the application layer. **Do not describe this as E2E-encrypted anywhere** (marketing copy, trust center, etc.) — it isn't. Building real E2E is a substantial architectural project (client-side key management, recovery, rotation) that changes what server-side features (search, moderation, notification previews) can see — a product call, not a quiet patch.
- **Unauthenticated/unsigned image delivery.** Profile photos are plain, permanent Cloudinary URLs — anyone with a URL can view/re-host it indefinitely. The only protection is that the URL isn't otherwise published. Cloudinary supports signed, short-lived delivery URLs, but switching breaks every existing stored/shared link and adds signing latency on every fetch — flagging, not implementing.
- **Account deletion deletes the *other* party's messages too.** When user A deletes their account, every message in shared connections is deleted by `connection_id`, including what user B sent. This is a real retention-policy choice (clean-break-for-the-deleter vs. preserve-the-other-party's-history), not a bug — needs your call.
- **Priority-message relationship gate.** I added an existence check (a message to a nonexistent UUID is now a bug fix regardless of intent), but whether a priority message should require an existing connection at all is unclear — it may be the entire point of the paid feature (contacting someone outside your matches). Left as-is pending your confirmation of intended behavior.
- **RLS live-state on Supabase — could not verify, and here's exactly what to run.** `supabase_schema.sql` documents RLS-enabling SQL as "run manually in the Supabase SQL Editor" — there's no migration runner in the repo that applies it automatically, so I can't confirm from the codebase alone whether it's live. I don't have a safe way to check this remotely (PostgREST doesn't expose raw SQL execution, and creating a privileged RPC to check would itself be an invasive schema change on production I won't make without asking). **There is already a ready-to-run, idempotent, zero-production-impact script sitting at `docs/rls-hardening.sql`** (adds `RESTRICTIVE ... USING (false)` deny-all policies for `anon`/`authenticated` on 13 tables — `service_role`, which is all `server.js` ever uses, bypasses RLS regardless, so this has zero effect on the running app). If nobody has confirmed this was run against the live DB, **run it now** — verification query included at the bottom of that file.
- **Two divergent migration histories.** Root `migrations/` (11 files) and `supabase/migrations/` (2 files, one of which — `006_onboarding_retention.sql` — is empty) don't overlap and share colliding sequence numbers. No single source of truth for what's actually applied live. Consolidating risks misdiagnosing which one the live DB actually reflects — needs a live schema diff first, not a blind delete.
- **CSP still allows `'unsafe-inline'` for scripts** (Express side, `server.js` helmet config) — a known, commented stopgap "until inline JS is extracted." This is what makes the JSON-LD XSS (fix #1) possible even with CSP active; removing `unsafe-inline` requires migrating every inline `<script>`/`onclick=` across the static marketing pages to external files or nonces — real effort, not a quick patch.
- **Full CSP on the Next.js frontend** — I added the three unambiguously-safe headers (frame/nosniff/referrer), but a real `script-src`-restrictive CSP needs a full inventory of what the SPA loads (GA4, Razorpay checkout script + iframe, Cloudinary images, Google Fonts) plus a nonce strategy, or it risks breaking checkout — flagging for a dedicated pass rather than guessing.
- **`cloudinary` dependency bump (2.7→2.10)** fixes a real high-severity argument-injection advisory but is a `--force`, breaking-change upgrade per `npm audit` — needs testing against actual upload/delete calls before applying.
- **Transitive `brace-expansion` vuln** via `resend → @react-email/render → pretty → js-beautify` has no non-breaking fix path; would require bumping `resend` itself. Low real-world exploitability (this chain is only used for HTML pretty-printing at email-composition time, not exposed to attacker-controlled glob input) — noted, not forced.
- **Mobile screenshot/screen-recording protection** doesn't exist yet (confirmed: no `expo-screen-capture`, no `FLAG_SECURE`, nothing). It's genuinely implementable via `expo-screen-capture`'s `usePreventScreenCapture()`, which sets Android `FLAG_SECURE` (also blanks the Recents thumbnail automatically) and blocks/detects iOS screen recording — **but it's a native module: it won't work in Expo Go and requires a custom dev client / EAS rebuild**, which changes your test workflow. Not adding without you signing off on that trade-off. No JS-only alternative actually works — I was explicitly told not to fake this, and I haven't.
- **NetworkMobile is a dead prototype** (Expo SDK/React Native version combination that has never actually built), with a nested `buildyournetwork/` Expo Router scaffold that has no bundle identifiers set. Confirmed unrelated to the shipped app (`NetworkApp`, which matches the APK served at `/download/android`). Not deleting on my own initiative in case it holds in-progress design work — your call on delete vs. archive.
- **Admin fallback email** (`ADMIN_EMAILS` defaults to a hardcoded address if the env var is ever unset) — technically a P2 finding, but removing the fallback risks locking out admin access entirely if Railway's live env doesn't actually have `ADMIN_EMAILS` set (I can only confirm it's in the local `.env`, not Railway). Flagging rather than guessing at production env parity.
- **OTP-code storage/comparison** (email-verification step) stores the code in plaintext and compares with `!==`, inconsistent with the password-reset code path which correctly hashes (SHA-256) + uses `crypto.timingSafeEqual`. Lower urgency since this route requires an already-valid session for the same account (not a remote attack surface) — a real fix means changing the stored-data shape, which I'm treating as a small scoped change worth doing deliberately rather than folding into this pass.

---

## 3. Verified clean (no finding, stated plainly rather than assumed)

- IDOR checks across every ownership-sensitive mutating route — re-verified server-side ownership checks on works/circles/connections/messages deletion and editing.
- The `.or()` filter-injection class (fixed in commit `f325834`) and SSRF redirect bypass (fixed in commit `3fe48df`) — re-audited for recurrence elsewhere; none found.
- CORS is a real allowlist with `credentials: true`, not a wildcard-with-credentials misconfiguration.
- Mass assignment: `/api/me` PUT uses an explicit field allowlist, not a `req.body` spread.
- bcrypt cost factor 12 with correct 72-byte truncation; per-account lockout (10 attempts → 15 min) plus timing-safe dummy-compare on unknown emails — genuine anti-enumeration, not just IP-based rate limiting.
- Password-change/reset correctly invalidates all previously-issued JWTs (`password_changed_at` vs. token `iat`) — this is properly implemented, not a common miss.
- Forgot-password always returns 200 regardless of account existence (no enumeration); reset code is `crypto.randomInt`, SHA-256-hashed at rest, `timingSafeEqual`-compared, voided after 5 wrong attempts.
- No hardcoded secrets anywhere in tracked source; `.env` never committed (confirmed via `git log`); no `NEXT_PUBLIC_*` env var anywhere in the frontend, meaning it never talks to Supabase directly — all data access is proxied through the Express API, so RLS state doesn't currently gate any real attacker-reachable path.
- No S3/GCS/other misconfigured public bucket exists — all media storage is Cloudinary or the local-disk fallback (now hardened, see fix #5).
- No unsigned Cloudinary upload preset — both photo/works upload routes are auth-gated and go through server-side signed requests.
- Public SEO pages (`/professionals/[slug]`, `/cities/[city]`, etc. on the Next.js side) are static/generic, no real user PII rendered. No phone field exists anywhere in the schema. GDPR export (`/api/me/export`) and CCPA do-not-sell (`/api/me/privacy`) both exist, scoped to the authenticated user only.
- No "who viewed your profile" or read-receipt feature exists to leak presence/behavior signals. The free-tier "who liked me" paywall correctly withholds user IDs to prevent bypass via the profile-detail endpoint.
- `expo-secure-store` (OS keystore/keychain) is used correctly for token storage in the shipped mobile app — not plaintext `AsyncStorage`. No hardcoded secrets in either mobile codebase. No cert-pinning, but that's an acceptable trade-off for this data-sensitivity tier, not a gap.

---

## 4. Report by phase (as requested)

**Authentication** — Strong core mechanics (bcrypt-12, lockout, timing-safe anti-enumeration, token invalidation on password change), undermined by the token-duplication issue (flagged above) and previously-plaintext-6-char passwords (now fixed to 8 + hashed correctly throughout).

**Authorization** — Solid. Systematic IDOR review across all mutating routes found no bypass. Admin auth re-fetches role server-side rather than trusting a client flag. Main residual item is the bootstrap-endpoint hardening (fixed) and the priority-message existence check (fixed).

**Encryption** — TLS via Railway's edge (HSTS present through helmet defaults on the Express side; **could not verify what Railway's edge actually adds/strips over the wire** — needs a live header check). Passwords and reset codes are hashed correctly. **Messages are not encrypted at the application layer — no E2E exists; don't claim it does.**

**Privacy** — Biggest fix was the broken consent gate (GA4 firing unconditionally despite a banner that claimed otherwise). Metadata minimization was mostly right; the `last_active` leak is now closed. Account-deletion message retention is a policy question, not a bug, flagged for you.

**Infrastructure** — Express side has real hardening (helmet CSP, disabled `x-powered-by`, scoped CORS). The Next.js service had none until this pass. The RLS-verification gap and dual migration directories are the two things most worth your direct attention here — both are one Supabase-console visit away from being resolved.

**Mobile** — NetworkApp (the shipped app) does the important thing right: secure OS-keystore token storage. Everything else found was hygiene (unused permissions, removed) or a genuine gap (screenshot protection) that's real work, not a quick fix, and changes your build/test pipeline if you want it.

**Web** — The XSS fix was the standout critical item. CSP `unsafe-inline` remains real technical debt on the Express side. Frontend now has baseline headers; full CSP is a follow-up project.

**Media Protection** — No authenticated/signed delivery exists; unguessable URLs are the only protection today (stated plainly, not oversold). Upload validation hardened this session.

**Screenshot Protection** — Genuinely absent on mobile; infeasible on web (browser sandboxing — no vendor claims otherwise). A real mobile implementation path exists (`expo-screen-capture`) but requires a build-pipeline change you'd need to approve.

**Compliance readiness** — GDPR export/deletion mechanisms exist and are properly scoped. No EU-specific consent-management platform or India DPDP-specific handling was found beyond the (now-fixed) cookie banner — stating this as a fact about current implementation, not a legal conclusion.

**Remaining risks** — In priority order: (1) confirm RLS is actually live via the script already sitting in `docs/rls-hardening.sql`, (2) decide on the auth-token-duplication fix, (3) decide on message encryption posture and stop any E2E claims if they exist anywhere in product copy, (4) resolve the migration-directory split, (5) decide on mobile screenshot protection given the build-pipeline trade-off.

**Overall security score:** solid foundation with a few real gaps closed today. The core authentication/authorization logic was already well above average for a project this size (correct token invalidation, real anti-enumeration, clean IDOR checks) — most of what was fixed here was information-disclosure and defense-in-depth hardening, plus one genuine P0 (now closed same-day). The handful of flagged architectural items are where the real remaining risk lives, and none of them are secretly urgent — they're legitimate trade-off decisions that deserve your input rather than a unilateral change.
