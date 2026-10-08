# Release audit — production `35e4d27` → local `main` (2026-10-08)

Auditor: Claude (inline review; no sub-agents). Scope: everything unpushed — 11 commits plus the F1 audit fix (commit `5fd5891`, local only). Final local head at the time of writing: `5fd5891` + this document. **Nothing has been pushed, deployed, or applied to Supabase.** Approval gates per `CLAUDE.md`: security review before deployment (§5), QA approval before release (§9, needs the owner).

## 1. Verdict

**CONDITIONAL GO.** The code is releasable once the conditions below are met; none of them is a code defect that remains open.

| # | Condition | State |
|---|---|---|
| C1 | Finding F1 (liked-me breaks for users with many likers) fixed and committed | **DONE — commit `5fd5891`; test 6/6 (3 of 6 failed before the fix)** (§4) |
| C2 | Migrations **026 then 027** applied to Supabase **before** the code is deployed | **your action** (§8) |
| C3 | Full regression on the final code | **DONE — Run 2 in §10 was run on exactly the code of `5fd5891`: 42 of 44 files executed and passing, 2 intentionally not run** |
| C4 | QA approval from you (§9) | pending |
| C5 | Razorpay refund/dispute webhook events subscribed **only after** the code is live | **your action**, last step |

Known limitation that this release does **not** change: transactional email is still suspended (Resend), so sign-up verification, magic-link and OTP login remain broken in production independently of this release (§7, F5).

## 2. What ships

| Commit | Area | User-visible effect | Risk |
|---|---|---|---|
| `e4d72de` | NetworkApp (mobile) profile-complete gate | no score-only fallback (matches server) | Low — **mobile build, not Railway** |
| `72edb70` | priority-messages sender sanitization | a sender's `premium_expires_at` no longer leaks | Low |
| `062ab70` | report: live-target check + 5/hour per-user limit | 404 for nonexistent/banned/deleted targets; 429 after 5 reports/hour | Low-Med (new limit) |
| `68cf7d1` | reports kept as durable evidence | reports survive account deletion | Low |
| `2f264f3` | profile/photo write failures reported as failures | 500 + real error logged instead of fake success | Low |
| `eb5bdc3` | circles feed/likes/collaborations honor ban/deletion/block | blocked/banned/deleted authors vanish from feed; 404 on like/collab | Low |
| `2b04a57` | liked-me / skip / block honor ban, deletion, block | liked-me count drops (no dead likers); skip/block 404 on dead targets | Low-Med (F1) |
| `194d8af` | skip/block write failures | 500 instead of silent `ok` | Low |
| `d960992` | admin `is_active`, `premium` count, Deleted badge | admin panel only | Low |
| `3d31463` | payment records retained (migration 026) | none for users | Low |
| `d8b7460` | refund/dispute reversals (migration 027) | refunds/chargebacks now remove purchased premium days; `/verify` 409 for refunded payment | Med (money path; heavily tested) |

**Deploy units:** backend `adequate-dedication` (server.js) · `Frontend` (the live admin page is `frontend/public/admin.html`, proven byte-identical to `https://buildyournetwork.online/admin.html`; the copies in `public/` and `docs/` are stale and not part of this) · Supabase (026, 027) · Orchestrator **unchanged** · NetworkApp needs an app build/distribution (separate from Railway). No `package.json` change. One new optional env var: `SLACK_PAYMENTS_WEBHOOK_URL` (unset = no-op).

## 3. Verified production facts (read-only probes, 2026-10-08)

- Migrations through **025** are applied (020 `referral_rewards`, 023 `audit_logs` / `reports.type` / `deletion_scheduled_at`, 025 `moderation_events` all present). **026 and 027 are not applied** (`payments.refunded_amount` → 42703; `payment_events` → PGRST205).
- Migration 022 is applied (`process_payment_entitlement` exists and answers `not_found` for an unknown order).
- `payments`: 1 row (one paid ₹249 monthly); 34 users with `premium=true`.
- `origin/main` = `35e4d27` = what is running.
- **Deploy-order safety, proven by test:** the *old* production code (`35e4d27`) run through its own 42-check payment suite against a database with **026 and 027 applied** passes 42/42. So applying the migrations first is safe while the old code is still serving.

## 4. Findings

| ID | Severity | Finding | Status |
|---|---|---|---|
| F1 | **Medium — FIXED (commit `5fd5891`)** | `GET /api/liked-me` (commit `2b04a57`) looks likers up with one `.in('id', <all ids>)`. ~37 bytes of URL per id, so a user with several hundred unswiped likers got a 500 — for **free** users too, who previously fetched only six preview rows. (The premium path already did one unbounded `.in()`.) Reproduced: 700 likers → 500 for both tiers. | Fixed in `server.js`: `selectUsersByIds()` looks users up in chunks of 100 ids, used for the liveness check and the premium profile fetch. Test `test-liked-me-large-list.mjs` (700 likers, mixed live/banned/deleted): **6/6 pass, 3 of 6 failed before the fix**. One side effect, intended: the premium profile fetch now throws on a database error instead of silently returning an empty list. Committed locally, not pushed. |
| F2 | Low | Razorpay's `x-razorpay-event-id` header is not covered by the webhook signature. Someone holding a previously signed body could replay it with a fresh header and add ledger rows. **No entitlement effect**: refund totals are keyed by refund id, the reversal runs at most once per payment, and the status transitions are idempotent. Needs a captured signed body to exploit. | Accepted; optional hardening later (dedupe on event type + entity id). |
| F3 | Low | Three copies of `admin.html` (`frontend/public/` is live; `public/` and `docs/` are stale). Drift risk, not a release risk. | Noted; cleanup separately. |
| F4 | Info | After 026, a users row that still has payment records cannot be hard-deleted (FK `RESTRICT`) — e.g. deleting the one paying user from the Supabase dashboard will error. Intended. Account deletion (anonymization) is unaffected. | Intended |
| F5 | Info / launch risk | Email delivery is still suspended. This release does not fix it; post-deploy smoke tests that need an OTP or magic link cannot run, and new sign-ups still cannot verify. | Open, tracked (priority 5) |
| F6 | Info | NetworkApp change reaches users only with a new mobile build. Server is independent of it. | Noted |
| F7 | Info | All rate limiters (including the new per-user report limit) use the in-memory store; correct only while the API runs a single replica (the repo's own comment says 1 as of 2026-09-04). | Pre-existing; unchanged |
| F8 | Info | Reports and the new payment ledger have no expiry job (reports: by locked design; payments: 7-year job is a defined follow-up). | By design |

Defects found and fixed **during development** (kept for the audit trail): a refund-vs-capture race that could leave a refunded payment with live premium (per-payment advisory lock added to both functions); a `now()` vs `clock_timestamp()` artifact (premium left true on an expiry milliseconds away).

## 5. Security review

| Area | Check | Result |
|---|---|---|
| Webhook authenticity | signature verified (HMAC-SHA256, constant-time compare, dedicated secret, fails closed 503/400) **before** any parsing of refund/dispute events; unchanged code path | OK |
| Webhook idempotency / replay | ledger PK on event id; refund total deduped by refund id; reversal at-most-once per payment; concurrency tested with 8 parallel connections and 12 refund-vs-capture races | OK (F2 noted) |
| SQL injection | all RPC arguments are parameters; no string-built SQL; the only dynamic filter strings are server-generated ISO timestamps and ids already validated | OK |
| Privileges | new functions: EXECUTE revoked from PUBLIC/anon/authenticated, granted to `service_role`; new table has RLS enabled with no policies; replaced function keeps its 022 grants (tested) | OK |
| Entitlement integrity | NULL (perpetual/admin) expiry never modified; days subtracted are exactly those granted; a replayed capture cannot re-grant a refunded payment; refund-before-capture honoured | OK, tested |
| New endpoint | `GET /api/admin/payments`: `adminAuth` + the existing admin rate limiter; read-only; returns ids/amounts/status, no emails or raw payloads; 401/403 tested | OK |
| Information disclosure | skip/block/report/like/collab answer one uniform 404 for nonexistent/banned/deleted/blocked; 500s log the real error, return a generic message (tested) | OK |
| Logging | webhook logs event type, Razorpay payment id and outcome only; no card data exists in these events; Slack alerts carry the same | OK |
| Input validation | block/skip ids validated by `isValidId`; report target length-bounded; webhook payload fields type-checked before use | OK |
| Secrets | no new secret; one optional URL env var; nothing committed | OK |
| Retention / privacy | payment records now kept as the Privacy Policy already says (up to 7 years); expiry job is a defined follow-up (spec §9) | OK, consistent |

## 6. Test evidence

New or extended suites in the range (all pass; each was also run against the **pre-fix** code and fails there, proving it tests the change): liveness/liked-me/skip/block 26 · skip/block write failures 31 (15 fail pre-fix) · admin 16 (4 fail pre-fix) · payment retention 21 · reversal SQL 67 (real Postgres, concurrency, rollback) · reversal webhook 34 (22 fail pre-fix) · plus the earlier A7/A8/A13/priority-message/circles/profile-write suites. Existing payment suites (entitlement SQL 31, idempotency 42, plan-source 48) still pass.

Regression: see §10. Two of the 43 test files (`test-registration-flow`, `test-onboarding-profile-completion`) are intentionally never run: they require a local server pointed at production Supabase.

## 7. Not verified (residual risk)

- Migrations 026/027 have only run on embedded PostgreSQL, never on the real Supabase project (its `payments` constraint name and schema could not be inspected read-only; 026 finds the FK by what it is, not by name).
- Razorpay's real refund/dispute payloads have not been exercised; field names come from Razorpay's documentation samples. The test-mode check in §8 is the real verification.
- The gateway's actual maximum URL length in front of Supabase was not measured (F1 is fixed by chunking regardless).
- The Razorpay webhook retry schedule/timeout is not in the docs pages I could read.
- No browser/E2E suite exists for the web app or admin page (known gap); the admin badge change was verified by reading the code path and the API-level tests only.

## 8. Deployment runbook (do not start without your approval)

**Pre-flight**
1. You approve this audit (§9) and the F1 fix commit.
2. Confirm production is healthy (`/api/health`, `/api/stats/public`, frontend 200) and pick a low-traffic window.
3. Save the rollback material: run `SELECT pg_get_functiondef('process_payment_entitlement(text,text,text,int)'::regprocedure);` in the Supabase SQL editor and keep the output; export the (tiny) `payments` table.

**Order — never reorder**
1. **Apply `migrations/026_payment_retention.sql`** in the Supabase SQL editor. Verify: `SELECT confdeltype FROM pg_constraint WHERE conrelid='payments'::regclass AND contype='f' AND confrelid='users'::regclass;` → `r`.
2. **Apply `migrations/027_payment_reversals.sql`.** Verify: the four new `payments` columns exist, `payment_events` exists, both functions exist. Then run `NOTIFY pgrst, 'reload schema';` so PostgREST sees them immediately.
3. Smoke test the **still-old** production (proven compatible): health, stats, payments config.
4. **Push `main`** (your explicit approval) → deploy `adequate-dedication` and `Frontend` (Orchestrator needs no redeploy).
5. Smoke test the new build: health 200; `/api/payments/config` 200; webhook with a bad signature → 400; `GET /api/admin/payments` without a token → 401; admin page loads, shows Deleted/Incomplete badges correctly, and the analytics premium count is ≤ the previous 34 (it now excludes deleted accounts and lapsed expiries — a lower number is expected, not a fault).
6. **Only now** (you, in the Razorpay dashboard): subscribe `refund.processed`, `refund.failed`, `payment.dispute.created`, `payment.dispute.won`, `payment.dispute.lost` (and optionally the other `refund.*` / `payment.dispute.*`) to the existing webhook.
7. Controlled verification in Razorpay **test mode**: a refund and a dispute on a test payment; confirm the ledger row (`GET /api/admin/payments`), the payment status and the entitlement change. Do not use a live payment.
8. Watch the backend logs for `[payments/webhook]` and `process_payment_reversal failed` for the first day.

**Rollback**
- **Code:** redeploy the previous deployments of `adequate-dedication` and `Frontend` (`35e4d27`). Safe at any point.
- **Database:** nothing needs reverting for the code rollback — the old code is proven compatible with 026+027 (§3). If you still want the old function back, re-apply `migrations/022_atomic_payment_entitlement.sql` (it `CREATE OR REPLACE`s the original) — but note the old function does not know the new `status` values, so only do that together with the code rollback and only if no refund has been recorded. To undo 026: `ALTER TABLE payments DROP CONSTRAINT payments_user_id_fkey; ALTER TABLE payments ADD CONSTRAINT payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;`.
- **Razorpay:** removing the new event subscriptions stops all new ledger writes immediately.

## 9. QA sign-off checklist (owner)

- [ ] Audit findings F1–F8 read (the F1 fix is already committed locally as `5fd5891`)
- [ ] Deploy order understood: 026 → 027 → code → Razorpay subscriptions
- [ ] Window chosen; rollback material saved (§8 pre-flight 3)
- [ ] Accept the user-visible changes in §2 (notably: 5 reports/hour limit; liked-me counts exclude banned/deleted users; refunds now remove purchased days)
- [ ] Accept §7 residual risks and F5 (email still down)
- [ ] Explicit go to push and deploy

## 10. Regression results

**Run 1 — clean tree at `d8b7460` (before the F1 fix): clean.** 40 test files print a RESULTS line and every one passes with 0 failures; `test-a13-mobile-profile-complete-gate.mjs` passes (14 passed, 0 failed) but uses a different output format. That is **41 of 43** files executed and passing. The other **2 of 43** (`test-registration-flow.mjs`, `test-onboarding-profile-completion.mjs`) were intentionally not run: they require a local server on :3000 pointed at production Supabase (`test-registration-flow` also fails identically with the changes stashed, so it is not a regression signal either way). This is *not* a 43/43 run and should not be reported as one.

**After the F1 fix:** the new `test-liked-me-large-list.mjs` 6/6, and the neighbouring suites that exercise liked-me / target eligibility / block / public-profile shaping re-run clean (liveness-liked-me-skip-block 26, a8 63, a11 37, a12 34).

**Run 2 — working tree with the F1 fix (44 files, including the new `test-liked-me-large-list.mjs`): clean.** 41 files print a RESULTS line and all 41 pass with 0 failures (this includes the new large-list test, 6/6); `test-a13-mobile-profile-complete-gate.mjs` passes (14 passed, 0 failed; different output format); the same 2 files as in Run 1 were intentionally not run. That is **42 of 44** files executed and passing, **2 of 44** intentionally not run — again, not a 44/44 run. The tree under test was `d8b7460` plus the F1 change in `server.js`, which is exactly what commit `5fd5891` contains (verified by diffing the staged change against the tested tree: no other file differs), so this run is the evidence for the final code.
