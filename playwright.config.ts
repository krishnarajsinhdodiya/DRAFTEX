import { defineConfig, devices } from "@playwright/test";

// Not 3210, so a running copy of DRAFTEX is never reused; the server gets a throwaway data folder.
const port = 3211;
// Gate 10: DRAFTEX_E2E_URL points at a copy installed and started by the setup scripts.
const external = process.env.DRAFTEX_E2E_URL;
const baseURL = external ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: external ? [] : ["**/installed.spec.ts"],
  forbidOnly: Boolean(process.env.CI),
  // The suite walks one shared database from first-run setup onwards.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: external
    ? undefined
    : {
        command: `node scripts/e2e-server.ts ${port}`,
        url: `${baseURL}/login`,
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
