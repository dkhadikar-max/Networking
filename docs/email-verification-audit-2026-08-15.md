# Email Verification Flow — Audit + Fix, 2026-08-15

Production-critical: new users sometimes unable to complete signup; Resend
sending limits being exhausted; Resend suppression list has grown to a
significant number of bounced/complained addresses.

Scope: signup → email verification → resend verification → OTP/token
validation → account activation. `server.js` (`/api/signup`,
`/api/auth/send-otp`, `/api/auth/verify-otp`), `frontend/app/(auth)/signup`,
`frontend/app/(auth)/verify`, and the mobile apps' equivalent screens
(read-only — not modified, see the deviation note below).

## Root causes (ranked)

### 1. CRITICAL — Resend API-level rejections were silently reported as success
`sendOtpEmail()` did `await ResendClient.emails.send(...)` and returned `true`
unless that threw. Confirmed by reading the installed SDK
(`node_modules/resend/dist/index.js`, `fetchRequest()`): it **never throws**
for an HTTP error response — it always resolves `{ data: null, error }`. The
only way `.send()` throws is a genuine network-level exception (DNS failure,
connection refused). So every real Resend-side rejection — a suppressed or
bounced recipient, an invalid address, a domain-verification problem, being
rate-limited by Resend itself — was silently treated as "email sent."

Direct consequences:
- Users saw "Code sent" / "Code resent" for emails that were never actually
  delivered, with no way to know or recover — the most likely explanation
  for "new users sometimes unable to complete signup."
- A suppressed address was retried indefinitely with no memory of the
  rejection, each attempt still a real Resend API call — contributing
  directly to "sending limits being exhausted" and to the suppression list
  growing (repeated attempts against known-bad addresses is exactly what
  damages sender reputation with an ESP).

**Fixed**: `sendOtpEmail()` now destructures `{ error }` from the SDK result,
classifies a suppression-shaped rejection vs. a transient one
(`classifyResendError()`), and returns a structured `{ ok, reason }` instead
of a bare boolean. A suppression-shaped rejection is persisted
(`users.email_suppressed`) so it is never retried again.

### 2. `/api/signup` had no meaningful rate limiting
It carried only `authLimiter` (50/15min per IP) — but `authLimiter` was
built with `skipSuccessfulRequests: true`, deliberately, for **login** (so a
few wrong passwords before a correct one aren't punished). Applied to
signup, that setting means every *successful* signup — the actual
quota-draining case — doesn't count against the limit at all. The only real
cap left was the blanket `globalLimiter` (120 req/min per IP, shared across
the entire API). Combined with zero bot-gating, this was a wide-open vector:
scripted signups with throwaway/invalid addresses each fire exactly one real
email and can directly inflate the suppression list.

**Fixed**: added `signupLimiter` (8/hour per IP, counts every request) and
a honeypot field, both additive — `authLimiter` itself is untouched so login
behavior doesn't change.

### 3. No per-account cooldown; no daily cap
`otpSendLimiter` (5/15min per account) had no minimum gap between individual
sends and no daily ceiling. A user (or a script) could burn all 5 in a few
seconds, and the budget refilled every 15 minutes indefinitely.

**Fixed**: `issueAndSendOtp()` enforces a 60s cooldown, 3/hour, and 5/day,
backed by new columns on `users` (`migrations/015_otp_rate_limiting.sql`),
via a single atomic `UPDATE ... WHERE otp_last_sent_at IS NULL OR < cutoff`.
Postgres serializes concurrent UPDATEs to the same row and re-evaluates the
WHERE clause against the just-committed data, so two simultaneous requests
for the same account can never both win the claim — this is what actually
prevents concurrent duplicate sends, not just a disabled button in one tab.

### 4. No per-IP limiting specific to email-triggering endpoints
Only the blanket 120/min global limiter applied to signup and resend. An
attacker rotating through disposable emails from one IP stayed under every
effective limit while draining Resend quota and adding to the suppression
list.

**Fixed**: added `resendIpLimiter` (20/hour per IP) alongside the existing
per-account `otpSendLimiter`, and `signupLimiter` above for signup itself.

### 5. No bot gate of any kind on signup
Repo-wide grep found zero CAPTCHA integration anywhere. Cloudflare is
already in front of the site (confirmed via `cdn-cgi` requests in production
network traffic), which makes Cloudflare Turnstile a natural fit, but it
needs a site key/secret from the Cloudflare dashboard that I can't
self-provision.

**Fixed (partial)**: added a honeypot field to the signup form — zero
external dependency, deployable immediately, filters unsophisticated
scripted signups. **Not implemented**: real CAPTCHA — needs a provider
decision and dashboard-issued keys from you.

## Checklist — findings against the audit's own numbered items

| # | Item | Verdict |
|---|------|---------|
| 1 | Multiple emails per one signup request | **Not a bug.** `users.email` is `UNIQUE NOT NULL` at the DB level — a genuine double-submit race lets only one insert (and thus one send attempt) through; the loser gets a 500, not a duplicate email. |
| 2 | Resend triggered by refreshes | **Not a bug.** `/verify` has no auto-send-on-mount effect — sending only happens on signup, an unverified login, or an explicit Resend click. |
| 3 | Missing server-side rate limiting | **Confirmed** — see root causes #2–#4. Fixed. |
| 4 | Missing per-email cooldown | **Confirmed** — no cooldown existed at all. Fixed (60s, atomic). |
| 5 | Missing per-IP rate limiting | **Confirmed** — only the generic global limiter applied. Fixed. |
| 6 | Unlimited resend attempts | **Confirmed** in effect — 5/15min with no daily cap could still run to dozens/day. Fixed (3/hour, 5/day). |
| 7 | Emails sent to already-verified users | **Partially confirmed — see the deviation note below.** Fixed on web; intentionally left as-is on the shared backend endpoint because mobile has a real, currently-shipped dependency on it. |
| 8 | Multiple active verification tokens | **Not a bug.** `otp_code`/`otp_expires_at` are single-slot columns, unconditionally overwritten on every send — there is structurally never more than one valid code. |
| 9 | Old tokens remaining valid unnecessarily | **Not a bug** — same reason as #8. |
| 10 | Suppressed recipients sent to repeatedly | **Confirmed — this is root cause #1.** Fixed (persisted `email_suppressed` flag + optional Resend webhook for proactive detection). |
| 11 | Bots consuming email quota | **Confirmed** — no gate of any kind existed. Fixed (honeypot + signupLimiter); real CAPTCHA needs your input. |
| 12 | Duplicate API requests from frontend | **Not found.** `lib/api.ts` has no retry wrapper; the signup/resend buttons disable themselves while a request is in flight. |
| 13 | Retry logic generating extra emails | **Not found**, checked both web (`frontend/lib/api.ts`) and mobile (`NetworkApp/src/utils/api.js` — axios interceptors only attach auth headers / track connectivity, no retry-on-failure). |
| 14 | Failed Resend requests retried without backoff | **N/A given #1** — failures were never even detected before, so nothing was "retrying without backoff"; now that failures are detected, suppression-shaped ones are never retried, and everything else is bounded by the new cooldown/hour/day caps regardless. |
| 15 | Can signup proceed if email delivery is down | **Already correct, preserved.** `issueAndSendOtp()` is still called fire-and-forget from `/api/signup` — account creation never blocks on or fails because of email delivery. |

## Deviation from the literal spec, and why

"Do not send to already verified accounts" (item 7 / a required-protection
bullet) — before touching anything, I grepped the mobile apps and found a
real, currently-shipped feature this would break if applied as a blanket
server-side rule: `NetworkApp/src/context/AuthContext.js` (comment,
verbatim) —

> New device (no local key): deviceVerifiedUntil=0, email_verified=true → OTP required

On a new device, the mobile client intentionally re-triggers the OTP flow
even though `email_verified` is already `true` server-side — this is a real
second-factor/device-trust check the mobile client's own logic gates, not
waste. A blanket "skip send if email_verified" on the shared
`/api/auth/send-otp` endpoint would silently break new-device login on
mobile with no way for those users to get in. `DO NOT modify unrelated
application functionality` explicitly rules out changing the mobile apps as
part of this pass.

What's implemented instead: the concretely-identified waste path — a
verified **web** session (no device-trust concept at all) landing on
`/verify`, e.g. via a stale bookmark — now shows "Your email is already
verified" instead of exposing Resend (`frontend/app/(auth)/verify/page.tsx`).
The backend endpoint itself still sends for `email_verified: true` accounts
(preserving mobile), but every call — verified or not, web or mobile — is
now bounded by the same 60s/3-hour/5-day caps, so even the case I couldn't
block outright can no longer run away.

## Current email requests per signup (as designed)

- **1** on a normal signup (the `issueAndSendOtp` call from `/api/signup`).
- **+1 per explicit resend click**, capped at 3/hour and 5/day per account
  from that point, 60s apart minimum.
- **0** if the honeypot field is filled, if the account is already verified
  and the request came from the web `/verify` page (blocked client-side
  before the request is even made), or if the email has been marked
  suppressed (blocked server-side before Resend is ever called again).

## Current rate limits (after this fix)

| Layer | Scope | Limit |
|---|---|---|
| `signupLimiter` | per IP | 8 signups / hour |
| `resendIpLimiter` | per IP | 20 resend requests / hour |
| `otpSendLimiter` | per account (in-memory) | 5 / 15min (coarse outer guard, kept for defense in depth) |
| `issueAndSendOtp` cooldown | per account (DB, atomic) | 60 seconds between sends |
| `issueAndSendOtp` hourly | per account (DB) | 3 / hour |
| `issueAndSendOtp` daily | per account (DB) | 5 / day |
| `verifyLimiter` | per account | 5 code-guess attempts / 15min (unchanged — brute-force guard, not a send limit) |
| Suppression | per email (DB, permanent) | 0 further attempts once Resend rejects it as suppressed/bounced, or a configured Resend webhook reports `email.bounced`/`email.complained` |

## Remaining failure modes / known gaps

1. **Migration must run before this is protective in production.**
   `migrations/015_otp_rate_limiting.sql` adds the columns `issueAndSendOtp`
   depends on. I verified live (see Tests below) that running this code
   *without* the migration fails closed cleanly — `/api/auth/send-otp`
   returns 503 "Email service temporarily unavailable" instead of a
   confusing 404, and signup itself is unaffected (account creation doesn't
   depend on the email step) — but **no verification emails will send at
   all** until the migration is applied. This is a deliberate fail-closed
   choice (no protection gap, at the cost of temporarily blocking the email
   step) rather than fail-open with the old unprotected behavior.
2. **No real CAPTCHA.** The honeypot filters unsophisticated bots only; a
   determined attacker can defeat it. Recommend Cloudflare Turnstile (already
   in front of the site) once you can provide a site key/secret.
3. **Resend webhook (`/api/webhooks/resend`) is optional and inactive by
   default.** It proactively marks addresses suppressed from Resend's own
   bounce/complaint events instead of only reactively after our own next
   attempt fails. Needs `RESEND_WEBHOOK_SECRET` set and the webhook URL
   registered in the Resend dashboard — until then it 503s harmlessly and
   the reactive path (still fully protective) covers suppression alone.
4. **`suppressed` classification is keyword-based** (`classifyResendError()`
   matches on `suppress`, `bounce`, `complain`, etc. in Resend's error
   text) since Resend's SDK doesn't expose a stable error-code enum for
   this. Add exact keywords here if Resend's wording doesn't match in
   practice — check `[OTP] Resend rejected the send:` log lines.
5. **The same silent-failure pattern (unchecked `ResendClient.emails.send()`)
   still exists in three other call sites** — forgot-password email,
   premium-reminder email (~line 6503 pre-audit), and a re-engagement email
   (~line 7880 pre-audit). Deliberately left untouched (`DO NOT modify
   unrelated application functionality` — these are outside the
   signup→verification→activation flow this audit was scoped to) but they
   have the identical bug and are worth a follow-up pass.
6. **Abandoned unverified accounts are never cleaned up**, and the `email`
   unique constraint means someone who signed up, never verified, and lost
   access can't simply re-signup with the same address. Out of scope here —
   flagging as a possible separate feature (e.g. a TTL on unverified
   accounts), not implemented.

## Tests performed

All testing done against a local server instance
(`PORT=3999 RESEND_API_KEY="" node server.js`) — `RESEND_API_KEY` explicitly
blanked for this process only (not touching the real `.env`) so
`ResendClient` is `null` and **no real Resend API call could occur under any
code path**, confirmed by the absence of any `[OTP] Sending from=...` log
line across the whole test run. Test account used a `@example.com` address
(IANA-reserved for documentation/testing, can never reach a real inbox) and
was deleted afterward via the app's own `DELETE /api/me` self-service
endpoint.

- `node --check server.js` — clean, at each edit step.
- `npx tsc --noEmit` (frontend) — clean.
- Honeypot: POST `/api/signup` with `company_website` filled → `400 Invalid signup request`, no account created.
- Legitimate signup: honeypot empty → `200`, account created, `email_verified:false`.
- Duplicate signup: same email again → `400 Email already exists`, no second account/send attempt.
- Pre-migration fail-closed check: `/api/auth/send-otp` on the freshly-created (unverified) account, migration 015 not yet applied → **`503 {"error":"Email service temporarily unavailable","code":"EMAIL_SERVICE_DOWN"}`** — confirms the fix for the earlier finding (this used to be a misleading 404). Server log shows exactly the expected schema-cache error and nothing else.

**Post-migration** (after the user applied `migrations/015_otp_rate_limiting.sql` in Supabase):
- New signup → `issueAndSendOtp` claim succeeded (schema error gone), attempted a real send, correctly failed with `not_configured` (RESEND_API_KEY still blanked for this test process) — and still consumed the cooldown slot, confirming a provider-side failure doesn't grant free unlimited retries.
- Immediate resend, ~3s later → **`429 {"error":"Please wait before requesting another code","code":"COOLDOWN"}`** — the atomic `UPDATE...WHERE` claim is live and correct.
- Row fast-forwarded (via the app's own service-role client, DML only, own test row only) to `otp_hour_count:3` → resend → **`429 TOO_MANY_ATTEMPTS`** (hourly cap).
- Row fast-forwarded to `otp_day_count:5` → resend → **`429 TOO_MANY_ATTEMPTS`** (daily cap).
- Row set `email_suppressed:true` → resend → **`422 {"error":"This email could not receive mail","code":"EMAIL_UNREACHABLE"}`**, with zero `[OTP] Sending from=...` log line — confirmed the suppression check short-circuits before Resend is ever called.
- All 5 DB-backed protections (cooldown, hourly, daily, suppression, pre-migration fail-closed) now verified live, not just by code review. Test account deleted via `DELETE /api/me` afterward; local test server stopped; no real Resend call occurred at any point across either test pass.

## Rigorous re-verification pass (post-review)

Prompted by CTO review flagging that the pass above proved boundary conditions
(counters manually set at the limit) but not organic accumulation, true
concurrency, token invalidation, or IP-independence. Re-ran against a fresh
local instance (same safety discipline: `RESEND_API_KEY` blanked for that
process only, `@example.com` test accounts, deleted afterward, zero real
Resend calls — confirmed via log line count matching exactly the number of
claimed sends: 5 attempts, 5 "Resend client not created" lines, 0 "Sending
from=" lines).

| Test | Method | Result |
|---|---|---|
| First verification | Signup | **PASS** — real `otp_code` generated, DB claim confirmed via direct read |
| Resend immediately | curl, same account | **PASS** — `429 COOLDOWN` |
| Resend after 60s | Real 61s wait, then curl | **PASS** — new `otp_code` generated (different from the first), counters incremented |
| Refresh/retry doesn't bypass limits | Each call is a fresh, stateless curl request — no client state to "refresh" | **PASS** — server-side/DB-backed state alone enforces it |
| New IP, same account | Spoofed `X-Forwarded-For` header on a cooldown-blocked request | **PASS** — still `429 COOLDOWN`; the DB-backed limiter keys purely on the authenticated account, not IP |
| Verification token invalidation | Captured `otp_code` at two points via direct DB read; tried the older one after the newer one was issued | **PASS** — old code → `400 Incorrect code`; current code → `200 ok` |
| Already-verified account | Verified the test account for real via `verify-otp`, then called `POST /api/auth/send-otp` directly (bypassing the web UI) | **Does NOT block at the API level, by design** — see below |
| 4th request within hour | 3 **genuinely separate** real sends, each ≥60s apart (not simulated) | **PASS** — `429 TOO_MANY_ATTEMPTS`; DB state after the blocked attempt is byte-identical to before it (zero writes on a blocked request) |
| 6th request within day | Row fast-forwarded to `otp_day_count:5` (organic accumulation would need the hourly window to reset first — 60+ real minutes; the boundary check itself is real) | **PASS** — `429 TOO_MANY_ATTEMPTS` |
| Two simultaneous resend clicks | Genuine concurrency: two `fetch()` calls fired via `Promise.all` with zero `await` between them, same account | **PASS** — exactly one request won the atomic claim (got past cooldown to a real send attempt), the other got `429 COOLDOWN`; DB `otp_hour_count` incremented by exactly 1, not 2 |
| Suppressed address | `email_suppressed:true` set directly, then resend | **PASS** — `422 EMAIL_UNREACHABLE`, zero `[OTP] Sending from=...` log line (short-circuits before Resend is ever called) |

**On "already-verified account → no email"**: tested directly against the raw
API (not through the web UI), and it does **not** match this expectation —
by design. `POST /api/auth/send-otp` for an already-verified account still
claimed a cooldown slot, generated a new code, and attempted a real send
(`otp_hour_count` incremented). This is the deliberate, documented deviation
from earlier in this doc: mobile's new-device re-verification
(`NetworkApp/src/context/AuthContext.js`) depends on the backend still
issuing real codes for `email_verified:true` accounts. The block exists only
in the web `/verify` page's UI (it never issues the request in the first
place for a verified web session) — anyone calling the API directly, on web
or via a debugger, bypasses that guard entirely. If this needs to be a hard
backend-level rule regardless of mobile impact, that's a product decision
requiring either breaking mobile new-device login or building it a separate
signal (e.g. a `deviceVerified` flag mobile passes) — not implemented here,
flagged for a decision.

**Not verified, and explicitly out of scope for a safe self-test**: whether
Resend actually delivers a real email to a real inbox. Everything up to "the
app correctly attempts/doesn't attempt a Resend call, with the correct
payload" is proven above; the last mile (real API key, real send, real
delivery) needs either a real signup on production or a Resend sandbox
address, deliberately not exercised here to avoid touching production quota
or a real recipient's inbox without cause.

## Phase 2 — distributed-abuse gap (CTO review, 2026-08-25)

Review of the phase-1 fix correctly identified that per-account limits (60s /
3-hour / 5-day) cap what any *one* account can do, but not what many
different accounts, each individually staying under its own cap, sum to —
that aggregate can still exhaust Resend's own account-level quota. Two
additive protections, without touching the per-account cooldown logic:

1. **Progressive per-IP throttle** — replaced the two separate, looser
   `signupLimiter` (8/hr, signup only) and `resendIpLimiter` (20/hr, resend
   only) with one combined `otpIpLimiter` (10/hr, shared across both
   `/api/signup` and `/api/auth/send-otp`). Repeat offenders escalate:
   `otpIpBlockGate` tracks violations per IP and each subsequent one extends
   the block by 15 minutes (capped at 24h) — same shape as the existing
   per-account `LOGIN_LOCKOUT` already in this file, applied per-IP here.
2. **Global OTP email circuit breaker** — `claimGlobalOtpBudget()`, checked
   in `issueAndSendOtp()` immediately before every Resend call, deliberately
   *before* the per-account claim so a globally-throttled request doesn't
   cost that user one of their own personal attempts. Tunable via
   `OTP_GLOBAL_HOURLY_BUDGET` / `OTP_GLOBAL_DAILY_BUDGET` env vars (defaults:
   100/hour, 500/day — conservative placeholders, **not** a measured number
   from the actual Resend plan; set these to match it). Covers OTP sends
   only (signup + resend) — the other three unchecked `ResendClient.emails
   .send()` call sites noted in "Remaining failure modes" above are still
   outside this budget.

**Verified live** (same discipline: local instance, `RESEND_API_KEY` blank,
zero real Resend calls, budget env vars temporarily set to 2/hour for
testability):
- 3 accounts created, budget=2/hour → 3rd account's send correctly refused
  (`[OTP] Global email budget exhausted (hour:2/2, day:2/10)`), **and its
  own personal `otp_hour_count`/`otp_code` remained untouched** (confirmed
  via direct DB read: `null`/`0`, vs. account 1's real claim) — proving the
  ordering (global check before personal claim) actually protects the
  user's own budget as designed.
- 10 signups from one IP (the full `otpIpLimiter` budget) → all succeeded;
  11th → `429`, generic message, violation recorded; 12th (immediately
  after) → `429 IP_BLOCKED`, **"try again in 15 minute(s)"** — confirmed the
  escalation actually engages on the very next request, not just the flat
  limiter message.
- All 10 test accounts (deleted afterward — the 3 we held sessions for via
  `DELETE /api/me`, the other 7 via a direct service-role delete since the
  point of the IP-block test is that request never got far enough to
  establish a session).

**Not implemented, both deliberately, both need your decision**:
- **Purpose-separated endpoints** (`WEB_SIGNUP_VERIFICATION` /
  `MOBILE_NEW_DEVICE_AUTH` / `PASSWORD_RECOVERY`) so the backend itself,
  not just the web UI, can refuse an already-verified account. This needs a
  coordinated change to the mobile apps' request payload (`NetworkApp`,
  `NetworkMobile`) — a cross-client, breaking-risk change I won't make
  unilaterally on a shared production endpoint.
- **Real CAPTCHA.** Still blocked on a provider key — Cloudflare Turnstile
  is the natural fit (Cloudflare's already in front of the site) but needs
  a site key/secret from your Cloudflare dashboard.

## Files changed

- `migrations/015_otp_rate_limiting.sql` (new) — `otp_last_sent_at`, `otp_hour_count`/`otp_hour_window_start`, `otp_day_count`/`otp_day_window_start`, `email_suppressed`/`email_suppressed_reason`/`email_suppressed_at` on `users`.
- `server.js` — `sendOtpEmail()` rewritten to check `{data,error}`; new `classifyResendError()`; new `issueAndSendOtp()` shared path; `/api/signup` routed through it + honeypot; `/api/auth/send-otp` routed through it + fail-closed user lookup + mapped error codes; new `/api/webhooks/resend` (optional, inactive until configured); **phase 2**: combined progressive `otpIpLimiter`/`otpIpBlockGate` (replaces `signupLimiter`/`resendIpLimiter`), global `claimGlobalOtpBudget()` circuit breaker.
- `frontend/app/(auth)/verify/page.tsx` — client-side 60s cooldown UI, exact required user-facing states, "already verified" guard for web sessions.
- `frontend/app/(auth)/signup/page.tsx` — off-screen honeypot field.

## Is production safe to deploy?

**Yes, conditionally**: the code fails closed, not open — if you deploy
without running `migrations/015_otp_rate_limiting.sql` first, verification
emails simply won't send (clean 503, verified live above) rather than
shipping with the old silent-failure/unprotected behavior. Account creation
itself is unaffected either way.

**Migration applied**: the user ran it in Supabase and confirmed success.
All 5 DB-backed protections (cooldown, hourly, daily, suppression, and the
pre-migration fail-closed path) have now been verified live — see the
post-migration section under Tests above. **Fully verified end-to-end.**
