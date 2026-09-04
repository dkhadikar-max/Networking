import type { NextConfig } from "next";

const NOINDEX_HEADER = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }];

// Tried a nonce-based CSP (via proxy.ts) on login/signup/upgrade for real
// script-src hardening with no unsafe-inline. Reverted 2026-08-01: Next.js
// 16.2.6's automatic nonce injection (attaching nonce="..." to its own
// hydration scripts) never actually worked, even matching the documented
// request-header pattern exactly -- verified zero nonce attributes in the
// rendered HTML despite a correctly-formed CSP header. Result was a fully
// broken login/signup page: React never hydrated, forms silently fell back
// to native GET submission (which also leaked email/password into the URL).
// Reverting to the same static CSP as every other page until this is
// revisited properly. script-src/style-src keep 'unsafe-inline' deliberately:
// Next.js injects its own inline hydration scripts on every page, and a
// nonce-based CSP (the only way to remove unsafe-inline) requires the page to
// render dynamically, which would kill static generation/ISR/CDN caching for
// the programmatic SEO pages (cities/roles/industries/professionals) that
// exist specifically for that. Everything else here is real: frame-ancestors,
// object-src, base-uri, and a resource allowlist scoped to what this app
// actually loads (verified 2026-08-01) — Razorpay checkout, GA4
// (consent-gated), Cloudinary images. No external fonts/Tailwind CDN —
// next/font self-hosts, no CDN is used here.
const CSP_HEADER = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://www.googletagmanager.com" + (process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://res.cloudinary.com https://*.cloudinary.com https://www.google-analytics.com",
  "font-src 'self'",
  "connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com https://www.google-analytics.com https://analytics.google.com https://www.googletagmanager.com",
  "frame-src https://api.razorpay.com https://checkout.razorpay.com",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join('; ');

const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Matches server.js's Permissions-Policy — camera/mic/geolocation are
  // unused anywhere in this app; 'payment' stays unrestricted for the
  // Razorpay checkout modal on /upgrade.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // No "preload" — that submission is effectively permanent once picked up by
  // browsers. max-age + includeSubDomains gets the audit credit safely.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

const nextConfig: NextConfig = {
  output: "standalone",
  async redirects() {
    return [
      // /app was the old Express webapp route — redirect to /signup permanently
      { source: '/app', destination: '/signup', permanent: true },
      { source: '/webapp', destination: '/signup', permanent: true },
      { source: '/webapp.html', destination: '/signup', permanent: true },
    ];
  },
  async headers() {
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
      { source: '/:path*', headers: [{ key: 'Content-Security-Policy', value: CSP_HEADER }] },
      // Auth routes — no value being indexed
      { source: '/login',              headers: NOINDEX_HEADER },
      { source: '/signup',             headers: NOINDEX_HEADER },
      { source: '/verify',             headers: NOINDEX_HEADER },
      { source: '/forgot-password',    headers: NOINDEX_HEADER },
      { source: '/reset-password',     headers: NOINDEX_HEADER },
      // App routes — require authentication, render loading spinner for Googlebot
      { source: '/onboarding',         headers: NOINDEX_HEADER },
      { source: '/onboarding/:path*',  headers: NOINDEX_HEADER },
      { source: '/discover',           headers: NOINDEX_HEADER },
      { source: '/discover/:path*',    headers: NOINDEX_HEADER },
      { source: '/chat',               headers: NOINDEX_HEADER },
      { source: '/chat/:path*',        headers: NOINDEX_HEADER },
      { source: '/profile',            headers: NOINDEX_HEADER },
      { source: '/profile/:path*',     headers: NOINDEX_HEADER },
      { source: '/likes',              headers: NOINDEX_HEADER },
      { source: '/circles',            headers: NOINDEX_HEADER },
      { source: '/circles/:path*',     headers: NOINDEX_HEADER },
      { source: '/upgrade',            headers: NOINDEX_HEADER },
    ];
  },
  async rewrites() {
    const backend = process.env.BACKEND_URL ?? 'https://adequate-dedication-production-69aa.up.railway.app';
    return {
      // beforeFiles: run before Next.js filesystem routes — needed to override sitemap.ts
      beforeFiles: [
        { source: '/sitemap.xml', destination: `${backend}/sitemap.xml` },
        { source: '/llms.txt',    destination: `${backend}/llms.txt` },
      ],
      afterFiles: [
        // -- Core proxies (existing) --
        { source: '/api/:path*',     destination: `${backend}/api/:path*` },
        { source: '/uploads/:path*', destination: `${backend}/uploads/:path*` },

        // -- Referral short link (Express-only, no Next.js equivalent) --
        // GET /api/profile/referral (server.js) hands out links shaped
        // ${BASE_URL}/r/:code, where BASE_URL is this frontend's own public
        // domain — but /r/:code only ever existed as a backend Express
        // route (server.js) and had no rewrite here, so the link 404'd
        // against Next.js's own router before ever reaching the backend's
        // redirect handler. Found while fixing the referral-capture gap
        // (2026-09-04) — the backend side (ref_code -> referred_by ->
        // verified-count -> atomic reward) was already correct and
        // regression-tested; this was the literal first hop that was
        // broken. The backend responds 302 to /app?ref=:code, which the
        // browser then follows back onto this same domain and into the
        // /app -> /signup redirect below.
        { source: '/r/:code', destination: `${backend}/r/:code` },

        // -- Static SEO landing pages (Express-only, no Next.js equivalent) --
        { source: '/what-is-byn',                          destination: `${backend}/what-is-byn` },
        { source: '/intent-based-networking',              destination: `${backend}/intent-based-networking` },
        { source: '/find-cofounders',                      destination: `${backend}/find-cofounders` },
        { source: '/angel-investors-india',                destination: `${backend}/angel-investors-india` },
        { source: '/linkedin-vs-byn',                      destination: `${backend}/linkedin-vs-byn` },
        { source: '/best-networking-platform-for-founders',destination: `${backend}/best-networking-platform-for-founders` },
        { source: '/meetup-alternative',                   destination: `${backend}/meetup-alternative` },
        { source: '/startup-founders-india',               destination: `${backend}/startup-founders-india` },
        { source: '/professional-networking',              destination: `${backend}/professional-networking` },
        { source: '/build-professional-network',           destination: `${backend}/build-professional-network` },
        { source: '/find-startup-mentor',                  destination: `${backend}/find-startup-mentor` },
        { source: '/startup-networking-events',            destination: `${backend}/startup-networking-events` },

        // -- International hub pages --
        { source: '/startup-networking-us',                destination: `${backend}/startup-networking-us` },
        { source: '/startup-networking-europe',            destination: `${backend}/startup-networking-europe` },
        { source: '/startup-networking-uk',                destination: `${backend}/startup-networking-uk` },
        { source: '/startup-networking-australia',         destination: `${backend}/startup-networking-australia` },
        { source: '/startup-networking-singapore',         destination: `${backend}/startup-networking-singapore` },
        { source: '/startup-networking-dubai',             destination: `${backend}/startup-networking-dubai` },
        { source: '/startup-networking-kenya',             destination: `${backend}/startup-networking-kenya` },
        { source: '/startup-networking-south-africa',      destination: `${backend}/startup-networking-south-africa` },
        { source: '/startup-networking-turkey',            destination: `${backend}/startup-networking-turkey` },

        // -- Programmatic SEO patterns (Indian cities × intents × categories) --
        { source: '/networking-in-:city',           destination: `${backend}/networking-in-:city` },
        { source: '/founders-in-:city',             destination: `${backend}/founders-in-:city` },
        { source: '/startup-founders-:city',        destination: `${backend}/startup-founders-:city` },
        { source: '/find-cofounders-:city',         destination: `${backend}/find-cofounders-:city` },
        { source: '/startup-networking-:city',      destination: `${backend}/startup-networking-:city` },
        { source: '/professional-networking-:city', destination: `${backend}/professional-networking-:city` },
        { source: '/founder-networking-:city',      destination: `${backend}/founder-networking-:city` },
        { source: '/entrepreneur-networking-:city', destination: `${backend}/entrepreneur-networking-:city` },
        { source: '/cofounder-matching-:city',      destination: `${backend}/cofounder-matching-:city` },
        { source: '/freelancer-networking-:city',   destination: `${backend}/freelancer-networking-:city` },
        { source: '/creator-networking-:city',      destination: `${backend}/creator-networking-:city` },
        { source: '/investor-networking-:city',     destination: `${backend}/investor-networking-:city` },
        { source: '/startup-ecosystem-:city',       destination: `${backend}/startup-ecosystem-:city` },

        // -- Blog --
        { source: '/blog',         destination: `${backend}/blog` },
        { source: '/blog/:slug*',  destination: `${backend}/blog/:slug*` },

        // -- Admin + utility --
        { source: '/admin',        destination: `${backend}/admin` },
        { source: '/admin.html',   destination: `${backend}/admin.html` },
        { source: '/terms',        destination: `${backend}/terms` },
        { source: '/privacy',      destination: `${backend}/privacy` },
        { source: '/support',      destination: `${backend}/support` },
      ],
      fallback: [],
    };
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "buildyournetwork.online" },
      { protocol: "https", hostname: "api.buildyournetwork.online" },
    ],
  },
};

export default nextConfig;
