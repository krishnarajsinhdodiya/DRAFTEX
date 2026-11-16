// Takes the screenshots in docs/USER_GUIDE.md from a fresh throwaway copy of
// DRAFTEX, using invented accounts and questions only (never real papers).
// 1. node scripts/e2e-server.ts 3212        (fresh data folder, built app)
// 2. node scripts/guide-screenshots.ts http://127.0.0.1:3212
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Page, chromium, expect } from "@playwright/test";
import sharp from "sharp";

const base = process.argv[2] ?? "http://127.0.0.1:3212";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "docs", "user-guide");
const ADMIN = {
  name: "Dr Example Admin",
  email: "admin@example.test",
  password: "example guide password",
};

async function shot(
  page: Page,
  name: string,
  clip?: { x: number; y: number; width: number; height: number },
) {
  await page.waitForTimeout(400);
  const png = await page.screenshot(clip ? { clip } : {});
  // Palette PNGs keep the text sharp at a fraction of the size.
  await sharp(png)
    .png({ palette: true, quality: 90, compressionLevel: 9 })
    .toFile(path.join(out, `${name}.png`));
  console.log(`docs/user-guide/${name}.png`);
}

const browser = await chromium.launch();
const context = await browser.newContext({
  baseURL: base,
  viewport: { width: 1280, height: 800 },
  colorScheme: "light",
  reducedMotion: "reduce",
});
const page = await context.newPage();

await page.goto("/");
await page.getByLabel("Your name").fill(ADMIN.name);
await page.getByLabel("Email").fill(ADMIN.email);
await page.getByLabel("Password", { exact: true }).fill(ADMIN.password);
await page.getByLabel("Type the password again").fill(ADMIN.password);
await shot(page, "01-first-run");
await page.getByRole("button", { name: "Create administrator" }).click();
await page.getByRole("heading", { name: `Welcome, ${ADMIN.name}` }).waitFor();
await shot(page, "02-home");

await page.goto("/templates");
await page
  .getByRole("link", { name: /Theory · End-Semester · 4 credits/ })
  .first()
  .waitFor();
await shot(page, "03-templates");

await page
  .getByRole("link", { name: /Theory · End-Semester · 4 credits/ })
  .first()
  .click();
await page.getByRole("img", { name: /page 1 of/ }).waitFor({ timeout: 90_000 });
await page.getByRole("button", { name: "New paper" }).click();
const dialog = page.getByRole("dialog", { name: "New paper" });
await dialog.getByLabel("Title", { exact: true }).fill("Example Pharmacology Paper");
const course = dialog.getByLabel("Course", { exact: true });
const option = await course.locator("option", { hasText: /^BP604T/ }).textContent();
await course.selectOption({ label: option ?? "" });
await dialog.getByLabel("Exam date").fill("2026-11-20");
await shot(page, "04-new-paper");
await dialog.getByRole("button", { name: "Create paper" }).click();
await page.waitForURL(/\/papers\/[0-9a-f-]{36}$/);
const paperUrl = page.url();
await page.getByRole("img", { name: /page 1 of/ }).waitFor({ timeout: 90_000 });

const write = async (name: string, text: string) => {
  await page
    .getByRole("button", { name: new RegExp(`^(Write|Edit) ${name.replace(/[().]/g, "\\$&")}$`) })
    .click();
  await expect(page.getByRole("textbox", { name: `Text of ${name}` })).toBeFocused();
  await page.keyboard.type(text);
};
await write("Q.1(1)", "Which example drug is a beta blocker? ");
await page.keyboard.type("/choi");
await page.getByRole("option", { name: "Choices (A–D)" }).click();
for (const [i, o] of ["Examplolol", "Samplopine", "Demoxamol", "Testarine"].entries()) {
  if (i > 0) await page.keyboard.press("ArrowDown");
  await page.keyboard.type(o);
}
await page
  .getByRole("listitem", { name: "Q.1(1)", exact: true })
  .getByLabel("A is the correct answer")
  .check();
await write("Q.2(1)", "Simplify ");
await page.getByRole("button", { name: "Insert" }).click();
await page.getByRole("menuitem", { name: "Equation", exact: true }).click();
const field = page.locator('math-field[aria-label="Equation"]');
await expect(field).toBeFocused();
await page.keyboard.type("x^2");
await page.keyboard.press("ArrowRight");
await page.keyboard.type("+2x+1");
// Enter only once MathLive holds every typed key (see make-upgrade-fixture.ts).
await expect.poll(() => field.evaluate((el) => (el as HTMLInputElement).value)).toBe("x^2+2x+1");
await page.keyboard.press("Enter");
await expect(field).toBeHidden();
await page.keyboard.type(" and explain each step.");
await page
  .getByRole("status")
  .filter({ hasText: "All changes saved" })
  .waitFor({ timeout: 15_000 });
await page.waitForTimeout(4_000);
await page.getByRole("img", { name: /page 1 of/ }).waitFor({ timeout: 90_000 });
await page.getByRole("listitem", { name: "Q.1(1)", exact: true }).scrollIntoViewIfNeeded();
await page.mouse.move(500, 400);
await page.mouse.wheel(0, -200);
await shot(page, "05-editor");

const q = page.getByRole("listitem", { name: "Q.2(1)", exact: true });
await q.getByRole("button", { name: /^Answer key/ }).click();
await q.getByRole("textbox", { name: "Model answer for Q.2(1)" }).click();
await page.keyboard.type("Recognise the perfect square: (x+1) squared.");
await q.getByRole("button", { name: "Add a row" }).click();
await q.getByLabel("What earns marks, row 1").fill("Correct working");
await q.getByLabel("Marks for row 1").fill("2");
await page
  .getByRole("status")
  .filter({ hasText: "All changes saved" })
  .waitFor({ timeout: 15_000 });
await page.getByRole("button", { name: "Answer key", exact: true, pressed: false }).click();
await page.getByRole("img", { name: /Answer key of .* page 1 of/ }).waitFor({ timeout: 90_000 });
await q.scrollIntoViewIfNeeded();
await shot(page, "06-answer-key");
await page.getByRole("button", { name: "Paper", exact: true, pressed: false }).click();

// Phase 10: sub-parts with their own marks and tags, Bloom printed, the summary.
await write("Q.3(1)", "Answer the following about an example drug. /sub");
await page.getByRole("option", { name: "Sub-parts (a)(b)(c)" }).click();
await page.keyboard.type("Describe how the example drug works.");
await page.keyboard.press("ArrowDown");
await page.keyboard.type("Evaluate its use in an example patient.");
const long = page.getByRole("listitem", { name: "Q.3(1)", exact: true });
await long.getByLabel("CO tag for Q.3(1)", { exact: true }).fill("BP604T.02");
await long.getByLabel("Bloom level for Q.3(1)", { exact: true }).selectOption({ label: "Apply" });
for (const [part, marks, level] of [
  ["a", "6", "Understand"],
  ["b", "4", "Evaluate"],
] as const) {
  await page
    .getByRole("button", {
      name: new RegExp(`^Marks, CO and Bloom for Q\\.3\\(1\\) \\(${part}\\)`),
    })
    .click();
  const pop = page.getByRole("dialog", { name: `Marks, CO and Bloom for Q.3(1) (${part})` });
  await pop.getByLabel(`Marks for Q.3(1) (${part})`).fill(marks);
  await pop.getByLabel(`Bloom level for Q.3(1) (${part})`).selectOption({ label: level });
  await pop.getByRole("button", { name: "Done" }).click();
}
await page
  .getByRole("status")
  .filter({ hasText: "All changes saved" })
  .waitFor({ timeout: 15_000 });
await page.getByRole("button", { name: "Details" }).click();
const details = page.getByRole("dialog", { name: "Paper details" });
await details.getByRole("checkbox", { name: /Print Bloom levels/ }).check();
await details.getByRole("button", { name: "Save details" }).click();
await details.waitFor({ state: "hidden" });
await page.getByText("Bloom and CO summary").click();
await page.getByRole("button", { name: "Edit Q.3(1)" }).click();
await page.waitForTimeout(4_000);
await page.getByRole("img", { name: /page 1 of/ }).waitFor({ timeout: 90_000 });
await long.scrollIntoViewIfNeeded();
await shot(page, "13-bloom");

await page.getByRole("button", { name: "Export" }).click();
const ask = page.getByRole("dialog", { name: "Export with these gaps?" });
await ask.getByText(/empty questions are left out/).waitFor({ timeout: 60_000 });
await shot(page, "07-export");
await ask.getByRole("button", { name: "Cancel" }).click();

// Final, then its versions (D56, D57).
await page.getByRole("button", { name: "Mark as Final" }).click();
await page.getByRole("note").filter({ hasText: "This paper is Final." }).waitFor();
await page.getByRole("button", { name: /^Versions/ }).click();
await page
  .getByRole("dialog", { name: "Versions" })
  .getByText("Marked Final", { exact: true })
  .waitFor();
await shot(page, "12-versions");
await page.keyboard.press("Escape");

// An ATKT copy, so the Papers page has more than one paper (D59, D60).
await page.getByRole("button", { name: "Duplicate as…" }).click();
await page
  .getByRole("dialog", { name: "Duplicate as…" })
  .getByRole("button", { name: "Make the copy" })
  .click();
await page.getByRole("heading", { level: 1, name: /\(ATKT\)$/ }).waitFor();
await page.goto("/papers");
await page.getByRole("search", { name: "Find papers" }).waitFor();
await shot(page, "11-papers");

// The question bank (Phase 11): Add to bank from the ATKT copy, the Bank page,
// the picker in the paper editor and a CSV import preview.
await page
  .getByRole("link", { name: /\(ATKT\)/ })
  .first()
  .click();
await page.getByRole("img", { name: /page 1 of/ }).waitFor({ timeout: 90_000 });
await page.getByRole("button", { name: "Add to bank" }).click();
await page.getByRole("dialog", { name: /added to the bank|Nothing was added/ }).waitFor();
await shot(page, "14-add-to-bank");
await page.getByRole("button", { name: "OK" }).click();
await page.getByRole("button", { name: "Write Q.3(2)" }).click();
await page.getByRole("button", { name: "Use a bank question for Q.3(2)" }).click();
const picker = page.getByRole("dialog", { name: "Insert Q.3(2) from the question bank" });
await picker.getByLabel("Marks").fill("");
await picker.getByRole("button", { name: "Insert" }).first().waitFor();
await shot(page, "16-picker");
await page.keyboard.press("Escape");
await page.goto("/bank");
await page.getByRole("search", { name: "Find questions" }).waitFor();
await shot(page, "15-bank");
const csvFile = path.join(os.tmpdir(), "draftex-guide-import.csv");
fs.writeFileSync(
  csvFile,
  [
    "course code,unit,co,bloom,marks,type,question,answer,tags,choice a,choice b,choice c,choice d,correct",
    "BP604T,1,1,Remember,1,OBJECTIVE,Which of these is an invented drug class?,,example,First,Second,Third,Fourth,b",
    "BP604T,2,2,Understand,5,SHORT,Explain an invented process in your own words.,Points to cover.,example,,,,,",
    "BP604T,2,2,Recall,5,SHORT,Describe an invented assay.,,,,,,,",
    "MPH101T,,MPH101T.03,Evaluate,10,LONG,Evaluate an invented delivery system.,,,,,,,",
  ].join("\r\n"),
);
await page.goto("/bank/import");
const chooser = page.waitForEvent("filechooser");
await page.getByRole("button", { name: "Choose a CSV file" }).click();
await (await chooser).setFiles(csvFile);
await page.getByRole("status").filter({ hasText: "Read as" }).waitFor();
await shot(page, "17-import");
fs.rmSync(csvFile, { force: true });

await page.goto("/admin/backups");
await page.getByRole("button", { name: "Back up now" }).click();
await page.getByRole("status").filter({ hasText: "Backup saved." }).waitFor({ timeout: 60_000 });
await shot(page, "08-backups");

await page.goto("/admin/users");
await page.getByRole("heading", { level: 1 }).waitFor();
await shot(page, "09-people");

await page.goto("/admin/network");
await page.getByRole("heading", { level: 1 }).waitFor();
await shot(page, "10-network");

// Phase 12: Advanced LaTeX with the chemistry packages (needs the admin's permission).
await page.goto("/admin/users");
await page
  .getByRole("row")
  .filter({ hasText: ADMIN.email })
  .getByRole("button", { name: "Allow Advanced LaTeX" })
  .click();
await page.getByText("May use Advanced LaTeX").waitFor();
await page.goto(paperUrl);
// The export above marked the paper Printed (D55); put it back to Draft (D56).
await page.getByRole("button", { name: "Edit", exact: true }).click();
await page
  .getByRole("dialog", { name: /^Edit this (printed|final) paper\?$/ })
  .getByRole("button", { name: "Back to Draft and edit" })
  .click();
await write("Q.2(4)", "Name the compound and balance the reaction.");
await page.getByRole("button", { name: "Insert" }).click();
await page.getByRole("menuitem", { name: "Advanced LaTeX" }).click();
await page
  .getByLabel("Advanced LaTeX (checked before it reaches the paper)")
  .fill("\\chemfig{*6(=-=(-COOH)-=-)}\n\n\\ce{2H2 + O2 -> 2H2O}");
await page.getByText("Chemistry, colour and list commands").click();
await shot(page, "18-advanced-latex");
await page.getByRole("button", { name: "Done" }).click();

// Phase 13: a code block with its line numbers, the check under it and the preview.
await write("Q.2(5)", "What does this program print? Explain the ");
await page.keyboard.type("`range`");
await page.keyboard.type(" call.");
await page.getByRole("button", { name: "Insert" }).click();
await page.getByRole("menuitem", { name: "Code block" }).click();
for (const [i, line] of [
  "doses = [250, 500, 1000]",
  "for d in doses:",
  '\tprint(d / 1000, "g")',
].entries()) {
  if (i > 0) await page.keyboard.press("Enter");
  if (line.startsWith("\t")) await page.keyboard.press("Tab");
  await page.keyboard.type(line.replace(/^\t/, ""));
}
await page
  .getByRole("status")
  .filter({ hasText: "All changes saved" })
  .waitFor({ timeout: 15_000 });
await page.waitForTimeout(4_000);
await page
  .getByRole("img", { name: /page \d of/ })
  .first()
  .waitFor({ timeout: 90_000 });
await page.getByRole("listitem", { name: "Q.2(5)", exact: true }).scrollIntoViewIfNeeded();
await shot(page, "19-code-block");

// Phase 14: a table with a merged header, the Table bar and the Columns box.
await write("Q.2(6)", "Complete the table of doses.");
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
const tq = page.getByRole("listitem", { name: "Q.2(6)", exact: true });
const tbar = page.getByRole("toolbar", { name: "Table" });
await tq.locator("th").nth(1).click();
await tq
  .locator("th")
  .nth(2)
  .click({ modifiers: ["Shift"] });
await tbar.getByRole("button", { name: /^Merge the selected cells/ }).click();
await tbar.getByRole("radio", { name: "Grid" }).click();
await tbar.getByRole("button", { name: "Columns" }).click();
const colBox = page.getByRole("dialog", { name: "Columns" });
await colBox.getByRole("button", { name: "Set equal widths" }).click();
await colBox
  .getByRole("radiogroup", { name: "Column 2 alignment" })
  .getByRole("radio", { name: "Centre" })
  .click();
await page
  .getByRole("status")
  .filter({ hasText: "All changes saved" })
  .waitFor({ timeout: 15_000 });
await shot(page, "20-table");

// Phase 15: a CO blueprint for the example paper's course, then the check.
await page.goto("/blueprints/new");
await page.getByLabel("Course code").fill("BP604T");
await page.getByLabel("Exam group").selectOption({ label: "End-semester" });
await page.getByLabel("Allowed difference (±marks)").fill("2");
for (const [i, [co, target]] of (
  [
    ["BP604T.01", "20"],
    ["BP604T.02", "20"],
    ["BP604T.03", "20"],
  ] as const
).entries()) {
  if (i > 0) await page.getByRole("button", { name: "Add CO" }).click();
  await page.getByLabel(`CO ${i + 1}`, { exact: true }).fill(co);
  await page.getByLabel(`Target for CO ${i + 1} (marks)`).fill(target);
}
await shot(page, "21-blueprint");
await page.getByRole("button", { name: "Save blueprint" }).click();
await page.getByText("Blueprint saved.").waitFor();
await page.goto(paperUrl);
await page.getByText("Bloom and CO summary").click();
const check = page.getByRole("region", { name: "CO blueprint check" });
await check.scrollIntoViewIfNeeded();
await shot(page, "22-blueprint-check");

await browser.close();
