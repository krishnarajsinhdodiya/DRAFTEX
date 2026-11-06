// Phase 11 (WP-D, WP-E) end to end: "Add to bank" from a paper with its
// skip report (D77), sharing (D73), a colleague inserting a shared question
// with per-user "last used in" (D75, D78), the bank screen, CSV import with
// preview, save and error report (D80), and Trash (D82). Invented data only.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { type Page, expect, test } from "@playwright/test";
import { ADMIN, FACULTY, asUser, closeOpenContexts } from "./support";

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.afterEach(closeOpenContexts);

const PRIVATE_TEXT = "Invented private bank question about tablet coating.";
const SHARED_TEXT = "Invented shared bank question about dissolution testing.";

const question = (page: Page, name: string) => page.getByRole("listitem", { name, exact: true });

async function newPaper(page: Page, title: string) {
  await page.goto("/templates");
  await page
    .getByRole("link", { name: /Theory · End-Semester · 4 credits/ })
    .first()
    .click();
  await page.getByRole("button", { name: "New paper" }).click();
  const dialog = page.getByRole("dialog", { name: "New paper" });
  await dialog.getByLabel("Title", { exact: true }).fill(title);
  const course = dialog.getByLabel("Course", { exact: true });
  const value = await course.locator("option", { hasText: "BP604T ·" }).getAttribute("value");
  await course.selectOption(value ?? "");
  // D85: the syllabus fills the code, and it stays editable.
  await expect(dialog.getByLabel("Course code")).toHaveValue("BP604T");
  await dialog.getByRole("button", { name: "Create paper" }).click();
  await expect(page).toHaveURL(/\/papers\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("img", { name: /page 1 of/ })).toBeVisible({ timeout: 90_000 });
}

async function write(page: Page, name: string, text: string, co?: string, bloom?: string) {
  await page.getByRole("button", { name: `Write ${name}` }).click();
  await expect(page.getByRole("textbox", { name: `Text of ${name}` })).toBeFocused();
  await page.keyboard.type(text);
  const q = question(page, name);
  if (co) await q.getByLabel(`CO tag for ${name}`, { exact: true }).fill(co);
  if (bloom) {
    await q.getByLabel(`Bloom level for ${name}`, { exact: true }).selectOption({ label: bloom });
  }
}

test("Add to bank adds tagged questions and reports what it skipped", async ({ browser }) => {
  const page = await asUser(browser, FACULTY, FACULTY.own);
  await newPaper(page, "Invented Bank Source Paper");
  await write(page, "Q.2(1)", SHARED_TEXT, "BP604T.01", "Apply");
  await write(page, "Q.2(2)", PRIVATE_TEXT, "BP604T.02", "Remember");
  await write(page, "Q.2(3)", "Invented question without a level.", "BP604T.01");
  await page.getByRole("button", { name: "Add to bank" }).click();
  const report = page.getByRole("dialog", { name: "2 questions added to the bank" });
  await expect(report).toBeVisible();
  await expect(report).toContainText("Q.2(3): No Bloom level.");
  await report.getByRole("button", { name: "OK" }).click();

  // Adding again finds them as duplicates (D76).
  await page.getByRole("button", { name: "Add to bank" }).click();
  const again = page.getByRole("dialog", { name: "Nothing was added to the bank" });
  await expect(again).toContainText("Q.2(1): Already in your bank.");
  await again.getByRole("button", { name: "OK" }).click();
});

test("the bank lists them; sharing one makes it visible to a colleague", async ({ browser }) => {
  const page = await asUser(browser, FACULTY, FACULTY.own);
  await page.goto("/bank");
  await expect(page.getByText("2 questions, most recently changed first")).toBeVisible();
  await page.getByRole("link", { name: new RegExp(SHARED_TEXT.slice(0, 30)) }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Question", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Course code")).toHaveValue("BP604T");
  await expect(page.getByText("Invented Bank Source Paper")).toBeVisible();
  await page.getByLabel(/Share with colleagues/).check();
  await page.getByRole("textbox", { name: "Tags" }).fill("dissolution; invented");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
});

test("a colleague sees only the shared question and inserts it into a paper", async ({
  browser,
}) => {
  const page = await asUser(browser, ADMIN, ADMIN.password);
  await page.goto("/bank");
  await expect(page.getByText("1 question, most recently changed first")).toBeVisible();
  await expect(page.getByText(PRIVATE_TEXT)).toHaveCount(0);
  await expect(page.getByText(`From ${FACULTY.name}`)).toBeVisible();

  await newPaper(page, "Invented Colleague Paper");
  await page.getByRole("button", { name: "Write Q.2(4)" }).click();
  await question(page, "Q.2(4)")
    .getByRole("button", { name: "Use a bank question for Q.2(4)" })
    .click();
  const picker = page.getByRole("dialog", { name: "Insert Q.2(4) from the question bank" });
  // The picker starts with the paper's course and the place's marks.
  await expect(picker.getByLabel("Course")).toHaveValue("BP604T");
  await expect(picker.getByText("Not used by you yet")).toBeVisible();
  await picker.getByRole("button", { name: "Insert" }).click();
  await expect(picker).toBeHidden();
  await expect(question(page, "Q.2(4)")).toContainText(SHARED_TEXT);
  await expect(
    question(page, "Q.2(4)").getByLabel("CO tag for Q.2(4)", { exact: true }),
  ).toHaveValue("BP604T.01");

  // Undo takes the insert back.
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(question(page, "Q.2(4)")).not.toContainText(SHARED_TEXT);
  await question(page, "Q.2(4)")
    .getByRole("button", { name: "Use a bank question for Q.2(4)" })
    .click();
  await page
    .getByRole("dialog", { name: "Insert Q.2(4) from the question bank" })
    .getByRole("button", { name: "Insert" })
    .click();
  await expect(question(page, "Q.2(4)")).toContainText(SHARED_TEXT);

  await page.goto("/bank");
  await expect(page.getByText(/Last used in Invented Colleague Paper/).first()).toBeVisible();
});

test("the author does not see the colleague's use (D75)", async ({ browser }) => {
  const page = await asUser(browser, FACULTY, FACULTY.own);
  await page.goto("/bank");
  await expect(page.getByText(/Invented Colleague Paper/)).toHaveCount(0);
});

test("CSV import previews row by row, saves the valid rows, reports the rest", async ({
  browser,
}) => {
  const page = await asUser(browser, FACULTY, FACULTY.own);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "draftex-csv-"));
  const file = path.join(dir, "invented.csv");
  fs.writeFileSync(
    file,
    [
      "course code,unit,co,bloom,marks,type,question,answer,tags",
      "BP604T,1,3,Understand,4,SHORT,Invented imported question one.,,",
      "MPH101T,,MPH101T.02,Evaluate,10,LONG,Invented M.Pharm imported question.,,",
      "BP604T,1,1,Recall,2,SHORT,Invented row with a bad level.,,",
      `BP604T,1,1,Apply,4,SHORT,${SHARED_TEXT},,`,
    ].join("\r\n"),
  );
  await page.goto("/bank/import");
  const template = page.waitForEvent("download");
  await page.getByRole("link", { name: "CSV template" }).click();
  expect((await template).suggestedFilename()).toBe("draftex-question-bank-template.csv");

  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose a CSV file" }).click();
  await (await chooser).setFiles(file);
  await expect(page.getByRole("status").filter({ hasText: "Read as" })).toContainText(
    "Read as UTF-8",
  );
  await expect(page.getByRole("status").filter({ hasText: "Read as" })).toContainText("2 ready");
  await expect(page.getByText(/bloom "Recall" is not one of/)).toBeVisible();
  await expect(page.getByText("Already in your bank.")).toBeVisible();

  const report = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download the problems as CSV" }).click();
  const saved = path.join(dir, "problems.csv");
  await (await report).saveAs(saved);
  expect(fs.readFileSync(saved, "utf8")).toContain("Recall");

  await page.getByRole("button", { name: /Save 2 questions/ }).click();
  await expect(page.getByText("2 questions were saved to your bank.")).toBeVisible();
  await page.goto("/bank?course=MPH101T");
  await expect(page.getByText("Invented M.Pharm imported question.")).toBeVisible();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a bank question goes to Trash and comes back", async ({ browser }) => {
  const page = await asUser(browser, FACULTY, FACULTY.own);
  await page.goto("/bank?q=imported+question+one");
  await page.getByRole("link", { name: /Invented imported question one/ }).click();
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await expect(page).toHaveURL(/\/bank$/);
  await page.goto("/papers/trash");
  const row = page.getByRole("listitem").filter({ hasText: "Invented imported question one" });
  await row.getByRole("button", { name: /^Restore/ }).click();
  await expect(row).toHaveCount(0);
  await page.goto("/bank?q=imported+question+one");
  await expect(page.getByText("1 question match")).toBeVisible();
});
