// Shared helpers for preserving a deep-link destination (e.g. a Circles
// post CTA landing on /circles?post=:id) across the whole auth chain:
// (app) layout's auth gate -> login/signup -> email or OTP verification ->
// set-password (magic-link signups only) -> onboarding -> final page.
//
// Every hop that can end a session or bounce to another auth page must both
// READ an incoming `next` and FORWARD it to wherever it sends the user next,
// or the chain silently drops back to '/discover' partway through — that
// was the original bug (see 2026-09-03 conversation): CTA -> /circles?post=
// -> /login -> successful login -> /discover, losing the post that brought
// the visitor in.

const DEFAULT_NEXT = '/discover';

// Open-redirect guard: only ever accept a same-origin relative path.
// Rejects absolute URLs, protocol-relative ("//evil.com"), backslash
// variants some browsers normalize to protocol-relative, and anything with
// an embedded scheme (e.g. "/x/javascript:alert(1)"). Used both client-side
// here and mirrored server-side (server.js) since a magic-link `next` ends
// up embedded in a real email — client-side validation alone isn't enough
// for that path.
export function safeNext(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_NEXT;
  let path: string;
  try { path = decodeURIComponent(raw); } catch { return DEFAULT_NEXT; }
  if (!path.startsWith('/')) return DEFAULT_NEXT;
  if (path.startsWith('//')) return DEFAULT_NEXT;
  if (/^\/\\+/.test(path)) return DEFAULT_NEXT; // backslash-leading variant
  if (/^\/[^/?#]*[a-z][a-z0-9+.-]*:/i.test(path)) return DEFAULT_NEXT; // embedded scheme before any real path segment
  if (/[\x00-\x1f]/.test(path)) return DEFAULT_NEXT; // control chars
  return path;
}

// Appends `next` (validated) as a query param on an internal path. Omits
// the param entirely when there's nothing meaningful to carry, so plain
// navigations (no incoming next) don't get a no-op '?next=/discover'.
export function withNext(path: string, next: string | null | undefined): string {
  if (!next) return path;
  const safe = safeNext(next);
  if (safe === DEFAULT_NEXT) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}next=${encodeURIComponent(safe)}`;
}

export { DEFAULT_NEXT };
