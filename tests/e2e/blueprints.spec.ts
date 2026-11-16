// Phase 15 end to end: a teacher makes a CO blueprint (D108); the paper
// editor's summary compares the paper with it as COs change, a second CO
// included (D109, D121); export lists the notes and still exports (D110);
// an admin gets "not found" for the private blueprint (gate 8). Invented data.
import { type Page, expect, test } from "@playwright/test";
import { ADMIN, asUser, closeOpenContexts, FACULTY } from "./support";

test.describe.configure({ mode: "serial", timeout: 120_000 });
test.afterEach(closeOpenContexts);

let blueprintUrl = "";

const row = (page: Page, co: string) =>
  page
    .getByRole("table", { name: "Paper against the CO blueprint" })
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader", { name: co, exact: true }) });

test("a teacher makes a blueprint for a course and exam group", async ({ browser }) => {
  const page = await asUser(browser, FACULTY, FACULTY.own);
  await page.goto("/blueprints");
  await page.getByRole("link", { name: "New blueprint" }).click();
  await page.getByLabel("Course code").fill("BP604T");
  await page.getByLabel("Exam group").selectOption({ label: "End-semester" });
  await page.getByLabel("Allowed difference (±marks)").fill("1");
  await page.getByLabel("CO 1", { exact: true }).fill("BP604T.01");
  await page.getByLabel("Target for CO 1 (marks)").fill("10");
  await page.getByRole("button", { name: "Add CO" }).click();
  await page.getByLabel("CO 2", { exact: true }).fill("BP604T.02");
  await page.getByLabel("Target for CO 2 (marks)").fill("0");
  await expect(page.getByText("Total 10 marks")).toBeVisible();
  await page.getByRole("button", { name: "Save blueprint" }).click();
  await expect(page.getByText("Blueprint saved.")).toBeVisible();
  await expect(page).toHaveURL(/\/blueprints\/[0-9a-f-]{36}\?saved=1$/);
  blueprintUrl = page.url().replace(/\?.*$/, "");
  await expect(page.getByRole("heading", { name: "BP604T · End-semester" })).toBeVisible();

  // One per course and exam group.
  await page.goto("/blueprints/new");
  await page.getByLabel("Course code").fill("BP604T");
  await page.getByLabel("Exam group").selectOption({ label: "End-semester" });
  await page.getByLabel("CO 1", { exact: true }).fill("BP604T.01");
  await page.getByLabel("Target for CO 1 (marks)").fill("5");
  await page.getByRole("button", { name: "Save blueprint" }).click();
  await expect(page.getByText(/already have a blueprint for this course/)).toBeVisible();
});

test("an admin cannot open someone else's private blueprint", async ({ browser }) => {
  const page = await asUser(browser, ADMIN, ADMIN.password);
  const res = await page.goto(blueprintUrl);
  expect(res?.status()).toBe(404);
  await page.goto("/blueprints");
  await expect(page.getByRole("link", { name: /BP604T/ })).toHaveCount(0);
});

test("the summary compares the paper as COs change, and export only warns", async ({ browser }) => {
  const page = await asUser(browser, FACULTY, FACULTY.own);
  await page.goto("/templates");
  await page
    .getByRole("link", { name: /Theory · End-Semester · 4 credits/ })
    .first()
    .click();
  await page.getByRole("button", { name: "New paper" }).click();
  const dialog = page.getByRole("dialog", { name: "New paper" });
  await dialog.getByLabel("Title", { exact: true }).fill("Invented Blueprint Paper");
  await dialog
    .getByLabel("Course", { exact: true })
    .selectOption({ label: "BP604T · AI applications in Pharmaceutical Sciences (Theory)" });
  await dialog.getByRole("button", { name: "Create paper" }).click();
  await expect(page).toHaveURL(/\/papers\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("img", { name: /page 1 of/ })).toBeVisible({ timeout: 90_000 });

  await page.getByRole("button", { name: "Write Q.3(1)" }).click();
  await expect(page.getByRole("textbox", { name: "Text of Q.3(1)" })).toBeFocused();
  await page.keyboard.type("Explain an invented mechanism.");
  await page.getByText("Bloom and CO summary").click();
  await expect(row(page, "No CO")).toContainText("No CO");
  await expect(row(page, "BP604T.01")).toContainText("Under");

  const q = page.getByRole("listitem", { name: "Q.3(1)", exact: true });
  await q.getByLabel("CO tag for Q.3(1)", { exact: true }).fill("BP604T.01");
  await expect(row(page, "No CO")).toHaveCount(0);
  // A second CO takes half the marks; BP604T.02's target is 0, so it is over.
  await q.getByLabel("Second CO tag for Q.3(1) (optional)", { exact: true }).fill("BP604T.02");
  await expect(row(page, "BP604T.02")).toContainText("Over");
  await expect(page.getByRole("link", { name: "Open" })).toHaveAttribute(
    "href",
    new URL(blueprintUrl).pathname,
  );
  await expect(page.getByRole("status").filter({ hasText: "All changes saved" })).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole("button", { name: "Export" }).click();
  const ask = page.getByRole("dialog", { name: "Export with these gaps?" });
  await expect(ask.getByText(/^Blueprint: BP604T\.02 has .* over\)\.$/)).toBeVisible({
    timeout: 30_000,
  });
  const download = page.waitForEvent("download");
  await ask.getByRole("button", { name: "Export anyway" }).click();
  expect((await download).suggestedFilename()).toMatch(/Invented Blueprint Paper\.zip$/);
});
