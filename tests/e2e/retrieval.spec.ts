// Phase 9 paper retrieval end to end (D55-D60): search and filters on the
// Papers list, Recent papers on the home screen, the Final/Printed lock and
// its Edit confirmation, versions (open as PDF, restore as a new paper) and
// "Duplicate as… next academic year". Gate 8 at the version route.
// Runs after papers.spec.ts, whose exported (Printed) paper it uses. Invented data.
import { type Page, expect, test } from "@playwright/test";
import { ADMIN, asUser, closeOpenContexts, FACULTY } from "./support";

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.afterEach(closeOpenContexts);

const PRINTED = "Invented Pharmacology Paper";
const SESSIONAL = "Invented Chemistry Sessional";
let printedUrl = "";
let versionUrl = "";

async function papersLink(page: Page, title: string) {
  return page.getByRole("link", { name: new RegExp(`^${title} (Draft|Final|Printed)`) });
}

test("a second paper is made for another exam and year", async ({ browser }) => {
  const page = await asUser(browser, FACULTY, FACULTY.own);
  await page.goto("/templates");
  await page
    .getByRole("link", { name: /Theory · Sessional · 4 credits/ })
    .first()
    .click();
  await page.getByRole("button", { name: "New paper" }).click();
  const dialog = page.getByRole("dialog", { name: "New paper" });
  await dialog.getByLabel("Title", { exact: true }).fill(SESSIONAL);
  await dialog.getByLabel("Academic year").fill("2031-32");
  await dialog.getByRole("button", { name: "Create paper" }).click();
  await expect(page).toHaveURL(/\/papers\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name: SESSIONAL })).toBeVisible();
});

test("the home screen lists recent papers", async ({ browser }) => {
  const page = await asUser(browser, FACULTY, FACULTY.own);
  await page.goto("/");
  const recent = page.getByRole("region", { name: "Recent papers" });
  await expect(recent.getByRole("listitem").first().getByRole("link")).toHaveAccessibleName(
    new RegExp(`^${SESSIONAL}`),
  );
  await expect(await papersLink(page, PRINTED)).toBeVisible();
});

test("papers are found by text and narrowed by exam, year, status and course", async ({
  browser,
}) => {
  const page = await asUser(browser, FACULTY, FACULTY.own);
  await page.goto("/papers");
  const search = page.getByRole("search", { name: "Find papers" });
  await search.getByRole("searchbox", { name: "Search" }).fill("chemistry");
  await search.getByRole("button", { name: "Show" }).click();
  await expect(page).toHaveURL(/q=chemistry/);
  await expect(page.getByText("1 paper match")).toBeVisible();
  await expect(await papersLink(page, SESSIONAL)).toBeVisible();
  await expect(await papersLink(page, PRINTED)).toBeHidden();

  // The selects apply at once; Back returns to the previous filters.
  await page.getByRole("link", { name: "Clear" }).click();
  // Wait for the cleared page: a filter picked on the old one is lost when it loads
  // (seen on windows-latest, run 42253325270).
  await expect(page).toHaveURL(/\/papers$/);
  await expect(search.getByRole("searchbox", { name: "Search" })).toHaveValue("");
  await expect(page.getByText("1 paper match")).toBeHidden();
  await search.getByLabel("Exam").selectOption({ label: "Sessional" });
  await expect(page).toHaveURL(/group=SESSIONAL/);
  await expect(await papersLink(page, SESSIONAL)).toBeVisible();
  await expect(await papersLink(page, PRINTED)).toBeHidden();
  await page.goto("/papers?status=PRINTED");
  await expect(await papersLink(page, PRINTED)).toBeVisible();
  await expect(
    page.getByRole("link", { name: new RegExp(`^${PRINTED} Printed \\d`) }),
  ).toBeVisible();
  await expect(await papersLink(page, SESSIONAL)).toBeHidden();
  await page.goto("/papers?year=2031-32");
  await expect(await papersLink(page, SESSIONAL)).toBeVisible();
  await page.goto("/papers?course=BP604T");
  await expect(await papersLink(page, PRINTED)).toBeVisible();
  await expect(await papersLink(page, SESSIONAL)).toBeHidden();
  await page.goto("/papers?q=nothing+like+this");
  await expect(page.getByText("No papers match.")).toBeVisible();
  // Unknown filter values are ignored, not errors.
  expect((await page.goto("/papers?group=NOPE&status=x"))?.status()).toBe(200);
});

test("a Printed paper is read-only until Edit puts it back to Draft", async ({ browser }) => {
  const page = await asUser(browser, FACULTY, FACULTY.own);
  await page.goto("/papers?status=PRINTED");
  await (await papersLink(page, PRINTED)).click();
  await page.waitForURL(/\/papers\/[0-9a-f-]{36}$/);
  printedUrl = page.url();
  await expect(
    page.getByRole("note").filter({ hasText: "This paper is Printed on" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Q.1(1)" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Details" })).toBeHidden();

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const ask = page.getByRole("dialog", { name: "Edit this printed paper?" });
  await expect(ask.getByRole("button", { name: "Cancel" })).toBeFocused();
  await ask.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Edit Q.1(1)" })).toBeDisabled();

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await ask.getByRole("button", { name: "Back to Draft and edit" }).click();
  await expect(page.getByRole("note").filter({ hasText: "This paper is" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Edit Q.1(1)" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Mark as Final" })).toBeVisible();
});

test("marking Final keeps a version; versions open as PDF", async ({ browser }) => {
  const page = await asUser(browser, FACULTY, FACULTY.own);
  await page.goto(printedUrl);
  await expect(page.getByRole("img", { name: /page 1 of/ })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Mark as Final" }).click();
  await expect(page.getByRole("note").filter({ hasText: "This paper is Final." })).toBeVisible();
  await page.getByRole("button", { name: /^Versions/ }).click();
  const dialog = page.getByRole("dialog", { name: "Versions" });
  const rows = dialog.getByRole("listitem");
  // The content did not change since the export, so marking it Final added no copy.
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Exported");
  const link = dialog.getByRole("link", { name: /Open the paper of the version/ });
  versionUrl = (await link.getAttribute("href")) ?? "";
  const pdf = await page.request.get(versionUrl);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  const key = await page.request.get(`${versionUrl}?kind=key`);
  expect(key.status()).toBe(200);
});

test("a version is restored as a new Draft paper", async ({ browser }) => {
  const page = await asUser(browser, FACULTY, FACULTY.own);
  await page.goto(printedUrl);
  await page.getByRole("button", { name: /^Versions/ }).click();
  const dialog = page.getByRole("dialog", { name: "Versions" });
  await dialog.getByRole("button", { name: "Restore…" }).click();
  await dialog.getByLabel("Title of the new paper").fill(`${PRINTED} (restored)`);
  await dialog.getByRole("button", { name: "Restore as new paper" }).click();
  await expect(page).not.toHaveURL(printedUrl);
  await expect(
    page.getByRole("heading", { level: 1, name: `${PRINTED} (restored)` }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark as Final" })).toBeVisible();
  await expect(page.getByRole("listitem", { name: "Q.1(1)", exact: true })).toContainText(
    "Inventolol",
  );
});

test("Duplicate as… next academic year", async ({ browser }) => {
  const page = await asUser(browser, FACULTY, FACULTY.own);
  await page.goto("/papers?q=chemistry");
  await (await papersLink(page, SESSIONAL)).click();
  await expect(page.getByRole("img", { name: /page 1 of/ })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Duplicate as…" }).click();
  const dialog = page.getByRole("dialog", { name: "Duplicate as…" });
  await expect(dialog.getByRole("radio", { name: /Next academic year/ })).toBeChecked();
  await expect(dialog.getByLabel("Academic year of the copy")).toHaveValue("2032-33");
  await expect(dialog.getByLabel("Title of the copy")).toHaveValue(`${SESSIONAL} (2032-33)`);
  await dialog.getByRole("button", { name: "Make the copy" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: `${SESSIONAL} (2032-33)` }),
  ).toBeVisible();
  await page.goto("/papers?year=2032-33");
  await expect(await papersLink(page, `${SESSIONAL} \\(2032-33\\)`)).toBeVisible();
});

test("someone else's versions do not exist for them", async ({ browser }) => {
  const page = await asUser(browser, ADMIN, ADMIN.password);
  expect((await page.request.get(versionUrl)).status()).toBe(404);
  expect((await page.request.get(`${versionUrl}?kind=key`)).status()).toBe(404);
  await page.goto("/papers?q=Invented");
  await expect(page.getByText(PRINTED)).toBeHidden();
});
