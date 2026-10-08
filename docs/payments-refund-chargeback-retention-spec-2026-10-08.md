# Payments: refund / chargeback handling and payment-record retention — SPEC (draft for approval)

Status: **APPROVED 2026-10-08 (decisions D1-D6 locked, see §8). Implemented locally, NOT committed, NOT deployed.** §1–§7 are the original draft; §8–§11 record what was decided and exactly where the implementation differs from it.
Date: 2026-10-08. Origin: unaudited-surface ledger items 6 and 10 (2026-09-29).
Scope: `server.js` payment routes, `payments` table, the three account-deletion cascades.
Out of scope: Resend/email, Railway, NetworkMobile's stub Upgrade screen, Razorpay account/dashboard configuration (listed under "User actions").

## 1. Verified current state (read from the repo and production on 2026-10-08)

| # | Fact | Where |
|---|------|-------|
| F1 | The webhook handles exactly one event, `payment.captured`. Every other event falls through to `200 { ok: true }` with no action and no log. | `server.js` `app.post('/api/payments/webhook')` |
| F2 | No code anywhere calls Razorpay's refund API, reads a refund or dispute event, or revokes an entitlement because money came back. A refund or chargeback never changes `premium`. | repo-wide: zero hits for refund/chargeback/dispute in code |
| F3 | `payments.status` is documented as `created \| paid`; there is no state for refunded or disputed. | `supabase_schema.sql` payments table |
| F4 | `payments` rows are **hard-deleted** by all three account-deletion paths: `DELETE /api/me`, `DELETE /api/admin/users/:id`, and the 18-month inactivity retention sweep. | `server.js` `from('payments').delete().eq('user_id', id)` ×3 |
| F5 | The published Privacy Policy (§7) says: "Payment records may be retained for up to 7 years to comply with financial regulations." **The code does the opposite** (F4). The Terms (§7) say: "We do not offer refunds for partial billing periods except where required by law." | `frontend/app/(legal)/privacy/page.tsx`, `terms/page.tsx` |
| F6 | Account deletion is `anonymizeUser()`, an UPDATE; the `users` row survives as a scrubbed shell. No code path hard-deletes a `users` row. So `payments.user_id` (FK `ON DELETE CASCADE`) can keep pointing at a live row — retention is mechanically easy. | `anonymizeUser`, grep for `from('users').delete` = none |
| F7 | `anonymizeUser()` does not touch `premium` / `premium_expires_at` / `premium_plan` / `premium_since`. A deleted account keeps its entitlement fields. (The admin premium count now excludes deleted accounts — commit `d960992`.) | `anonymizeUser` |
| F8 | Entitlement grant is already atomic and idempotent: `process_payment_entitlement()` (migration 022) locks `payments` then `users` (always in that order), marks paid and extends `premium_expires_at` to `GREATEST(COALESCE(current, now()), now()) + days`. Admin grants set `premium_expires_at = NULL` (perpetual). `isPremiumActive` treats NULL as perpetual and the hourly sweep never touches NULL. These are **locked invariants** (see memory `project-premium-entitlement`). | migration 022, `isPremiumActive`, `runPremiumExpirySweep` |
| F9 | The webhook has no event-id dedupe. Razorpay's docs state that webhooks can arrive duplicated and out of order and that `x-razorpay-event-id` is unique per event and should be used to detect duplicates. Retry schedule and timeout are **not documented** on the pages I could read. | Razorpay docs (webhooks, validate-test) |
| F10 | Razorpay event names confirmed from its docs: `refund.created`, `refund.processed`, `refund.failed`, `refund.speed_changed`; `payment.dispute.created`, `.won`, `.lost`, `.closed`, `.under_review`, `.action_required`. Refund entity fields include `id`, `payment_id`, `amount`, `currency`, `status`. Dispute entity fields include `id`, `payment_id`, `amount`, `currency`, `status` (open/won/lost/closed/under_review), `phase` (chargeback/fraud), `respond_by`, `amount_deducted`. **A refund entity carries `payment_id` but, per the doc excerpt, not `order_id`.** | Razorpay docs |
| F11 | Production scale today: **1** payment row ever (₹249 monthly, paid, 2026-05-09), 34 users with `premium=true` (so nearly all premium is admin/referral/legacy, not purchased), 0 premium-and-deleted, 0 referral rewards. | read-only count against prod |

Consequence: financial exposure is small today, but F4/F5 is a live contradiction between what we publish and what we do, and F1/F2 means the first real refund or chargeback will silently leave a free subscription in place.

## 2. Two separable parts

Part A (retention) is small, independent and has no product decisions beyond one number. Part B (reversals) is the larger design. They can ship in either order; I recommend A first.

### Part A — payment-record retention

**Proposed behavior**
1. Remove the `payments` delete from all three cascades. The row stays, keyed to the anonymized `users` shell (F6). `payments` holds no direct personal data beyond ids, plan, currency and amount (Privacy §"Payment data"), so keeping it after anonymization does not retain PII beyond what the policy already says.
2. Make the retention explicit and non-accidental: change the FK from `ON DELETE CASCADE` to `ON DELETE RESTRICT` so a future hard delete of a `users` row cannot silently erase financial history. (Migration; no behavior change today since nothing hard-deletes users.)
3. A purge for payment rows older than the retention period **is not built in v1**: the system has existed for ~5 months, so nothing is near the limit. Record the period (7 years, per the published policy) in a code comment next to the cascade and in this spec; build the purge when the first row approaches it.
4. No change to Privacy/Terms text: after this fix the code matches what is already published.

**Decision needed (D1):** Is "up to 7 years" the right number to honor? It is what the Privacy page promises; whether Indian tax/accounting rules require that is a question for your accountant/counsel, not something I can establish from the repo. Default if you do not object: honor the published 7 years.

**Tests:** new test in the existing harness style (embedded Postgres + the real `server.js`): after each of the three deletion paths, the user's `payments` rows are still present and the user is anonymized; other tables' deletes unchanged; admin-delete and self-delete still answer 200. Pre-fix server must fail the new checks.

### Part B — refund and chargeback handling

**Principles** (all carried over from existing locked decisions)
- Fail closed and atomic: a reversal is one Postgres transaction (same pattern as 022); on any failure answer 5xx so Razorpay redelivers; never half-apply.
- Idempotent: duplicate or replayed events change nothing.
- Never touch a NULL-expiry (perpetual/admin) entitlement (F8). Revocation only ever subtracts days that a payment itself added.
- Webhook signature verification and the raw-body HMAC stay exactly as they are.

**B1. Data model (migration 027, additive)**
- `payments`: allow `status` values `created | paid | partially_refunded | refunded | disputed | chargeback_lost`; add `refunded_amount integer NOT NULL DEFAULT 0`, `entitlement_reversed_days integer NOT NULL DEFAULT 0`, `reversed_at timestamptz`.
- New append-only ledger `payment_events`: `event_id text PRIMARY KEY` (the `x-razorpay-event-id` header — this is the idempotency key), `event_type text`, `razorpay_payment_id text`, `entity_id text` (refund or dispute id), `amount integer`, `currency text`, `entity_status text`, `payment_row_id text NULL`, `outcome text` (`applied | no_change | unmatched | deferred`), `received_at timestamptz`, `payload jsonb` (the Razorpay entity only; no card data exists in these events).
- RLS enabled with no policies (service role only), same as `payments`.

**B2. Event handling (webhook)**
Subscribe to: `refund.processed`, `refund.failed`, `payment.dispute.created`, `payment.dispute.won`, `payment.dispute.lost`, `payment.dispute.closed`. Other event names are still acknowledged 200 but are now **logged once and stored in the ledger as `no_change`** instead of vanishing (F1).

| Event | Ledger | `payments` | Entitlement |
|---|---|---|---|
| `refund.processed`, **full** (cumulative refunded ≥ paid amount) | record | `refunded` | reverse the plan's days (see B3) |
| `refund.processed`, **partial** | record | `partially_refunded`, `refunded_amount` updated | **none** (D3) |
| `refund.failed` | record | none | none |
| `payment.dispute.created` | record | `disputed` | **none** (D4); Slack alert via the existing `sendSlackWebhook` |
| `payment.dispute.lost` | record | `chargeback_lost` | reverse the plan's days |
| `payment.dispute.won` / `.closed` | record | back to `paid` if currently `disputed` | none |

**B3. Reversal semantics ("subtract what the payment added")**
Grants stack: expiry = `max(now, current) + days`. The faithful inverse is `expiry − plan_days`, **not** `premium=false`:
- If `premium_expires_at IS NULL` → do nothing (perpetual; admin grant after purchase must survive). Ledger outcome `no_change`.
- Else `new_expiry = premium_expires_at − days`; if `new_expiry <= now()` → `premium=false` (leave `premium_expires_at` as is, matching how the sweep and admin revoke already behave); else keep `premium=true` with the earlier expiry.
- Record `entitlement_reversed_days` on the payment so the same payment can never be subtracted twice (a refund followed by a chargeback on one payment reverses once).
- A reversal for an account already deleted still updates `payments` and the ledger but does not need to touch the shell's entitlement (D5).

Why not simply `premium=false`: a user who bought a month, then earned a referral month, then had the purchase refunded would lose time they never paid for under that payment. Subtracting is exact and keeps the locked invariant intact.

**B4. Matching an event to a payment row**
Refund and dispute entities carry `payment_id`, which we store in `payments.razorpay_payment_id` once granted. Cases:
- Row found → proceed.
- Not found (the refund beat our own `payment.captured` processing — Razorpay documents out-of-order delivery): record the event as `deferred`; then `process_payment_entitlement()` is extended to look for a recorded full refund or lost dispute for that payment id before granting, and if one exists marks the payment `refunded`/`chargeback_lost` **without** granting. This closes the "refund arrives first → free premium granted afterwards" race.
- Truly unknown payment id → `unmatched`, logged and Slack-alerted, 200 (retrying cannot fix it).
- Fallback if a needed `order_id` is missing from an event: fetch the payment through the Razorpay API (`razorpay.payments.fetch`) to resolve it.

**B5. Atomic RPC**
New `process_payment_reversal(p_event_id, p_event_type, p_payment_id, p_entity_id, p_amount, p_currency, p_entity_status, p_payload)` — one function = one transaction: insert the ledger row (PK conflict → return `already_processed`), lock `payments` then `users` (same order as 022, so no deadlock), apply B2/B3, return `{outcome, user_id}`. EXECUTE revoked from PUBLIC/anon/authenticated exactly like 022. The server calls it from the webhook, calls `authCacheInvalidate(user_id)` when `premium` changed, and answers 5xx on any error.

**B6. Observability**
Admin: read-only `GET /api/admin/payments` (rows + refund/dispute state) and an `auditLog` entry for each applied reversal (actor `system:razorpay`). No admin write endpoint in v1.

**B7. Non-goals for v1** (call out so they are conscious): initiating refunds from BYN (refunds are issued in the Razorpay dashboard, and the webhook does the rest); pro-rata partial-refund revocation; a periodic reconciliation job that pulls refunds from the Razorpay API (worth adding if the webhook retry window turns out to be short — I could not find it in the docs); user-facing refund emails (email delivery is currently suspended; Razorpay notifies the payer itself).

## 3. Decisions needed from you

| ID | Question | My recommendation |
|----|----------|-------------------|
| D1 | Retention period for payment records | Honor the published 7 years; confirm with your accountant that this is the right figure |
| D2 | Full refund → subtract plan days (B3) vs. set `premium=false` | Subtract days, never touch NULL expiry |
| D3 | Partial refund → record only, or revoke pro-rata | Record only + flag; Terms already say no partial-period refunds |
| D4 | Dispute opened (`created`) → revoke immediately, or wait for `lost` | Wait for `lost`; alert on `created`. One real payment exists, so the cost of waiting is tiny and it avoids revoking a customer who wins the dispute |
| D5 | Deleted account whose payment is later refunded → touch the shell's entitlement? | No: record only. (Related: should `anonymizeUser` clear `premium*` fields? I recommend leaving it alone for now — counts already exclude deleted accounts — and revisiting separately) |
| D6 | Ship Part A and Part B together, or A first | A first (small, closes the policy contradiction); B in the same controlled release |

## 4. User actions (I cannot and will not do these)
- In the Razorpay dashboard, add the event subscriptions listed in B2 to the existing webhook (today only `payment.captured` is subscribed per the code comment). This must happen **after** the new code and migration are live, otherwise events would hit the old no-op handler.
- Apply migrations **026 then 027** in Supabase, in that order, before deploying the code (same order rule as 022: the code fails closed without them). Never deploy the Part B code against a database that has only 026.
- Confirm the Razorpay webhook retry window if you can find it in the dashboard (affects whether a reconciliation job is needed).

## 5. Test plan (existing harness: real `server.js` over embedded Postgres, nothing touches production)
Part A: three deletion paths keep `payments`; FK is RESTRICT; pre-fix fails.
Part B, against the real RPC and webhook (signed with a test secret):
1. Full refund reverses exactly the plan's days; premium stays true if time remains, false if not.
2. NULL-expiry (admin) user: refund → no entitlement change, ledger `no_change`.
3. Stacked grants (purchase + referral month): refund subtracts only the purchase's days.
4. Partial refund: status `partially_refunded`, entitlement unchanged; later cumulative full refund reverses once.
5. Duplicate delivery (same `x-razorpay-event-id`) and replay with a different event id for the same refund id: second is a no-op.
6. Refund then chargeback on one payment reverses once (`entitlement_reversed_days`).
7. Dispute: `created` → `disputed` + no revocation; `won` → back to `paid`; `lost` → reversal.
8. Out of order: refund before capture → later capture marks refunded and grants nothing.
9. Unknown payment id → 200, ledger `unmatched`, nothing else changes.
10. Failure injection in the RPC → 5xx, nothing applied (transaction rolled back), then a retry succeeds.
11. Bad signature → 400; missing webhook secret → 503 (unchanged); unrelated events still 200 and are ledgered.
12. Existing payment suites (`test-payment-entitlement-sql`, `-idempotency`, `-plan-source`) unchanged and green; pre-fix server fails the new checks.

## 6. Rollout
Migration 026 → migration 027 → deploy code → add Razorpay event subscriptions → verify with a Razorpay **test-mode** refund and dispute before relying on it. Ships inside the single controlled release (priority item 6), not separately.

## 7. What I verified vs. did not
Verified: everything in §1 F1–F9 and F11 from the repo and a read-only production count; F10 from Razorpay's public docs pages (refund/dispute entity field lists come from sample payloads). **Not verified:** webhook retry schedule and timeout (not in the docs I could read); whether Razorpay's refund entity ever includes `order_id` (B4 is written to not depend on it); any legal retention requirement (D1).


## 8. Locked decisions (2026-10-08)

| Decision | Locked |
|---|---|
| D1 | 7-year published retention; no destructive deletion now; the expiry lifecycle is defined separately (§9). This is a product/privacy-policy decision, **not** a claim that seven years is legally required |
| D2 | Full refund reverses the exact days that payment contributed; never a blanket `premium=false`; a NULL (perpetual) expiry is never touched; atomic |
| D3 | Partial refund = record only; no pro-rata reversal (no defined mapping from refund amount to entitlement duration) |
| D4 | Revoke on a confirmed LOST dispute, not when a dispute is opened |
| D5 | Refund after account deletion = record only; no entitlement mutation, no resurrection logic |
| D6 | Part A + Part B ship as one controlled release, as logically separate stages with separate tests |

Release sequence (locked): Supabase migrations 026 (retention) and 027 (reversals), in that order → Part A retention protection → Part B webhook/event ledger + reversal → focused payment tests → full regression → release audit → production deployment → subscribe the required Razorpay webhook events → controlled webhook verification. Razorpay subscriptions are enabled only after the live code is ready.

## 9. Retention lifecycle (D1) and the defined follow-up

```text
payment created → retained → survives account anonymization → retained for the published period (7 years)
               → eligible for controlled expiry after that period
```

Implemented now (Part A): the three destructive cascades no longer delete `payments`, and migration 026 makes the `payments → users` foreign key `ON DELETE RESTRICT`. Payments are therefore retained, and are **not** permanent by intent: the expiry step is defined here and deliberately not built yet (the system is ~5 months old, so nothing is anywhere near the limit).

Defined follow-up (needs its own approval before any code):
- **Eligibility:** a `payments` row is eligible 7 years after `created_at`; its `payment_events` rows (same `razorpay_payment_id`) expire together with it.
- **Mechanism:** a scheduled job, **dry-run first** (logs the count and ids it WOULD remove for at least one cycle before it is allowed to delete), then delete in bounded batches, logging the number removed. Age is the only criterion; it never touches a row younger than the period.
- **Open questions to settle first:** whether the clock starts at `created_at` or at the last event on the payment (a refund or dispute can occur months later); whether live accounts' rows expire on the same schedule as deleted accounts'; whether an accountant/legal review wants a different period.

## 10. Implementation map and deviations from the draft

Files:
- `migrations/026_payment_retention.sql` — Part A only: the `payments → users` foreign key changed from `ON DELETE CASCADE` to `ON DELETE RESTRICT`.
- `migrations/027_payment_reversals.sql` — Part B only: the new `payments` columns, the `payment_events` ledger, `process_payment_reversal`, `payment_refunded_total`, and the replaced `process_payment_entitlement`. Depends on 026 in deploy order (026 → 027 → application code).
- `server.js` — the three `payments` deletes removed; `handlePaymentReversalEvent`; webhook dispatch for `refund.*` / `payment.dispute.*`; the `already_reversed` outcome; `/api/payments/verify` answers 409 for a refunded payment; `GET /api/admin/payments` (read-only).
- Tests — `test-payment-retention.mjs` (Part A, 21 checks), `test-payment-reversal-sql.mjs` (the SQL logic on real Postgres, 67 checks), `test-payment-reversal-webhook.mjs` (through the real server, 34 checks).

Deviations from the draft (§1–§7), all deliberate:
1. **`deferred` is folded into `unmatched`.** The database cannot tell "capture not processed yet" from "unknown payment"; `process_payment_entitlement()` consults the ledger by Razorpay payment id either way. The extra outcome `rejected` (currency mismatch) was added.
2. **No Razorpay API fallback fetch (B4).** Matching is by `razorpay_payment_id` and the out-of-order case is handled through the ledger, so the fallback was unnecessary.
3. **`payment.dispute.closed` is record-only** (the draft returned a disputed payment to `paid` on won *or* closed). `closed` does not say who won, so only `won` clears `disputed`.
4. **Only `refund.*` and `payment.dispute.*` events are ledgered.** Other events (for example `payment.authorized`) are acknowledged 200 without a ledger row; the draft proposed ledgering every event name.
5. **Ledger instead of `auditLog`.** `audit_logs.admin_id` is an admin actor; a webhook has none. `payment_events` (with `outcome` and `detail`) is the durable audit record, exposed read-only by `GET /api/admin/payments`.
6. **Two fixes the draft did not anticipate, both found by the tests:**
   - Both functions take a per-payment advisory lock first. A refund racing the capture it refunds could otherwise each miss the other (the refund finds no payments row yet; the grant finds no ledger row yet) and leave a refunded payment with a live grant. Found by the concurrency test.
   - The reversal compares against `clock_timestamp()`, not `now()`. `now()` is the transaction's start time, so a reversal that began waiting before the grant committed could leave premium true on an expiry milliseconds away. Found by running the race test repeatedly.
7. **`granted_days`** is recorded at grant time so a reversal subtracts what was actually added. Rows granted before the migration (the one existing payment) fall back to the plan's days, supplied by the server from `PLANS`.
8. **`process_payment_entitlement` changed in exactly three ways**, all inside the approved reversal path: "already processed" is now any status other than `created` (a replayed capture can no longer re-grant a refunded payment); a refund or lost dispute recorded before the capture is honoured; `granted_days` is stored. Grant semantics are otherwise unchanged and re-verified.
9. **`/api/payments/verify`** now answers 409 (instead of the premium success screen) for a payment that was refunded or lost to a dispute — both when the verify arrives first and when the payment row already exists.
10. **New optional config:** `SLACK_PAYMENTS_WEBHOOK_URL` (alerts on an opened dispute / unmatched / rejected events). Unset = no-op; the same facts are always `console`-logged.

## 11. Not verified

- Migrations 026 and 027 have been exercised only on embedded PostgreSQL, not against the real Supabase project. I could not inspect production's `payments` constraint name or schema read-only; 026 finds the foreign key by what it is (payments → users), not by name, to be safe.
- The production behavior of Razorpay's refund/dispute payloads has not been exercised: field names come from Razorpay's documentation samples. The controlled test-mode verification in the release sequence is the real check.
- The webhook retry schedule and timeout are not documented on the pages I could read; if the retry window turns out to be short, a periodic reconciliation job (not built) is the mitigation.
