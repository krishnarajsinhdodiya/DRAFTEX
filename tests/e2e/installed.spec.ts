// Gate 10 (SPEC §10): run against a copy installed by setup-windows.ps1 and
// started by start-windows.bat, on its own fresh data folder. Only runs when
// DRAFTEX_E2E_URL names that copy (playwright.config.ts); the account is an
// invented test value.
import { expect, test } from "@playwright/test";
import { ADMIN } from "./support";

test.describe.configure({ mode: "serial" });

test("the installed copy sets up its administrator", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/setup$/);
  await page.getByLabel("Your name").fill(ADMIN.name);
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password", { exact: true }).fill(ADMIN.password);
  await page.getByLabel("Type the password again").fill(ADMIN.password);
  await page.getByRole("button", { name: "Create administrator" }).click();
  await expect(page.getByRole("heading", { name: `Welcome, ${ADMIN.name}` })).toBeVisible();
});

test("the installed LaTeX engine compiles a built-in template", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: `Welcome, ${ADMIN.name}` })).toBeVisible();
  const title = "PCI 2026 · B.Pharm · Theory · End-Semester · 4 credits";
  await page.goto("/templates");
  await page.getByRole("link", { name: title }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(page.getByRole("img", { name: /page 1 of/ })).toBeVisible({ timeout: 90_000 });
});
