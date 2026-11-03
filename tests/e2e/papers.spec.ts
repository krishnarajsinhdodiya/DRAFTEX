// Paper editor end to end (SPEC §13 Phase 5, gate 9 editor part, D26):
// start a 4-credit end-semester paper from the built-in template, write
// questions with choices, an equation, a table and a picture, see them in the
// preview, download the PDF. Then gate 8 at the routes: someone else's paper
// and pictures answer "not found". All question text is invented.
// Runs after auth.spec.ts, which creates the accounts used here.
import fs from "node:fs";
import { type Page, expect, test } from "@playwright/test";
import { ADMIN, FACULTY, asUser } from "./support";

test.describe.configure({ mode: "serial" });

const TITLE = "Invented Pharmacology Paper";
let paperUrl = "";
let pictureUrl = "";

const question = (page: Page, name: string) => page.getByRole("listitem", { name, exact: true });
const editorOf = (page: Page, name: string) =>
  page.getByRole("textbox", { name: `Text of ${name}` });

async function open(page: Page, name: string) {
  await page
    .getByRole("button", { name: new RegExp(`^(Write|Edit) ${name.replace(/[().]/g, "\\$&")}$`) })
    .click();
  await expect(editorOf(page, name)).toBeFocused();
}

async function saved(page: Page) {
  await expect(page.getByRole("status").filter({ hasText: "All changes saved" })).toBeVisible({
    timeout: 15_000,
  });
}

test("a paper starts from a template with its course filled in", async ({ browser }) => {
  const page = await asUser(browser, FACULTY, FACULTY.own);
  await page.goto("/templates");
  await page
    .getByRole("link", { name: /Theory · End-Semester · 4 credits/ })
    .first()
    .click();
  await page.getByRole("button", { name: "New paper" }).click();
  const dialog = page.getByRole("dialog", { name: "New paper" });
  await dialog.getByRole("button", { name: "Create paper" }).click();
  await expect(dialog.getByText("Give the paper a title.")).toBeVisible();
  await dialog.getByLabel("Title", { exact: true }).fill(TITLE);
  const course = dialog.getByLabel("Course", { exact: true });
  const option = await course.locator("option", { hasText: /^BP604T/ }).textContent();
  await course.selectOption({ label: option ?? "" });
  await dialog.getByLabel("Exam date").fill("2026-11-20");
  await dialog.getByRole("button", { name: "Create paper" }).click();
  await expect(page).toHaveURL(/\/papers\/[0-9a-f-]{36}$/);
  paperUrl = page.url();
  await expect(page.getByRole("heading", { level: 1, name: TITLE })).toBeVisible();
  await expect(page.getByText(/\[BP604T\]/)).toBeVisible();
  await expect(page.getByRole("img", { name: /page 1 of/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("0 of 30 questions written")).toBeVisible();
});

test("questions take text, choices, an equation, a table and a picture", async ({ browser }) => {
  const page = await asUser(browser, FACULTY, FACULTY.own);
  await page.goto(paperUrl);

  // An MCQ with its answer marked for the key.
  await open(page, "Q.1(1)");
  await page.keyboard.type("Which invented drug is a beta blocker? ");
  await page.keyboard.type("/choi");
  await page.getByRole("option", { name: "Choices (A–D)" }).click();
  for (const [i, option] of ["Inventolol", "Fictropine", "Madeupamol", "Placebine"].entries()) {
    if (i > 0) await page.keyboard.press("ArrowDown");
    await page.keyboard.type(option);
  }
  await question(page, "Q.1(1)").getByLabel("A is the correct answer").check();
  await page.getByLabel("CO tag for Q.1(1)").selectOption({ index: 1 });

  // An equation through MathLive.
  await open(page, "Q.2(1)");
  await page.keyboard.type("Simplify ");
  await page.getByRole("button", { name: "Insert" }).click();
  await page.getByRole("menuitem", { name: "Equation", exact: true }).click();
  const field = page.getByLabel("Equation", { exact: true });
  await expect(field).toBeFocused();
  await page.keyboard.type("x^2");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.type("+1");
  await page.keyboard.press("Enter");
  await expect(field).toBeHidden();

  // A table.
  await open(page, "Q.2(2)");
  await page.keyboard.type("Complete the invented table.");
  await page.getByRole("button", { name: "Insert" }).click();
  await page.getByRole("menuitem", { name: "Table" }).click();
  await page.keyboard.type("Drug");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Dose");

  // A picture, uploaded through the button.
  await open(page, "Q.3(1)");
  await page.keyboard.type("Label the invented structure.");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Insert" }).click();
  await page.getByRole("menuitem", { name: "Picture" }).click();
  await (await chooser).setFiles("tests/fixtures/latex/assets/sample.png");
  const img = question(page, "Q.3(1)").getByRole("img", { name: "Picture in the question" });
  await expect(img).toBeVisible();
  pictureUrl = (await img.getAttribute("src")) ?? "";
  expect(pictureUrl).toMatch(/^\/api\/assets\/[0-9a-f]{64}\.png$/);

  await saved(page);
  await expect(page.getByText("4 of 30 questions written")).toBeVisible();
  // Nothing is flagged once the preview has the new questions.
  await expect(page.getByRole("img", { name: /page 1 of/ })).toBeVisible();
  await expect(page.getByText(/has an unmatched|could not be typeset|need fixing/)).toHaveCount(0, {
    timeout: 30_000,
  });
});

test("the questions are kept, the PDF downloads, and a clear can be undone", async ({
  browser,
}) => {
  const page = await asUser(browser, FACULTY, FACULTY.own);
  await page.goto(paperUrl);
  const q1 = question(page, "Q.1(1)");
  await expect(q1.getByText("Inventolol")).toBeVisible();
  await expect(question(page, "Q.2(2)").getByRole("table")).toBeVisible();
  await expect(page.getByText("4 of 30 questions written")).toBeVisible();

  await expect(page.getByRole("img", { name: /page 1 of/ })).toBeVisible({ timeout: 30_000 });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  const file = await (await download).path();
  expect(fs.readFileSync(file).subarray(0, 5).toString()).toBe("%PDF-");

  await q1.getByRole("button", { name: "Clear Q.1(1)" }).click();
  await expect(page.getByText("3 of 30 questions written")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(q1.getByText("Inventolol")).toBeVisible();
  await saved(page);
  await page.reload();
  await expect(question(page, "Q.1(1)").getByText("Inventolol")).toBeVisible();
});

test("Advanced LaTeX is offered only after an admin allows it", async ({ browser }) => {
  const page = await asUser(browser, FACULTY, FACULTY.own);
  await page.goto(paperUrl);
  await open(page, "Q.2(3)");
  await page.getByRole("button", { name: "Insert" }).click();
  await expect(page.getByRole("menuitem", { name: "Advanced LaTeX" })).toHaveCount(0);
  await page.keyboard.press("Escape");
});

test("someone else's paper and pictures do not exist for them, by any route", async ({
  browser,
}) => {
  const page = await asUser(browser, ADMIN, ADMIN.password);
  const id = paperUrl.split("/").pop() as string;
  expect((await page.goto(`/papers/${id}`))?.status()).toBe(404);
  await page.goto("/papers");
  await expect(page.getByText(TITLE)).toHaveCount(0);
  for (const url of [`/api/papers/${id}/preview`, pictureUrl, "/api/papers/not-an-id/preview"]) {
    expect((await page.request.get(url)).status(), url).toBe(404);
  }
  // Uploads need this app's own pages behind them, and a signed-in user.
  const upload = await page.request.post("/api/assets", {
    multipart: { file: { name: "x.png", mimeType: "image/png", buffer: Buffer.from("x") } },
  });
  expect(upload.status()).toBe(403);
  const anonymous = await browser.newContext();
  expect((await anonymous.request.get(`/api/papers/${id}/preview`)).status()).toBe(401);
  expect((await anonymous.request.get(pictureUrl)).status()).toBe(401);
  await anonymous.close();
});
