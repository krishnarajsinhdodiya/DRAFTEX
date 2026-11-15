// Paper editor end to end (SPEC §13 Phase 5, gate 9 editor part, D26):
// start a 4-credit end-semester paper from the built-in template, write
// questions with choices, an equation, a table and a picture, see them in the
// preview, download the PDF. Phase 6: write an answer key, export the paper
// and key as a zip, duplicate the paper for its ATKT exam. Then gate 8 at the
// routes: someone else's paper, pictures and backups answer "not found".
// All question text is invented.
// Runs after auth.spec.ts, which creates the accounts used here.
import fs from "node:fs";
import { unzipSync } from "fflate";
import { type Page, expect, test } from "@playwright/test";
import { ADMIN, asUser, closeOpenContexts, cspViolations, FACULTY } from "./support";

// These tests include real LaTeX compiles; on the Windows runner one takes up to ~25 s.
test.describe.configure({ mode: "serial", timeout: 120_000 });

test.afterEach(closeOpenContexts);

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
  // The CO field is free text with the syllabus COs as suggestions (D85); take the first one.
  const co = page.getByLabel("CO tag for Q.1(1)");
  const list = await co.getAttribute("list");
  const firstCo = await page.locator(`[id="${list}"] option`).first().getAttribute("value");
  await co.fill(firstCo ?? "");

  // An equation through MathLive.
  await open(page, "Q.2(1)");
  await page.keyboard.type("Simplify ");
  await page.getByRole("button", { name: "Insert" }).click();
  await page.getByRole("menuitem", { name: "Equation", exact: true }).click();
  // MathLive copies the label onto its own input inside the field once it has
  // started, so getByLabel can match two elements; the field itself is the host.
  const field = page.locator('math-field[aria-label="Equation"]');
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

test("Advanced LaTeX loads chemistry packages and refuses file commands (D86-D88)", async ({
  browser,
}) => {
  const admin = await asUser(browser, ADMIN, ADMIN.password);
  await admin.goto("/admin/users");
  const row = admin.getByRole("row").filter({ hasText: FACULTY.email });
  await row.getByRole("button", { name: "Allow Advanced LaTeX" }).click();
  await expect(row.getByText("May use Advanced LaTeX")).toBeVisible();

  const page = await asUser(browser, FACULTY, FACULTY.own);
  await page.goto(paperUrl);
  await open(page, "Q.2(3)");
  await page.getByRole("button", { name: "Insert" }).click();
  await page.getByRole("menuitem", { name: "Advanced LaTeX" }).click();
  const box = page.getByLabel("Advanced LaTeX (checked before it reaches the paper)");
  const done = page.getByRole("button", { name: "Done" });

  await box.fill("\\lstinputlisting{/etc/hosts}");
  await expect(page.getByText("\\lstinputlisting is not allowed for safety.")).toBeVisible();
  await expect(done).toBeDisabled();
  await box.fill("\\chemfig{A-[,,,,draw=none]B}");
  await expect(page.getByText(/bond options may only hold an angle/)).toBeVisible();
  await expect(done).toBeDisabled();

  await box.fill("\\ce{2H2 + O2 -> 2H2O} \\chemfig{*6(=-=-=-)}");
  await expect(page.getByText("Uses mhchem, chemfig; the paper loads them for you.")).toBeVisible();
  await page.getByText("Chemistry, colour and list commands").click();
  await expect(page.getByText("TikZ, pgfplots, listings and file commands are not")).toBeVisible();
  const preview = page.waitForResponse(
    (r) => r.url().includes("/preview") && r.request().method() === "GET" && r.status() === 200,
    { timeout: 60_000 },
  );
  await done.click();
  await saved(page);
  expect((await preview).headers()["content-type"]).toContain("application/pdf");
  await expect(page.getByText(/has an unmatched|could not be typeset|need fixing/)).toHaveCount(0, {
    timeout: 30_000,
  });

  // Leave the paper and the account as the later tests expect them.
  await question(page, "Q.2(3)").getByText("\\ce{2H2 + O2 -> 2H2O}", { exact: false }).click();
  await page.getByRole("button", { name: "Remove" }).click();
  await saved(page);
  await admin.reload();
  await row.getByRole("button", { name: "Turn off Advanced LaTeX" }).click();
  await expect(row.getByText("May use Advanced LaTeX")).toHaveCount(0);
});

test("a code block is written, a closing line is refused, and View LaTeX shows it (D98-D104)", async ({
  browser,
}) => {
  const page = await asUser(browser, FACULTY, FACULTY.own);
  await page.goto(paperUrl);
  await open(page, "Q.2(3)");
  // Inline code by backticks, then a code block from the Insert menu.
  await page.keyboard.type("What does `len` do here? ");
  await expect(question(page, "Q.2(3)").locator("code", { hasText: "len" })).toBeVisible();
  await page.getByRole("button", { name: "Insert" }).click();
  await page.getByRole("menuitem", { name: "Code block" }).click();
  await page.keyboard.type("for i in range(2):");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("print(len(str(i)))");
  const check = question(page, "Q.2(3)")
    .getByRole("status")
    .filter({ hasText: /lines?, longest/ });
  await expect(check).toHaveText(/^2 lines, longest 22 of \d+ characters$/);

  // A line that would end the block is refused at once, and by the server.
  await page.keyboard.press("Enter");
  await page.keyboard.type("x \\end{Verbatim}");
  await expect(
    question(page, "Q.2(3)")
      .getByText("Line 3 contains \\end{Verbatim}, which would end the code block.")
      .first(),
  ).toBeVisible();
  for (let i = 0; i < "x \\end{Verbatim}".length + 1; i++) await page.keyboard.press("Backspace");
  await expect(check).toHaveText(/^2 lines/);
  const preview = page.waitForResponse(
    (r) => r.url().includes("/preview") && r.request().method() === "GET" && r.status() === 200,
    { timeout: 60_000 },
  );
  await saved(page);
  expect((await preview).headers()["content-type"]).toContain("application/pdf");

  // View LaTeX: one question, then the whole paper; read-only.
  await question(page, "Q.2(3)").getByRole("button", { name: "View the LaTeX of Q.2(3)" }).click();
  let dialog = page.getByRole("dialog", { name: "LaTeX of Q.2(3)" });
  const tex = dialog.getByLabel("LaTeX of Q.2(3)");
  await expect(tex).toContainText("\\texttt{len}");
  await expect(tex).toContainText(
    "\\begin{Verbatim}[numbers=left, numbersep=4pt, frame=single, fontsize=\\small, samepage=true]\nfor i in range(2):\n    print(len(str(i)))\n\\end{Verbatim}",
  );
  await expect(dialog.locator("textarea, [contenteditable=true]")).toHaveCount(0);
  await dialog.getByRole("radio", { name: "Answer key" }).click();
  await expect(tex).toContainText("%% DX-SLOT g2.3");
  await dialog.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "LaTeX", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "LaTeX of the paper" });
  await expect(dialog.getByLabel("LaTeX of the paper")).toContainText("\\usepackage{fancyvrb}");
  await dialog.getByRole("button", { name: "Close" }).click();

  // Leave the paper as the later tests expect it.
  await question(page, "Q.2(3)").getByRole("button", { name: "Clear Q.2(3)" }).click();
  await saved(page);
});

test("a table gets a merged header, alignment, widths and a grid; View LaTeX shows it (D105-D107)", async ({
  browser,
}) => {
  const page = await asUser(browser, FACULTY, FACULTY.own);
  await page.goto(paperUrl);
  await open(page, "Q.2(4)");
  const q = question(page, "Q.2(4)");
  await page.keyboard.type("Complete the table of doses.");
  await page.getByRole("button", { name: "Insert" }).click();
  await page.getByRole("menuitem", { name: "Table" }).click();
  for (const [i, cell] of [
    "Product",
    "Dose",
    "",
    "",
    "Adult",
    "Child",
    "Product X",
    "500 mg",
    "250 mg",
  ].entries()) {
    if (i > 0) await page.keyboard.press("Tab");
    if (cell) await page.keyboard.type(cell);
  }
  const bar = page.getByRole("toolbar", { name: "Table" });
  await expect(bar).toBeVisible();

  // Merge "Dose" with the empty header cell beside it.
  await q.locator("th").nth(1).click();
  await q
    .locator("th")
    .nth(2)
    .click({ modifiers: ["Shift"] });
  await bar.getByRole("button", { name: /^Merge the selected cells/ }).click();
  await expect(q.locator('th[colspan="2"]')).toHaveText("Dose");

  // Widths that do not add up are named at once; then fixed.
  await bar.getByRole("button", { name: "Columns" }).click();
  const columns = page.getByRole("dialog", { name: "Columns" });
  await columns.getByLabel("Column 1 width").fill("50");
  await columns.getByLabel("Column 2 width").fill("25");
  await columns.getByLabel("Column 3 width").fill("20");
  await expect(
    page.getByText("The column widths add up to 95%; they must add up to 100%."),
  ).toBeVisible();
  await columns.getByLabel("Column 3 width").fill("25");
  await expect(page.getByText(/they must add up to 100%/)).toHaveCount(0);
  await columns
    .getByRole("radiogroup", { name: "Column 2 alignment" })
    .getByRole("radio", { name: "Centre" })
    .click();
  await page.keyboard.press("Escape");
  await expect(q.locator("td", { hasText: "500 mg" })).toHaveCSS("text-align", "center");
  await bar.getByRole("radio", { name: "Grid" }).click();
  await expect(q.locator("table")).toHaveAttribute("data-borders", "GRID");

  const preview = page.waitForResponse(
    (r) => r.url().includes("/preview") && r.request().method() === "GET" && r.status() === 200,
    { timeout: 60_000 },
  );
  await saved(page);
  expect((await preview).headers()["content-type"]).toContain("application/pdf");
  await expect(q.getByText(/could not be typeset|cannot/)).toHaveCount(0);

  await q.getByRole("button", { name: "View the LaTeX of Q.2(4)" }).click();
  const dialog = page.getByRole("dialog", { name: "LaTeX of Q.2(4)" });
  const tex = dialog.getByLabel("LaTeX of Q.2(4)");
  await expect(tex).toContainText(
    "\\begin{tabular}{|>{\\raggedright\\arraybackslash}p{0.5\\dimexpr 0.8\\linewidth-6\\tabcolsep-4\\arrayrulewidth\\relax}|",
  );
  await expect(tex).toContainText(
    "\\multicolumn{2}{>{\\centering\\arraybackslash}p{\\dimexpr 0.5\\dimexpr",
  );
  await expect(tex).toContainText("Product X & 500 mg & 250 mg\\\\");
  await dialog.getByRole("button", { name: "Close" }).click();

  // Leave the paper as the later tests expect it.
  await q.getByRole("button", { name: "Clear Q.2(4)" }).click();
  await saved(page);
});

test("the answer key is written with the question and previewed", async ({ browser }) => {
  const page = await asUser(browser, FACULTY, FACULTY.own);
  await page.goto(paperUrl);
  const q = question(page, "Q.2(1)");
  await q.getByRole("button", { name: /^Answer key/ }).click();
  await q.getByRole("textbox", { name: "Model answer for Q.2(1)" }).click();
  await page.keyboard.type("Expand the square, then add one.");
  await q.getByRole("button", { name: "Add a row" }).click();
  await q.getByLabel("What earns marks, row 1").fill("Correct working");
  await q.getByLabel("Marks for row 1").fill("2");
  await expect(
    q.getByText(/The split-up marks add up to 2, but the question is worth/),
  ).toBeVisible();
  // The MCQ's key comes from its ticked option.
  await expect(
    question(page, "Q.1(1)").getByRole("button", { name: /Answer key · correct: A/ }),
  ).toBeVisible();
  await saved(page);

  await page.getByRole("button", { name: "Answer key", exact: true, pressed: false }).click();
  await expect(page.getByRole("img", { name: /Answer key of .* page 1 of/ })).toBeVisible({
    timeout: 30_000,
  });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download key" }).click();
  expect((await download).suggestedFilename()).toMatch(/ key\.pdf$/);

  await page.reload();
  await expect(
    question(page, "Q.2(1)").getByRole("button", { name: /model answer written · 1 split-up row/ }),
  ).toBeVisible();
});

test("export asks about gaps, then saves the paper and key as a zip", async ({ browser }) => {
  const page = await asUser(browser, FACULTY, FACULTY.own);
  await page.goto(paperUrl);
  await page.getByRole("button", { name: "Export" }).click();
  const ask = page.getByRole("dialog", { name: "Export with these gaps?" });
  await expect(ask.getByText(/26 empty questions are left out/)).toBeVisible({ timeout: 30_000 });
  await expect(ask.getByText("Q.2(2) has no answer in the key.")).toBeVisible();
  const download = page.waitForEvent("download");
  await ask.getByRole("button", { name: "Export anyway" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^\d{4}-\d{2}-\d{2} Invented Pharmacology Paper\.zip$/);
  await expect(
    page.getByRole("status").filter({ hasText: /Exported to .*B\.Pharm.BP604T/ }),
  ).toBeVisible({
    timeout: 60_000,
  });
  const names = Object.keys(unzipSync(fs.readFileSync(await file.path())))
    .map((n) => n.split("/").slice(1).join("/"))
    .sort();
  expect(names.filter((n) => !n.startsWith("assets/"))).toEqual([
    "README.txt",
    "key.pdf",
    "key.tex",
    "paper.pdf",
    "paper.tex",
  ]);
  expect(names.filter((n) => n.startsWith("assets/"))).toHaveLength(1);
  // D55: the export marks the paper Printed; it is read-only until Edit.
  await expect(
    page.getByRole("note").filter({ hasText: /This paper is Printed on/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Dismiss" }).click();
});

test("a paper is duplicated with its questions and key for the ATKT exam", async ({ browser }) => {
  const page = await asUser(browser, FACULTY, FACULTY.own);
  await page.goto(paperUrl);
  // The editor is ready (and its buttons work) once the first preview is in.
  await expect(page.getByRole("img", { name: /page 1 of/ })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Duplicate as…" }).click();
  const dialog = page.getByRole("dialog", { name: "Duplicate as…" });
  // An end-semester paper suggests its ATKT copy (D60).
  await expect(dialog.getByRole("radio", { name: /ATKT copy/ })).toBeChecked();
  await expect(dialog.getByLabel("Title of the copy")).toHaveValue(`${TITLE} (ATKT)`);
  await dialog.getByRole("button", { name: "Make the copy" }).click();
  await expect(page).not.toHaveURL(paperUrl);
  await expect(page).toHaveURL(/\/papers\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name: `${TITLE} (ATKT)` })).toBeVisible();
  await expect(question(page, "Q.1(1)").getByText("Inventolol")).toBeVisible();
  await expect(
    question(page, "Q.2(1)").getByRole("button", { name: /model answer written/ }),
  ).toBeVisible();
  await expect(page.getByText(/^Supplementary \(ATKT\) · /)).toBeVisible();
  await page.goto("/papers");
  await expect(page.getByText(`${TITLE} (ATKT)`)).toBeVisible();
});

test("someone else's paper and pictures do not exist for them, by any route", async ({
  browser,
}) => {
  const page = await asUser(browser, ADMIN, ADMIN.password);
  const id = paperUrl.split("/").pop() as string;
  expect((await page.goto(`/papers/${id}`))?.status()).toBe(404);
  await page.goto("/papers");
  await expect(page.getByText(TITLE)).toHaveCount(0);
  for (const url of [
    `/api/papers/${id}/preview`,
    `/api/papers/${id}/preview?kind=key`,
    pictureUrl,
    "/api/papers/not-an-id/preview",
  ]) {
    expect((await page.request.get(url)).status(), url).toBe(404);
  }
  const origin = { Origin: new URL(paperUrl).origin };
  const exported = await page.request.post(`/api/papers/${id}/export`, {
    headers: origin,
    data: { confirmed: true },
  });
  expect(exported.status()).toBe(404);
  // Exports, like uploads, need this app's own pages behind them.
  expect((await page.request.post(`/api/papers/${id}/export`, { data: {} })).status()).toBe(403);
  // Uploads need this app's own pages behind them, and a signed-in user.
  const upload = await page.request.post("/api/assets", {
    multipart: { file: { name: "x.png", mimeType: "image/png", buffer: Buffer.from("x") } },
  });
  expect(upload.status()).toBe(403);
  // Backups are for administrators: faculty find nothing there.
  const faculty = await asUser(browser, FACULTY, FACULTY.own);
  expect((await faculty.goto("/admin/backups"))?.status()).toBe(404);
  expect(
    (
      await faculty.request.get("/api/admin/backups/DRAFTEX-backup-2026-01-01_000000-auto.zip")
    ).status(),
  ).toBe(404);
  expect(
    (
      await faculty.request.post("/api/admin/restore", {
        headers: { ...origin, "Content-Type": "application/zip" },
        data: Buffer.from("PK"),
      })
    ).status(),
  ).toBe(404);
  await faculty.context().close();
  const anonymous = await browser.newContext();
  expect((await anonymous.request.get(`/api/papers/${id}/preview`)).status()).toBe(401);
  expect((await anonymous.request.get(pictureUrl)).status()).toBe(401);
  await anonymous.close();
});

test("a deleted paper goes to Trash, comes back with Undo or Restore, and can be deleted forever (D51)", async ({
  browser,
}) => {
  const page = await asUser(browser, FACULTY, FACULTY.own);
  await page.goto(paperUrl);
  await expect(page.getByRole("img", { name: /page 1 of/ })).toBeVisible({ timeout: 60_000 });
  const id = paperUrl.split("/").pop() as string;

  // Undo straight after deleting.
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page
    .getByRole("dialog", { name: `Move “${TITLE}” to Trash?` })
    .getByRole("button", { name: "Move to Trash" })
    .click();
  await expect(page).toHaveURL(/\/papers\?trashed=/);
  await expect(page.getByText(`“${TITLE}” was moved to Trash.`)).toBeVisible();
  expect((await page.request.get(`/api/papers/${id}/preview`)).status()).toBe(404);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page).toHaveURL(/\/papers$/);
  await expect(
    page.getByRole("link", { name: new RegExp(`^${TITLE} (Draft|Final|Printed)`) }),
  ).toBeVisible();

  // Delete again, then Restore from the Trash page.
  await page.goto(paperUrl);
  await expect(page.getByRole("img", { name: /page 1 of/ })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await expect(page).toHaveURL(/\/papers\?trashed=/);
  await page.getByRole("link", { name: "Trash (1)" }).click();
  await expect(page.getByText("30 days left")).toBeVisible();
  await page.getByRole("button", { name: `Restore ${TITLE}` }).click();
  await expect(page.getByText("Trash is empty.")).toBeVisible();
  expect((await page.goto(paperUrl))?.status()).toBe(200);

  // A copy deleted for good is gone; the original stays.
  await page.goto("/papers");
  await page.getByRole("link", { name: new RegExp(`^${TITLE} \\(ATKT\\)`) }).click();
  await expect(page.getByRole("img", { name: /page 1 of/ })).toBeVisible({ timeout: 60_000 });
  const copyUrl = page.url();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Move to Trash" }).click();
  // The action redirects; going elsewhere before it lands aborts one of the two.
  await expect(page).toHaveURL(/\/papers\?trashed=/);
  await page.goto("/papers/trash");
  await page.getByRole("button", { name: `Delete ${TITLE} (ATKT) forever` }).click();
  await page
    .getByRole("dialog", { name: `Delete “${TITLE} (ATKT)” forever?` })
    .getByRole("button", { name: "Delete forever" })
    .click();
  await expect(page.getByText("Trash is empty.")).toBeVisible();
  expect((await page.goto(copyUrl))?.status()).toBe(404);
  expect((await page.goto(paperUrl))?.status()).toBe(200);
});

test("no page broke the Content Security Policy (editor, MathLive, PDF preview)", () => {
  expect(cspViolations).toEqual([]);
});
