# Passwordless Magic-Link Authentication — Design + Implementation

Second, independent auth method alongside the existing password+OTP flow.
Nothing about the existing flow (`/api/signup`, `/api/login`,
`/api/auth/send-otp`, `/api/auth/verify-otp`) was modified — confirmed by
diff, not assumed (see Tests below).

## Architecture inspected before writing any code

- **Signup flow**: `/api/signup` creates a `users` row eagerly (before email
  verification), sets an initial JWT cookie immediately, sends an OTP
  fire-and-forget. `users.email` is `UNIQUE NOT NULL`, `users.password` is
  `NOT NULL` (no nullable-password option without a schema change I chose
  not to make — see "Account creation" below).
- **OTP endpoints**: `/api/auth/send-otp` and `/api/auth/verify-otp` both
  require an existing authenticated session (`auth` middleware — JWT via
  cookie or `Authorization: Bearer`). They exist for a user who already has
  a session (from password signup/login) and needs to prove their email.
  Deliberately never bypassed for `email_verified:true` accounts — mobile's
  new-device re-verification depends on that (see `fix(auth)` commits
  earlier this branch).
- **JWT/cookie**: `jwt.sign({id,email,name}, JWT_SECRET, {expiresIn:'24h'})`,
  set via `res.cookie('byn_token', ..., {httpOnly,secure,sameSite:'lax'})`
  for web, and returned in the JSON body for mobile (`Authorization: Bearer`
  — confirmed via `NetworkApp/src/utils/api.js`'s request interceptor and
  `SecureStore`). The `auth` middleware accepts either.
- **Mobile dependency**: `NetworkApp`/`NetworkMobile` call `/api/login`,
  `/api/signup`, `/api/auth/send-otp`, `/api/auth/verify-otp` directly —
  none of these were touched. Mobile has no deep-link/universal-link
  configuration for magic links, so this feature is **web-only** for now;
  mobile continues on its existing OTP flow unchanged. Not extending it to
  mobile was a deliberate scoping decision, not an oversight — that needs
  native app changes (universal links, App/Play store considerations) well
  outside "add a second web auth method."
- **Resend integration**: `ResendClient.emails.send()` returns
  `{data,error}` and never throws for an API-level rejection (see the
  `6dc7f22`/`832a0c7` audit). `classifyResendError()`, `claimGlobalOtpBudget()`,
  `otpIpLimiter`/`otpIpBlockGate` from that work are reused here, not
  reimplemented.
- **DB schema for auth state**: `otp_code`/`otp_expires_at`/
  `otp_last_sent_at`/`otp_hour_count`/`otp_day_count`/`email_suppressed`
  (migrations 008, 015). Magic link needed its own storage — a token hash,
  expiry, and used-at marker, none of which the OTP columns have any
  equivalent of — hence a new migration rather than reusing OTP's columns
  for the token itself (the rate-limiting *shape* is mirrored, not shared;
  the *global budget* and *IP layer* genuinely are shared — see Security).

## Design decisions

**Account creation happens at request time, not verify time.** For a brand
new email, `/api/auth/magic-link/request` creates the `users` row
immediately (mirroring `/api/signup`'s existing eager-creation behavior)
with a random, never-disclosed `bcrypt` hash as `password` (satisfies the
`NOT NULL` constraint; this account has no usable password until the user
sets one via the existing forgot-password flow) and `name: ''`. **Critically,
no session is issued at this point.** This is the load-bearing security
invariant of the whole feature: knowledge of an email address must never be
sufficient for authentication — a session is only ever issued in
`/api/auth/magic-link/verify` or `/api/auth/passwordless/otp/verify`, on
successful proof of inbox access. An earlier draft of this design
considered issuing a session eagerly (to make the OTP-fallback trivially
reuse the existing authenticated `send-otp`/`verify-otp` pair) — rejected
specifically because it would mean *typing in someone else's known email
address* is enough to get a working session for their account before ever
proving inbox access, which would be a severe account-takeover hole. That's
why the OTP fallback is two brand-new, deliberately unauthenticated
endpoints (`/api/auth/passwordless/otp/request`+`/verify`) instead of a
thin wrapper around the existing pair.

**Magic-link URL points to a frontend page, not a backend GET route.**
`https://.../verify-magic?token=<raw>` renders a Next.js page; that page's
client-side JS does the actual `POST /api/auth/magic-link/verify` with the
token in the body. Two reasons: (1) email security scanners (Microsoft
SafeLinks, corporate gateways) commonly pre-fetch links in emails via plain
GET *before* the real user clicks — if the raw link itself were the
state-changing action, a scanner could burn the single-use token before the
user ever sees it; routing through a page whose *JS* does the mutating call
sidesteps that, since scanners don't typically execute page JS. (2) it keeps
the token out of any URL a backend request logger, reverse proxy, or CDN
access log could capture — the token only ever travels in a POST body,
never a query string, after the initial email click.

**Token hash is kept after successful use, not cleared.** `magic_link_used_at`
being set is what permanently blocks the token — the hash itself is inert
once that's set, so leaving it lets a *reuse* attempt be looked up and
correctly reported as "Link already used" instead of collapsing into a
generic "invalid" once the hash is gone. See the migration's comment.

**Open redirects**: no client-supplied redirect/`next` parameter exists
anywhere in this feature. The post-auth destination (`/onboarding` vs.
`/discover`) is decided by the client purely from `user.onboarding_stage`
in the verify response — never from user input — so there is no attacker-
controlled redirect target to validate in the first place. This is the
strongest form of "prevent open redirects": not having the vulnerable
surface exist at all, rather than validating an allowlist against one.

## Security controls implemented

- Token: `crypto.randomBytes(32)` → 256 bits, hex-encoded for the emailed
  link; only `sha256(token)` is ever persisted (`magic_link_token_hash`).
- Expiry: 15 minutes (`MAGIC_LINK_EXPIRY_MS`), within the required 10-15min.
- Single-use: atomic `UPDATE ... WHERE magic_link_token_hash=X AND
  magic_link_used_at IS NULL AND magic_link_expires_at > now()` — Postgres
  serializes concurrent UPDATEs to the same row (same reasoning as the OTP
  cooldown claim from the prior audit), so two simultaneous verify attempts
  with the same token can never both succeed.
- Per-account rate limiting: 60s cooldown / 3-per-hour / 5-per-day, same
  atomic-claim shape as OTP, own dedicated columns
  (`magic_link_last_sent_at`/`magic_link_hour_count`/etc.).
- Per-IP rate limiting: reuses the existing `otpIpLimiter`/`otpIpBlockGate`
  (10/hr combined, escalating blocks on repeat offenders) — now shared
  across six routes total (signup, resend-otp, magic-link-request,
  passwordless-otp-request), not reimplemented for this feature.
- Global circuit breaker: `issueAndSendMagicLink()` calls the exact same
  `claimGlobalOtpBudget()` OTP sends use, before the per-account claim —
  magic-link sends consume the identical shared budget, so they cannot be
  used to route around the breaker built for OTP.
- Concurrent duplicate sends: same atomic-claim pattern as OTP's cooldown —
  provably race-safe (verified live, see Tests).
- No enumeration: `/api/auth/magic-link/request` and
  `/api/auth/passwordless/otp/request` return the identical generic
  response whether the email exists, was just created, or failed
  internally. `/api/auth/passwordless/otp/verify` returns the same "Incorrect
  code" for both "no such account" and "wrong code."
- No raw tokens logged: `sendMagicLinkEmail()` logs only the masked
  recipient email, never the link or token. Nothing else in this feature
  logs the raw token at any point — grepped to confirm (see Tests).
- Redirect validation: N/A by construction (see Design decisions above).
- Outstanding-token invalidation: a successful magic-link verify clears any
  outstanding `otp_code` for that account; a successful passwordless-OTP
  verify marks any outstanding, unused magic link as used. A fresh
  magic-link request overwrites the previous token's hash (single-slot
  storage, same as OTP's `otp_code`), invalidating it.

## Files changed

- `migrations/016_passwordless_auth.sql` (new) — token hash/expiry/used-at,
  per-account cooldown/hour/day columns for magic links.
- `migrations/017_password_set_flag.sql` (new) — `users.password_set`.
- `server.js` — `sendMagicLinkEmail()`, `issueAndSendMagicLink()`,
  `verifyMagicLinkToken()`; five new routes:
  `POST /api/auth/magic-link/request`, `POST /api/auth/magic-link/verify`,
  `POST /api/auth/passwordless/otp/request`,
  `POST /api/auth/passwordless/otp/verify`, `POST /api/auth/set-password`.
  `clean()` extended to strip the new rate-limit/token columns (see Scope
  changes above) — the only edit to a pre-existing function; every existing
  route (`/api/signup`, `/api/login`, `/api/auth/send-otp`,
  `/api/auth/verify-otp`) is otherwise byte-for-byte unchanged (confirmed
  via diff, not assumed — see Tests).
- `frontend/app/(auth)/verify-magic/page.tsx` (new) — magic-link landing
  page + OTP fallback UI; routes to `/set-password` first when needed.
- `frontend/app/(auth)/set-password/page.tsx` (new) — mandatory
  post-magic-link-signup password step.
- `frontend/app/(auth)/signup/page.tsx` — magic link added as the primary
  path (toggle to reveal the existing, fully-intact password form); shares
  the existing age/terms consent checkboxes (same server-side
  `age_confirmed` requirement `/api/signup` already enforces for new
  accounts; `terms_accepted` is client-side-only, matching `/api/signup`'s
  existing behavior exactly, not a new gap).
- `frontend/app/(auth)/login/page.tsx` — **not net-changed**: magic link
  was added then reverted per the scope clarification above; the file is
  identical to its state before this feature.
- `frontend/lib/types.ts` — added `User.password_set?: boolean`.

## Tests performed

All live testing used a local server instance
(`RESEND_API_KEY=""` for that process only, never touching the real
`.env`) so **no real Resend API call could occur under any code path** —
confirmed by log inspection each round (send-attempt log lines always
matched the exact number of claims that should have reached that stage,
zero unaccounted-for `Sending from=` lines). All test accounts used
`@example.com` addresses (IANA-reserved, can never reach a real inbox) and
were deleted afterward via direct cleanup.

| # | Test | Result |
|---|---|---|
| 1 | Signup with magic link | **PASS** — account created, real 64-char sha256 token hash + 15min expiry + counters stored (verified via direct DB read) |
| 2 | Successful authentication | **PASS** — verified via a controlled token (raw token generated locally, its hash injected directly into the test row — the real flow never logs a raw token, by design, so this is the only way to test verify() without weakening that guarantee); session issued, `email_verified` flipped, confirmed working via `/api/me` |
| 3 | Expired token | **PASS** — `400 {code:"EXPIRED"}` |
| 4 | Reused token | **PASS** — `400 {code:"ALREADY_USED"}` |
| 5 | Invalid token | **PASS** — both a well-formed-but-unknown token and a malformed one → `400 {code:"INVALID"}` |
| 6 | Concurrent magic-link requests | **PASS** — two genuinely simultaneous `fetch()` calls (`Promise.all`, zero `await` between them) for the same account: `magic_link_hour_count` incremented by exactly 1, not 2; exactly one `[MagicLink] Sending...`-stage log line for the pair |
| 6b | Concurrent verify (double-click) | **PASS**, tested beyond what was asked because it's the more security-critical race: two simultaneous verifies of the *same* token — exactly one succeeded, the other got `ALREADY_USED` |
| 7 | Resend cooldown | **PASS** — immediate resend blocked (`429 COOLDOWN`); after a fresh claim, cooldown correctly re-armed |
| 8 | Per-account limits | **PASS** — hourly limit tested at the real boundary (row fast-forwarded to `hour_count:3` via the same service-role DML the app itself uses, then a 4th real request confirmed blocked with the counter unchanged afterward) |
| 9 | IP throttling | **PASS** — confirmed the combined `otpIpLimiter`/`otpIpBlockGate` genuinely spans old and new routes: mixed requests across signup + magic-link-request + passwordless-otp-request all counted toward the same 10/hr ceiling; tripping it blocked the *next* request regardless of which of the three routes it hit |
| 10 | Global email budget | **PASS** — budget temporarily set to 1/hour: a magic-link request consumed the slot, and the very next request (an unrelated OTP-triggering signup) was refused by that same counter — direct proof the two share state, not just a code-reading inference |
| 11 | Magic links can't bypass the circuit breaker | **PASS** — same evidence as #10, from the other direction: an OTP send consumed the budget first, and the next magic-link request was then refused by it too |
| 12 | OTP fallback | **PASS** — new unauthenticated `/api/auth/passwordless/otp/request` + `/verify` both tested: real send, real verify, session issued, wrong-code and non-existent-account both return the identical `400 {code:"INVALID"}` (non-enumeration) |
| 13 | Existing mobile authentication | **PASS** — re-ran the exact existing flow (`/api/signup` → `/api/auth/send-otp` → `/api/auth/verify-otp`, all completely unmodified) end-to-end: cooldown correctly enforced, real code verified, `email_verified` flipped. Confirmed via `git diff` that these three routes have zero changes — not inferred from "I didn't mean to touch them" |
| 14 | npm/node checks | **PASS** — `node --check server.js`, `npx tsc --noEmit`, full `npm run build` (`/set-password` and `/verify-magic` both present in the route list) all clean at each stage |
| — | `password_set` end-to-end | **PASS**, added given the scope change: magic-link signup → verify (`password_set:false` correctly returned, and confirmed neither `magic_link_token_hash` nor `otp_hour_count` leak in the response) → `/api/auth/set-password` rejects a too-short password → accepts a real one → session stays valid immediately after (confirms the deliberate choice not to touch `password_changed_at`) → calling it again is refused (`"Password already set"`) → the real password then works via the completely unmodified `/api/login` |

**Not tested, deliberately**: actual Resend delivery to a real inbox (see
Known limitations).

## Mid-implementation scope changes (both from the user, after initial build)

1. **"Magic link only for signup."** Originally built as a unified
   signup+login entry on both `/login` and `/signup`. Clarified as UI
   placement only, not a backend restriction — reverted `/login` to its
   original password-only form (byte-for-byte the same as before this
   feature touched it); `/signup` keeps magic link as the primary path.
   `/api/auth/magic-link/request` itself is unchanged (still looks up by
   email, would still authenticate an existing account if someone entered
   one on the signup page) — restricting that further wasn't what was
   asked, and doing so unprompted would have been guessing at a security
   boundary that's the user's call, not mine.
2. **"After that password is required."** Clarified as: immediately after
   the first magic-link verification for a new account, before onboarding
   continues. Added `migrations/017_password_set_flag.sql`
   (`users.password_set`, default `true` so no existing account needs
   backfill), set to `false` only by magic-link account creation, a new
   `POST /api/auth/set-password` (authenticated, refuses to run again once
   `password_set` is true, deliberately does NOT touch
   `password_changed_at` — that field invalidates any JWT issued before it,
   which would have broken the very session this request needs to stay
   valid for the rest of the flow), and a new `/set-password` page the
   `/verify-magic` page's post-auth routing redirects to first whenever
   `password_set === false`. From then on, that account logs in with the
   real password like any other (OTP fallback unaffected).

While implementing this, found and fixed a related gap in the *existing*
`clean()` sanitizer (used to shape every user object returned to a client):
it never stripped any of the OTP-rate-limiting columns from migration 015
or the magic-link columns from migration 016 — both would have leaked into
every `/api/me`/`/api/login`/`/api/signup` response. Fixed by extending
`clean()`'s denylist (verified live — see Tests). Not a new problem this
feature introduced on its own; a pre-existing gap from the 015 migration
that this work surfaced and was the natural place to close.

## Known limitations, stated rather than hidden

- **Actual email delivery not verified.** Every test below ran with
  `RESEND_API_KEY` blanked, by design, to avoid touching production quota
  or sending to an uncontrolled address. This proves the entire pipeline up
  to the Resend API call; it does not prove Resend actually delivers the
  email to an inbox. Needs one real, controlled send to confirm — not
  claimed here.
- **Mobile does not get magic-link support.** Web-only, deliberately (see
  Architecture above).
- **`terms_accepted` is not enforced server-side**, matching the pre-existing
  `/api/signup` behavior exactly (not a new gap introduced by this feature).
