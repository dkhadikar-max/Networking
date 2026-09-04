import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Next.js App Router has no built-in "410" primitive — notFound() always
// produces a 404 (see node_modules/next/dist/docs/01-app/03-api-reference/
// 04-functions/not-found.md). The locked Circles public-indexing exposure
// policy requires "immediate revocation → 410/noindex" for a post that WAS
// public and has since been opted out, reported, or had its Circle go
// private — that distinction only means anything to a crawler if it's a
// real 410, not a 404 indistinguishable from "never existed".
//
// This file is Next 16's renamed middleware.ts (see node_modules/next/dist/
// docs/01-app/03-api-reference/03-file-conventions/proxy.md — "the
// `middleware` file convention is deprecated and renamed to `proxy`").
// It intercepts /c/:id, asks the backend (which already distinguishes
// 410-vs-404-vs-200, see server.js GET /api/circles/public/:id), and
// short-circuits with a hand-built 410 response only for that case.
// Everything else falls through to app/(seo)/c/[id]/page.tsx unchanged.
export const config = { matcher: '/c/:id*' };

const BACKEND_URL = process.env.BACKEND_URL ?? 'https://adequate-dedication-production-69aa.up.railway.app';

const GONE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="robots" content="noindex">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Post no longer available — Build Your Network</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:15vh auto;padding:0 24px;text-align:center;color:#0F172A}a{color:#157A6E;font-weight:600;text-decoration:none}</style>
</head><body>
<h1 style="font-size:20px;font-weight:800">This post is no longer available</h1>
<p style="color:#64748B;font-size:14px;line-height:1.6">It may have been made private again by its author, or removed following a report.</p>
<p><a href="/">Go to Build Your Network →</a></p>
</body></html>`;

export async function proxy(request: NextRequest) {
  const id = request.nextUrl.pathname.split('/').filter(Boolean).pop();
  if (!id) return NextResponse.next();

  let status = 200;
  try {
    const res = await fetch(`${BACKEND_URL}/api/circles/public/${encodeURIComponent(id)}`, { cache: 'no-store' });
    status = res.status;
  } catch {
    // Backend unreachable — don't fail the request here; let the page's own
    // fetch attempt (and its own error handling) take over.
    return NextResponse.next();
  }

  if (status !== 410) return NextResponse.next();

  return new Response(GONE_HTML, {
    status: 410,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
