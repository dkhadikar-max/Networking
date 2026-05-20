import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    const backend = process.env.BACKEND_URL;
    if (!backend) return [];
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
