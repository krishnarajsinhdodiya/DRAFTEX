import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Thresholds from SPEC §10 gate 2. Globs that match no files yet are inert until those modules exist.
const strictCoverage = { lines: 90, functions: 90, branches: 90, statements: 90 };

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "src/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "scripts/**/*.mjs"],
      reporter: ["text", "html"],
      thresholds: {
        "src/lib/latex/**": strictCoverage,
        "src/lib/rules/**": strictCoverage,
        "src/lib/auth/**": strictCoverage,
        "src/lib/data/**": strictCoverage,
        "src/lib/net/**": strictCoverage,
        "src/lib/config.ts": strictCoverage,
        // SPEC §10 gate 2: the PCI checker needs every branch covered.
        "src/lib/rules/check.ts": { lines: 100, functions: 100, branches: 100, statements: 100 },
      },
    },
  },
});
