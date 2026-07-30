import type { NextConfig } from "next";

const NOINDEX_HEADER = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }];

// Applied to every route. Not a full CSP — this app loads GA4 (consent-gated),
// Razorpay's checkout script/iframe, Cloudinary images, and Google Fonts, so a
// script-src-restrictive CSP needs a proper resource audit + nonce plan before
// it can be added without breaking checkout. These are the safe, non-breaking
// baseline headers in the meantime.
const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
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
        // ── Core proxies (existing) ──
        { source: '/api/:path*',     destination: `${backend}/api/:path*` },
        { source: '/uploads/:path*', destination: `${backend}/uploads/:path*` },

        // ── Static SEO landing pages (Express-only, no Next.js equivalent) ──
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

        // ── International hub pages ──
        { source: '/startup-networking-us',                destination: `${backend}/startup-networking-us` },
        { source: '/startup-networking-europe',            destination: `${backend}/startup-networking-europe` },
        { source: '/startup-networking-uk',                destination: `${backend}/startup-networking-uk` },
        { source: '/startup-networking-australia',         destination: `${backend}/startup-networking-australia` },
        { source: '/startup-networking-singapore',         destination: `${backend}/startup-networking-singapore` },
        { source: '/startup-networking-dubai',             destination: `${backend}/startup-networking-dubai` },
        { source: '/startup-networking-kenya',             destination: `${backend}/startup-networking-kenya` },
        { source: '/startup-networking-south-africa',      destination: `${backend}/startup-networking-south-africa` },
        { source: '/startup-networking-turkey',            destination: `${backend}/startup-networking-turkey` },

        // ── Programmatic SEO patterns (Indian cities × intents × categories) ──
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

        // ── Blog ──
        { source: '/blog',         destination: `${backend}/blog` },
        { source: '/blog/:slug*',  destination: `${backend}/blog/:slug*` },

        // ── Admin + utility ──
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
