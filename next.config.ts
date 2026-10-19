import type { NextConfig } from "next";

// The Express API. In development it runs on :4000; in Docker it is the
// `backend` service. Browser requests to /api and /uploads are proxied there
// so cookies stay first-party and no CORS setup is needed.
const BACKEND_URL = (process.env.BACKEND_URL ?? "http://localhost:4000").replace(/\/$/, "");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*` },
      { source: "/uploads/:path*", destination: `${BACKEND_URL}/uploads/:path*` },
    ];
  },
};

export default nextConfig;
