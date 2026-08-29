# Matching & Chat Audit — 2026-08-14

Scope: full swipe→match→connect→chat pipeline. `server.js` endpoints `/api/discover`,
`/api/swipe`, `/api/skip`, `/api/connect`, `/api/connections`, `/api/connections/:connId`,
`/api/messages/:connId` (GET+POST), `/api/block`; frontend `DiscoverFeed`, `SwipeCard`,
`ContextPanel`, `ProfileInspectOverlay`, `MatchModal`, `ConversationList`, `ChatWindow`,
chat list/detail pages. Follows the `c70a572` chat-visibility fix already shipped today.

Method: read every endpoint and its callers end-to-end, cross-referenced against
`supabase_schema.sql` and `migrations/*.sql` rather than assumed. No code changed —
audit only, per standing workflow.

---

## P0 — confirmed bug

### 1. Chat "unread" never clears on read, only on reply
`ConversationList.tsx`'s bold/unread state comes from `unread_count`, which
`/api/connections` (`server.js:5021`) computes as:
```js
const unread_count = (lastMsg && lastMsg.from !== req.user.id) ? 1 : 0;
```
i.e. "is the most recent message from the other person" — recomputed fresh on every
poll. There is no "mark as read" mechanism anywhere for the `messages` table (confirmed
by grep: zero `read`/`is_read` handling for messages in `server.js`; `ChatWindow.tsx`
never calls any such endpoint). Contrast with `priority_msgs`, which *does* have a real
`read` column and a `/api/notifications/read` pattern.

**Effect:** open a chat, read every message, go back to the list — it's still shown
unread (bold text via `.chat-preview.unread` in `app.css:550`). Only sending a reply
clears it. This will read as "the app doesn't know I've read my messages" to users.

**Fix shape** (not yet implemented): add a `read_by` or `last_read_at`-style column,
mark-as-read on `GET /api/messages/:connId` (or an explicit call from `ChatWindow` on
mount/focus), and compute `unread_count` from messages after that watermark instead of
"last message not mine."

---

## P1 — real inconsistency / risk

### 2. `/api/swipe` duplicates `/api/connect`'s match logic — CORRECTION, not dead code
**Correction to the original version of this finding**, caught before any fix was
attempted: I initially grepped only `frontend/` and found zero callers, and called
`/api/swipe` dead code. This repo has more clients than the Next.js app — a full
re-grep of the repo root shows `/api/swipe` is actively called by **both** React
Native apps (`NetworkApp/src/screens/DiscoverScreen.js:496`,
`NetworkMobile/src/screens/DiscoverScreen.js:122`) and referenced in
`public/webapp.html`. Both mobile apps have commits within the last ~2 weeks, so
neither reads as legacy/abandoned. **`/api/swipe` is live and must not be deleted.**

The underlying observation still holds, just with lower confidence and no proposed
fix: `/api/swipe` (`server.js:4733`, used by mobile) and `/api/connect`
(`server.js:4843`, used by the Next.js web app) independently reimplement "check
limit → check duplicate → insert swipe → check mutual → create connection → notify"
— ~90 nearly-identical lines, with at least one behavioral difference already:
`/api/connect` checks for an existing `connections` row (`existingConn`) *before*
touching `swipes`; `/api/swipe` does not. Two platforms hitting two parallel
"create a match" code paths is a real drift risk worth converging (e.g. have
`/api/swipe`'s right-swipe branch call the same internal helper `/api/connect` uses)
— but that's a cross-platform refactor touching mobile behavior, out of scope for a
web-only bug-fix pass and not attempted here.

### 2b. Mobile `ChatListScreen` reads fields the API never sends (separate, pre-existing bug)
While checking mobile call sites for #2, found `NetworkApp/src/screens/ChatListScreen.js:71-72`
reads `item.unread` and `item.hasPriority` from the `/api/connections` response. Neither
field exists — the API has only ever sent `unread_count` and `is_priority` (confirmed:
zero occurrences of a bare `unread:` or `hasPriority` key anywhere in `server.js`). So
`isUnread`/`hasPriority` are `!!undefined` → always `false` on mobile: **the unread dot
and priority indicator in the mobile chat list are permanently off**, unrelated to and
unaffected by the web-side fix below (the web fix does not touch these field names, so
it neither fixes nor worsens this). Flagging for a separate mobile-side fix.

### 3. `unread_count` is a boolean, not a count
Same field discussed in #1 — it's always `0` or `1`, never the actual number of unread
messages. If someone sends 5 messages while you're away, the list still just shows a
single unread dot, not "5". Low severity on its own, but worth fixing at the same time
as #1 since both point at the same missing "read state" model.

---

## P2 — asymmetric gating (likely intentional, but a friction point)

### 4. You can see profiles you can't yet connect with
`discoverGuard` (browsing) requires `trust_score ≥ 10`. `profileGuard` + `trustGuard`
(actually connecting, on both `/api/connect` and `/api/swipe`) require
`trust_score ≥ 20` **and** `profile_score ≥ 70`. A user can fully browse Discover, tap
Connect, and be blocked with "Complete your profile to continue" — surfaced correctly
via toast (verified: `apiPost` attaches `.code`/`.message`, `DiscoverFeed.handleConnect`
shows it), so this isn't silently broken. But nothing in the Discover UI warns a
under-threshold user *before* they hit that wall. Worth a UX pass, not a functional bug.

---

## Checked and ruled out (no action needed)

- **Duplicate-connection race condition** — `/api/connect`/`/api/swipe`'s `23505`
  handling on the `connections` insert looked at first like it guards a constraint that
  doesn't exist (`supabase_schema.sql`'s `CREATE TABLE connections` has no UNIQUE on
  `user1`/`user2`). It's real: `migrations/007_connections_unique_constraint.sql` adds
  a `LEAST/GREATEST`-normalized unique index, and [[project-ai-os-status]] confirms it
  was applied in production 2026-06-03. Safeguard is genuine, not dead defensive code.
- **7-day match expiry with no reconnect path** — intentional, documented "retention
  feature" (match expiry 7d + 24h-before push warning, both shipped per the same
  memory). Matches `sendExpiryWarnings()` at `server.js:7678`. Not a bug.
- **Blocking** — `/api/block` correctly deletes the connection, its messages, and
  cross-direction swipes, so a blocked user can't keep messaging or re-match. No gap.
- **Authorization on connection/message endpoints** — both `/api/connections/:connId`
  and `/api/messages/:connId` verify `req.user.id` is `user1` or `user2` before
  returning anything. No IDOR found.
- **XSS in chat** — message text renders via JSX `{msg.text}`, React-escaped. No
  injection path found.
- **N+1 query pattern in `/api/connections`** — one query per connection for
  last-message and one for count, via `Promise.all`. Real pattern, but
  `messages_connection_id_idx` exists and both are fully parallelized — a scaling
  watch-item if a user's connection count grows very large, not a correctness bug.
- **RLS on `messages`/`connections`** — enabled in schema, but moot: the frontend never
  talks to Supabase directly (grepped, zero `createClient`/`supabase` in
  `frontend/`), everything routes through `server.js` on the `service_role` key which
  bypasses RLS by design. Not a live attack surface either way.

---

## Recommendation

Priority order if implementing: **#1 (unread-never-clears)** is the one most likely to
be what a user means by "chat feels broken," and is scoped tightly (one endpoint +
one small schema addition + one small `ChatWindow` change). **#2 (dead `/api/swipe`)**
is a cleanup/risk-reduction item, not user-facing, safe to schedule separately. **#4**
is a UX polish item for the redesign backlog, not urgent.

Not implementing any of this yet — flagging for direction on what to take on next.
