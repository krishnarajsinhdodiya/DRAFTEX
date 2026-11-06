// Accounts and helpers shared by the e2e specs, which run in file order
// against one fresh data folder. All values are invented test data.
import { type Browser, type BrowserContext, type Page, expect } from "@playwright/test";

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

/** Content Security Policy violations seen on any page these helpers opened (SPEC §11.6). */
export const cspViolations: string[] = [];

/** Browser contexts the helpers opened; closed after each test (closeOpenContexts). */
const open = new Set<BrowserContext>();

/**
 * Closes every context the helpers opened. Each spec registers it with
 * test.afterEach: one worker keeps one Chromium for the whole run, and dozens
 * of open tabs once stalled "Create page" for 30 s on windows-latest
 * (run 42244287523).
 */
export async function closeOpenContexts(): Promise<void> {
  const all = [...open];
  open.clear();
  await Promise.all(all.map((c) => c.close().catch(() => {})));
}

/** Collects CSP violations Chromium reports on this page's console. */
export function watchCsp(page: Page): Page {
  open.add(page.context());
  page.on("console", (m) => {
    if (/Content Security Policy/i.test(m.text())) cspViolations.push(`${page.url()}: ${m.text()}`);
  });
  return page;
}

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
  const page = watchCsp(await (await browser.newContext()).newPage());
  await signIn(page, who.email, password);
  await expect(page.getByRole("heading", { name: `Welcome, ${who.name}` })).toBeVisible();
  return page;
}

type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;
const sessions = new Map<string, StorageState>();

/**
 * A page signed in as `who`, reusing one sign-in per person for the whole
 * spec file: the per-address sign-in limit (20 per 15 minutes) is real.
 */
export async function asUser(
  browser: Browser,
  who: { email: string; name: string },
  password: string,
): Promise<Page> {
  const saved = sessions.get(who.email);
  if (saved) return watchCsp(await (await browser.newContext({ storageState: saved })).newPage());
  const page = await signedIn(browser, who, password);
  sessions.set(who.email, await page.context().storageState());
  return page;
}
