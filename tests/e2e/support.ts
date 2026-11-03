// Accounts and helpers shared by the e2e specs, which run in file order
// against one fresh data folder. All values are invented test data.
import { type Browser, type Page, expect } from "@playwright/test";

export const ADMIN = {
  name: "Test Admin",
  email: "admin@example.test",
  password: "admin test password",
};
export const FACULTY = {
  name: "Dr Test Faculty",
  email: "faculty@example.test",
  temp: "temporary pass 1",
  own: "faculty own password",
};
export const JOINER = {
  name: "Dr Test Joiner",
  email: "joiner@example.test",
  password: "joiner test password",
};

export async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

export async function signedIn(
  browser: Browser,
  who: { email: string; name: string },
  password: string,
): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, who.email, password);
  await expect(page.getByRole("heading", { name: `Welcome, ${who.name}` })).toBeVisible();
  return page;
}
