// The Windows upgrade job (CI `upgrade`): the previous release was installed,
// set up by its own installed.spec.ts, then updated to this commit with
// update-windows.bat. Its data folder must work with this version: the same
// administrator signs in, and a paper uses what the new migrations added
// (Final lock and versions, D56-D57). Only runs when DRAFTEX_E2E_URL is set.
import { expect, test } from "@playwright/test";
import { ADMIN } from "./support";

test.describe.configure({ mode: "serial", timeout: 180_000 });

test("the updated copy keeps its administrator and makes a Final paper", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: `Welcome, ${ADMIN.name}` })).toBeVisible();

  await page.goto("/templates");
  await page
    .getByRole("link", { name: /Theory · End-Semester · 4 credits/ })
    .first()
    .click();
  await page.getByRole("button", { name: "New paper" }).click();
  const dialog = page.getByRole("dialog", { name: "New paper" });
  await dialog.getByLabel("Title", { exact: true }).fill("Upgraded Example Paper");
  await dialog.getByRole("button", { name: "Create paper" }).click();
  await expect(page).toHaveURL(/\/papers\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("img", { name: /page 1 of/ })).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "Mark as Final" }).click();
  await expect(page.getByRole("note").filter({ hasText: "This paper is Final." })).toBeVisible();
  await page.getByRole("button", { name: /^Versions/ }).click();
  await expect(page.getByRole("dialog", { name: "Versions" }).getByText("Marked Final")).toBeVisible();

  await page.goto("/papers?q=upgraded");
  await expect(page.getByText("1 paper match")).toBeVisible();
});
