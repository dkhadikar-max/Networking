import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Nonce-based CSP for the 3 pages where it's actually worth the dynamic-
// rendering cost: auth (XSS on these pages = account takeover) and payment.
// Every other route keeps the static CSP from next.config.ts (unsafe-inline
// for script/style) — see the comment there for why full nonce coverage
// isn't used site-wide.
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const isDev = process.env.NODE_ENV === 'development';

  // style-src keeps unsafe-inline even here: login/signup/upgrade are Client
  // Components using React style={{}} props extensively, which compile to
  // inline style="..." attributes — nonces don't cover attributes, only
  // <style> elements, and rewriting every inline style prop to CSS classes
  // is a real styling refactor out of scope for this pass. script-src is
  // where nonces actually matter for XSS, so that's what's hardened.
  const cspHeader = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://checkout.razorpay.com https://www.googletagmanager.com${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://res.cloudinary.com https://*.cloudinary.com https://www.google-analytics.com",
    "font-src 'self'",
    "connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com https://www.google-analytics.com https://analytics.google.com https://www.googletagmanager.com",
    "frame-src https://api.razorpay.com https://checkout.razorpay.com",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', cspHeader);
  return response;
}

export const config = {
  matcher: ['/login', '/signup', '/upgrade'],
};
