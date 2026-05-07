import type { NextConfig } from "next";
import path from "node:path";

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  // Strict mode double-invokes effects in dev, making the UI feel choppy.
  // Keep it off locally; CI/production builds use strict mode via next build.
  reactStrictMode: !isDev,
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
