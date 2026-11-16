import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Measurements, not gates (D115): run by hand with `npm run test:perf`.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/perf/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/support/db-template.ts"],
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
});
