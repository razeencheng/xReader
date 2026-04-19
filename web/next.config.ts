import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Rewrites disabled while mock API routes are active.
  // Re-enable when using the Go backend:
  // async rewrites() {
  //   return [
  //     {
  //       source: '/api/:path*',
  //       destination: 'http://localhost:8080/api/:path*',
  //     },
  //   ];
  // },
};

export default nextConfig;
