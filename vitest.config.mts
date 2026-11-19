import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";

// Load .env.local (DATABASE_URL, TEST_DATABASE_URL) like the npm scripts do. Variables already
// set in the environment win.
const envLocal = path.resolve(import.meta.dirname, ".env.local");
if (fs.existsSync(envLocal)) process.loadEnvFile(envLocal);

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname),
      // lib/repo/index.ts imports "server-only"; tests use lib/repo/store.ts instead.
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/empty.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // DB tests share one database; run files sequentially.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
