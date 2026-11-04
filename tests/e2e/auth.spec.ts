// Admin bootstrap end to end (SPEC §13 Phase 2): first-run setup, adding a
// person, invites, the forced password change, lockout and unlock.
// Runs in order against one fresh data folder (scripts/e2e-server.ts).
// All accounts and passwords here are invented test values.
import { type Browser, type Page, expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { ADMIN, FACULTY, JOINER, asUser, signIn } from "./support";

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };

test.describe.configure({ mode: "serial" });

let inviteCode = "";

async function adminPage(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, ADMIN.email, ADMIN.password);
  await expect(page.getByRole("heading", { name: `Welcome, ${ADMIN.name}` })).toBeVisible();
  await page.goto("/admin/users");
  return page;
}

test("first visit goes to setup and creates the administrator", async ({ page, context }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/setup$/);
  await page.getByLabel("Your name").fill(ADMIN.name);
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password", { exact: true }).fill(ADMIN.password);
  await page.getByLabel("Type the password again").fill(ADMIN.password);
  await page.getByRole("button", { name: "Create administrator" }).click();
  await expect(page.getByRole("heading", { name: `Welcome, ${ADMIN.name}` })).toBeVisible();

  const cookie = (await context.cookies()).find((c) => c.name === "draftex_session");
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax", secure: false, path: "/" });
  const days = (cookie!.expires * 1000 - Date.now()) / 86_400_000;
  expect(days).toBeGreaterThan(6.9);
  expect(days).toBeLessThanOrEqual(7);

  await page.goto("/setup");
  await expect(page).toHaveURL(/\/login$|\/$/);
});

test("setup cannot run a second time", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/setup");
  await expect(page).toHaveURL(/\/login$/);
});

test("the administrator adds a person and creates an invite code", async ({ browser }) => {
  const page = await adminPage(browser);
  await page.getByLabel("Name", { exact: true }).fill(FACULTY.name);
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(FACULTY.email);
  await page.getByLabel("Temporary password").fill(FACULTY.temp);
  await page.getByRole("button", { name: "Add person" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: `${FACULTY.name} can now sign in` }),
  ).toBeVisible();
  await expect(page.getByRole("cell", { name: new RegExp(FACULTY.email) })).toBeVisible();

  await page.getByLabel("Who is it for? (optional)").fill("Joiner");
  await page.getByRole("button", { name: "Create invite code" }).click();
  const code = page.getByLabel("New invite code", { exact: true });
  await expect(code).toHaveText(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  inviteCode = (await code.textContent()) ?? "";
  await expect(page.getByText("Joiner", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/login$/);
});

test("a person added by the admin must choose their own password first", async ({ page }) => {
  await signIn(page, FACULTY.email, FACULTY.temp);
  await expect(page).toHaveURL(/\/change-password$/);
  await expect(page.getByRole("heading", { name: "Choose your own password" })).toBeVisible();
  await page.goto("/");
  await expect(page).toHaveURL(/\/change-password$/);

  await page.getByLabel("Current password").fill(FACULTY.temp);
  await page.getByLabel("New password", { exact: true }).fill(FACULTY.own);
  await page.getByLabel("Type the new password again").fill(FACULTY.own);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Your password has been changed.")).toBeVisible();
  await expect(page.getByRole("heading", { name: `Welcome, ${FACULTY.name}` })).toBeVisible();
});

test("faculty cannot open the admin screen", async ({ page }) => {
  await signIn(page, FACULTY.email, FACULTY.own);
  await expect(page.getByRole("heading", { name: `Welcome, ${FACULTY.name}` })).toBeVisible();
  await expect(page.getByRole("link", { name: "People" })).toHaveCount(0);
  const response = await page.goto("/admin/users");
  expect(response?.status()).toBe(404);
});

test("an invite code creates one account and then stops working", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByRole("link", { name: "Create your account" }).click();
  await page.getByLabel("Invite code").fill(inviteCode.toLowerCase());
  await page.getByLabel("Your name").fill(JOINER.name);
  await page.getByLabel("Email").fill(JOINER.email);
  await page.getByLabel("Password", { exact: true }).fill(JOINER.password);
  await page.getByLabel("Type the password again").fill(JOINER.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: `Welcome, ${JOINER.name}` })).toBeVisible();

  const again = await (await browser.newContext()).newPage();
  await again.goto("/join");
  await again.getByLabel("Invite code").fill(inviteCode);
  await again.getByLabel("Your name").fill("Someone Else");
  await again.getByLabel("Email").fill("someone@example.test");
  await again.getByLabel("Password", { exact: true }).fill(JOINER.password);
  await again.getByLabel("Type the password again").fill(JOINER.password);
  await again.getByRole("button", { name: "Create account" }).click();
  await expect(again.locator("form").getByRole("alert")).toHaveText(/not valid/);
});

test("five wrong passwords lock the account until an admin unlocks it", async ({
  page,
  browser,
}) => {
  for (let i = 1; i <= 4; i++) {
    await signIn(page, FACULTY.email, `wrong password ${i}`);
    await expect(page.locator("form").getByRole("alert")).toHaveText(
      "That email and password do not match.",
    );
  }
  await signIn(page, FACULTY.email, "wrong password 5");
  await expect(page.locator("form").getByRole("alert")).toHaveText(/locked for 15 minutes/);
  await signIn(page, FACULTY.email, FACULTY.own);
  await expect(page.locator("form").getByRole("alert")).toHaveText(/locked/);

  const admin = await adminPage(browser);
  const row = admin.getByRole("row").filter({ hasText: FACULTY.email });
  await expect(row).toContainText("Locked out on one computer until");
  await row.getByRole("button", { name: "Unlock" }).click();
  await expect(row).toContainText("Active");

  await signIn(page, FACULTY.email, FACULTY.own);
  await expect(page.getByRole("heading", { name: `Welcome, ${FACULTY.name}` })).toBeVisible();
});

test("a deactivated person is signed out and cannot sign in", async ({ page, browser }) => {
  await signIn(page, JOINER.email, JOINER.password);
  await expect(page.getByRole("heading", { name: `Welcome, ${JOINER.name}` })).toBeVisible();

  const admin = await adminPage(browser);
  const row = admin.getByRole("row").filter({ hasText: JOINER.email });
  await row.getByRole("button", { name: "Deactivate" }).click();
  await expect(row).toContainText("Deactivated");

  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
  await signIn(page, JOINER.email, JOINER.password);
  await expect(page.locator("form").getByRole("alert")).toHaveText(
    "That email and password do not match.",
  );
});

test("the about page shows the version and credits the maker", async ({ browser }) => {
  const page = await asUser(browser, ADMIN, ADMIN.password);
  await page.getByRole("link", { name: /About DRAFTEX/ }).click();
  await expect(page.getByRole("heading", { name: "About DRAFTEX" })).toBeVisible();
  await expect(page.getByText(pkg.version, { exact: true })).toBeVisible();
  await expect(page.getByText("Krishnarajsinh Hitesh Dodiya", { exact: true })).toBeVisible();
  await expect(page.getByText("Data folder")).toBeVisible();
  await page.context().close();
});
