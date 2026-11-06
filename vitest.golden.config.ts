import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Golden compile (gate 3), visual regression (gate 4), fuzz (gate 6) and the
// local-only house-style check (gate 5). Needs `npm run setup:tectonic` first.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/golden/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/support/db-template.ts"],
    testTimeout: 300_000,
    hookTimeout: 300_000,
    fileParallelism: false,
  },
});
