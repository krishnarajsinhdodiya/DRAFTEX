// Phase 10 (WP-C) end to end: elective CO tags in the picker (D63), sub-part
// marks, CO and Bloom (D65, D66), the paper's own "Print Bloom levels" switch
// (D64), the summary panel (D69), and the export: its warnings and the
// printed LaTeX of the paper and key (D67, D68). Invented data only.
import fs from "node:fs";
import { unzipSync } from "fflate";
import { type Page, expect, test } from "@playwright/test";
import { FACULTY, asUser } from "./support";

test.describe.configure({ mode: "serial", timeout: 120_000 });

const TITLE = "Invented Green Chemistry Paper";
let paperUrl = "";

const question = (page: Page, name: string) => page.getByRole("listitem", { name, exact: true });

test("a paper for an elective course offers CO tags as BP607T.01 AEC1", async ({ browser }) => {
  const page = await asUser(browser, FACULTY, FACULTY.own);
  await page.goto("/templates");
  await page
    .getByRole("link", { name: /Theory · End-Semester · 4 credits/ })
    .first()
    .click();
  await page.getByRole("button", { name: "New paper" }).click();
  const dialog = page.getByRole("dialog", { name: "New paper" });
  await dialog.getByLabel("Title", { exact: true }).fill(TITLE);
  await dialog
    .getByLabel("Course", { exact: true })
    .selectOption({ label: "BP607T AEC1 · Green Chemistry (Theory)" });
  await dialog.getByRole("button", { name: "Create paper" }).click();
  await expect(page).toHaveURL(/\/papers\/[0-9a-f-]{36}$/);
  paperUrl = page.url();
  // Wait for the first preview before editing (memory.md, Windows CI timing).
  await expect(page.getByRole("img", { name: /page 1 of/ })).toBeVisible({ timeout: 90_000 });

  await page.getByRole("button", { name: "Write Q.3(1)" }).click();
  const text = page.getByRole("textbox", { name: "Text of Q.3(1)" });
  await expect(text).toBeFocused();
  await page.keyboard.type("Answer the following about invented catalysts. /sub");
  await page.getByRole("option", { name: "Sub-parts (a)(b)(c)" }).click();
  // The cursor is in (a).
  await page.keyboard.type("Describe an invented catalyst.");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.type("Evaluate its yield.");

  const q = question(page, "Q.3(1)");
  const co = q.getByLabel("CO tag for Q.3(1)", { exact: true });
  await expect(co.locator("option", { hasText: "BP607T.01 AEC1" })).toHaveCount(1);
  await co.selectOption("BP607T.01 AEC1");
  await q.getByLabel("Bloom level for Q.3(1)", { exact: true }).selectOption({ label: "Apply" });
  // A sub-part follows the question until it gets its own value (D66).
  await expect(q.getByLabel("Bloom level for Q.3(1) (b)").locator("option").first()).toHaveText(
    "As question (Apply)",
  );
  await q.getByLabel("Marks for Q.3(1) (a)").fill("6");
  await q.getByLabel("Bloom level for Q.3(1) (a)").selectOption({ label: "Understand" });
  await q.getByLabel("CO tag for Q.3(1) (a)").selectOption("BP607T.02 AEC1");
  await q.getByLabel("Marks for Q.3(1) (b)").fill("3");
  await expect(
    q.getByText("The sub-part marks add up to 9, but the question is worth 10."),
  ).toBeVisible();
  await q.getByLabel("Marks for Q.3(1) (b)").fill("4");
  await expect(q.getByText(/sub-part marks add up/)).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "All changes saved" })).toBeVisible({
    timeout: 15_000,
  });
});

test("Print Bloom levels is the paper's own switch, and the summary counts sub-parts", async ({
  browser,
}) => {
  const page = await asUser(browser, FACULTY, FACULTY.own);
  await page.goto(paperUrl);
  await page.getByRole("button", { name: "Details" }).click();
  const dialog = page.getByRole("dialog", { name: "Paper details" });
  const box = dialog.getByRole("checkbox", { name: /Print Bloom levels/ });
  await expect(box).not.toBeChecked();
  await box.check();
  await dialog.getByRole("button", { name: "Save details" }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await page.getByRole("button", { name: "Details" }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Paper details" })
      .getByRole("checkbox", { name: /Print Bloom/ }),
  ).toBeChecked();
  await page.keyboard.press("Escape");

  await page.getByText("Bloom and CO summary").click();
  const bloom = page.getByRole("table", { name: "Questions and marks per Bloom level" });
  await expect(bloom.getByRole("row", { name: "Understand 1 6" })).toBeVisible();
  await expect(bloom.getByRole("row", { name: "Apply 1 4" })).toBeVisible();
  const co = page.getByRole("table", { name: "Questions and marks per CO" });
  await expect(co.getByRole("row", { name: "BP607T.02 AEC1 1 6" })).toBeVisible();
});

test("export warns about missing tags and prints Bloom and CO on the paper and key", async ({
  browser,
}) => {
  const page = await asUser(browser, FACULTY, FACULTY.own);
  await page.goto(paperUrl);
  await page.getByRole("button", { name: "Write Q.2(1)" }).click();
  await expect(page.getByRole("textbox", { name: "Text of Q.2(1)" })).toBeFocused();
  await page.keyboard.type("Define an invented solvent.");
  await expect(page.getByRole("status").filter({ hasText: "All changes saved" })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Export" }).click();
  const ask = page.getByRole("dialog", { name: "Export with these gaps?" });
  await expect(ask.getByText("Q.2(1) has no Bloom level or CO tag.")).toBeVisible({
    timeout: 30_000,
  });
  const download = page.waitForEvent("download");
  await ask.getByRole("button", { name: "Export anyway" }).click();
  const files = unzipSync(fs.readFileSync(await (await download).path()));
  const read = (name: string) =>
    new TextDecoder().decode(
      files[Object.keys(files).find((n) => n.endsWith(`/${name}`)) as string],
    );
  const paper = read("paper.tex");
  expect(paper).toContain("\\part Describe an invented catalyst.\\dxBloom{(Bloom: Understand)}");
  expect(paper).toContain("[BP607T.02~AEC1]");
  expect(paper).toContain(
    "\\part Evaluate its yield.\\dxBloom{(Bloom: Apply)}\\dxTail{[BP607T.01~AEC1]}",
  );
  const key = read("key.tex");
  expect(key).toContain("(a) (Bloom: Understand) {[}BP607T.02 AEC1{]}");
  await expect(page.getByRole("note").filter({ hasText: /This paper is Printed on/ })).toBeVisible({
    timeout: 60_000,
  });
});
