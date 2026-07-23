import type { NextConfig } from "next";
import path from "node:path";

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  // Strict mode double-invokes effects in dev, making the UI feel choppy.
  // Keep it off locally; CI/production builds use strict mode via next build.
  reactStrictMode: !isDev,
  outputFileTracingRoot: path.join(__dirname),
  async headers() {
    return [
      {
        source: "/info",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
      {
        source: "/info/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
