import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  async rewrites() {
    const backend = process.env.NAGARFLOW_BACKEND_URL || "http://127.0.0.1:5000";
    return [ { source: "/api/:path*", destination: `${backend}/api/:path*` }, { source: "/uploads/:path*", destination: `${backend}/uploads/:path*` } ];
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
