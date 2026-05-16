# Known Bugs & Technical Debt — Build Your Network

**Verified from repository files. Last updated: 2026-05-16.**

---

## Already Fixed (documented in server.js comments)

The following bugs were explicitly fixed in the codebase (bug fix comments in server.js):

1. **BUG FIX 1** — Payment replay attack: `POST /api/payments/verify` now checks if payment_id already consumed by a different user; same user allowed (webhook-first race)
2. **BUG FIX 2** — Admin bootstrap brute-force: dedicated `bootstrapLimiter` (10/hr), not shared with authLimiter
3. **BUG FIX 3** — Works spam: `worksLimiter` (5/min) + per-user cap (20 works max) + URL scheme validation
4. **BUG FIX 4** — OTP send rate limit: dedicated `otpSendLimiter` (5/15min) separate from authLimiter (was sharing 50/15min quota with login)
5. **BUG FIX 5** — Message length cap: 2000 chars enforced (was unbounded)
6. **BUG FIX 6** — Priority message length cap: 500 chars enforced (was unbounded)
7. **BUG FIX 7** — adminAuth error splitting: JWT errors → 401, DB errors → 503 (was conflated)
8. **BUG FIX 8** — Search bypassed guards: `GET /api/search` now requires profileGuard + trustGuard
9. **BUG FIX 9** — Profile scraping: `GET /api/profiles/:id` now requires auth + profileViewLimiter
10. **BUG FIX 10** — Webhook secret confusion: `RAZORPAY_WEBHOOK_SECRET` is its own env var, never falls back to `RAZORPAY_KEY_SECRET`
11. **Photo deletion TOCTOU** — Switched from index-based to URL-based deletion to prevent race condition
12. **Daily swipe count** — Fixed to use `{ count: 'exact', head: true }` (correct response shape)
13. **matchScore NaN** — Validates `parseFloat` results before haversine calculation; handles `lat=0` correctly
14. **Recursive sanitization** — `sanitizeObj` now handles arrays of strings, not just string fields
15. **Cloudinary public_id extraction** — Correctly strips extension and prepends folder prefix
16. **multer fallback shape** — Missing multer returns object with `.single()`, `.array()` etc. (not just a function)
17. **Non-blocking reply tracking** — null-safety on `avg_reply_minutes` prevents NaN propagation

---

## Active Technical Debt

### HIGH — Security / Data Integrity

**TD-001: No database foreign keys**
- All relationships (swipes.from_user → users.id etc.) are enforced only in application code
- A DB-level cascade delete is not guaranteed; the admin delete endpoint manually cascades
- Risk: orphaned records if a bug hits the delete path

**TD-002: Audit log in-memory buffer only (partially fixed)**
- `adminAuditLog[]` buffer is capped at 1000 entries and lost on restart
- `GET /api/admin/audit` only returns the in-memory buffer (last 200), not DB records
- `audit_logs` table is written to but never read back via the API
- Fix: change `GET /api/admin/audit` to query the DB table

**TD-003: RLS disabled on all Supabase tables**
- If `SUPABASE_SERVICE_ROLE_KEY` is ever leaked, all data is directly accessible with no row-level protection
- Intentional design choice but increases blast radius of a key leak

**TD-004: `users` table schema divergence**
- `supabase_schema.sql` does not contain: `email_verified`, `otp_code`, `otp_expires_at`, `onboarding_stage`, `headline`, `profession`, `industry`, `experience_level`, `premium_plan`, `premium_since`, `premium_expires_at`
- These columns exist only via separate migration (`docs/onboarding-migration.sql`) and undocumented ad-hoc additions
- A fresh deployment from `supabase_schema.sql` alone would fail

**TD-005: OTP stored in plain text in users table**
- `otp_code` is stored unhashed in the `users` row
- If the DB is compromised, all pending OTPs are exposed
- Fix: hash the OTP before storage, compare hash on verify

### MEDIUM — Performance / Scalability

**TD-006: Discovery loads up to 500 users into memory**
- `GET /api/discover` fetches `.limit(500)` users then filters/scores in Node.js
- Also batch-fetches all works for all 500 candidates
- As user base grows, this will become slow and memory-heavy
- Fix: move scoring to DB or paginate with cursor

**TD-007: `GET /api/connections` message count query is approximate**
- Fetches `connIds.length * 2` recent messages and counts in-memory
- Does not use a proper GROUP BY count; count per connection is unreliable for busy chats

**TD-008: analytics endpoint fetches all connections + up to 100K message rows**
- `GET /api/admin/analytics` loads all connections (unbounded) and up to 100,000 message rows to count distinct connection_ids
- Fix: use a proper `COUNT(DISTINCT connection_id)` DB query

**TD-009: Search is full-table scan**
- `GET /api/search` fetches 200 users then filters in JavaScript
- No DB-level text search; no index on name/interests/skills for text lookup

### LOW — Code Quality / Maintenance

**TD-010: Single monolithic server.js (2,607 lines)**
- All routes, middleware, helpers, and business logic in one file
- No module separation; difficult to test individual units
- Not immediately blocking but will worsen with growth

**TD-011: NetworkMobile (Expo 49) is abandoned but present**
- `NetworkMobile/` contains a fully installed `node_modules/` tree (Expo 49)
- Wastes disk space, causes confusion about which app is active
- Should be deleted or moved to a separate archive branch

**TD-012: `memory/stack.md` was incorrect before this update**
- Previously said: Next.js, Vercel, Supabase backend
- Actual stack: Express.js, Railway, Supabase DB only
- Corrected in this update (2026-05-16)

**TD-013: `RESEND_FROM` defaults to sandbox sender**
- Default `onboarding@resend.dev` only delivers to the Resend account owner
- Production deployments must set `RESEND_FROM` to a verified domain address
- No error is thrown if this is misconfigured — emails silently fail for all users except account owner

**TD-014: `BASE_URL` defaults to `buildyournetwork.in` but CORS allows `.online`**
- Sitemap and robots.txt use `buildyournetwork.in` by default
- Actual production domains are `buildyournetwork.online` and `urnetwork.online`
- Should set `BASE_URL=https://buildyournetwork.online` in Railway env vars

**TD-015: Conversation starters are fully rule-based, not AI**
- Endpoint named `/api/conversation-starters` generates prompts from interest/intent overlap only
- No LLM involved; comment in code says "AI prompts" which is misleading

**TD-016: `unsafe-inline` in Content Security Policy**
- `scriptSrc: ["'self'", "'unsafe-inline'"]` is set with the comment "required until inline JS is extracted"
- Inline scripts in HTML files have not been extracted; this is an open item
