import type { NextConfig } from "next";

const NOINDEX_HEADER = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }];

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [
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
      { source: '/upgrade',            headers: NOINDEX_HEADER },
    ];
  },
  async rewrites() {
    const backend = process.env.BACKEND_URL ?? 'https://adequate-dedication-production-69aa.up.railway.app';
    return [
      { source: '/api/:path*',     destination: `${backend}/api/:path*` },
      { source: '/uploads/:path*', destination: `${backend}/uploads/:path*` },
    ];
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
