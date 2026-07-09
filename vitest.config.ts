import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // "server-only" is a marker package: Next.js aliases it to a no-op
      // when bundling under the "react-server" condition, but Vitest
      // externalizes node_modules deps to plain Node `require`/`import`,
      // which ignores Vite's `resolve.conditions` and always resolves the
      // package's throwing default export. Alias it directly to its own
      // no-op build (the same file Next.js's react-server condition picks)
      // so tests that transitively import a server-only-guarded module
      // (e.g. lib/supabaseAdmin.ts, lib/llmCostTracker.ts) don't blow up at
      // import time before a single test runs.
      "server-only": path.resolve(__dirname, "node_modules/server-only/empty.js"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    clearMocks: true,
  },
});
