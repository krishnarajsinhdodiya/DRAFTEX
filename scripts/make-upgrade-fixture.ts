// Makes tests/fixtures/upgrade/: a backup taken by an older DRAFTEX with
// invented data, and that version's export of the same paper, so tests can
// restore it into the current version and check nothing changed (roadmap
// rule "migrations tested from the previous version").
// Run against a fresh throwaway copy of the OLD version, e.g. a worktree at
// the previous tag:
// 1. (in the old worktree) node scripts/e2e-server.ts 3219
// 2. (here) node scripts/make-upgrade-fixture.ts http://127.0.0.1:3219 /tmp/draftex-e2e-3219 v0.8.0
// The tag picks the old screens' steps: v0.8.0, or v0.10.0 (Mark as Final, Bloom shown),
// or v0.11.0 (as v0.10.0, CO typed as text, plus an Advanced LaTeX block).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Page, chromium, expect } from "@playwright/test";
import { unzipSync } from "fflate";

const [base = "", dataDir = "", tag = ""] = process.argv.slice(2);
if (!base || !dataDir || !tag) {
  console.error("Usage: node scripts/make-upgrade-fixture.ts <url> <data folder> <tag>");
  process.exit(2);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "tests", "fixtures", "upgrade");
// Invented account; the password is written in tests/fixtures/upgrade/README.md.
const ADMIN = { name: "Upgrade Admin", email: "upgrade@example.test", password: "upgrade fixture" };
const PAPER = "Upgrade Example Paper";
const TEMPLATE = "Upgrade Example Template";

const browser = await chromium.launch();
const context = await browser.newContext({ baseURL: base, acceptDownloads: true });
const page = await context.newPage();

await page.goto("/");
await page.getByLabel("Your name").fill(ADMIN.name);
await page.getByLabel("Email").fill(ADMIN.email);
await page.getByLabel("Password", { exact: true }).fill(ADMIN.password);
await page.getByLabel("Type the password again").fill(ADMIN.password);
await page.getByRole("button", { name: "Create administrator" }).click();
await page.getByRole("heading", { name: `Welcome, ${ADMIN.name}` }).waitFor();
const advanced = tag !== "v0.8.0" && tag !== "v0.10.0";

if (advanced) {
  // v0.11.0: a block of Advanced LaTeX written before Phase 12 must compile the same after it.
  await page.goto("/admin/users");
  await page
    .getByRole("row")
    .filter({ hasText: ADMIN.email })
    .getByRole("button", { name: "Allow Advanced LaTeX" })
    .click();
  await page.getByText("May use Advanced LaTeX").waitFor();
}

// A private template: a copy of a built-in with its own title and marks.
await page.goto("/templates");
await page
  .getByRole("link", { name: /Theory · Sessional · 4 credits/ })
  .first()
  .click();
await page.getByRole("button", { name: "Make a copy" }).click();
await page.waitForURL(/\/templates\/[0-9a-f-]{36}\/edit$/);
await page.getByRole("img", { name: /page 1 of/ }).waitFor({ timeout: 300_000 });
await page.getByLabel("Title").fill(TEMPLATE);
await page.getByRole("button", { name: "Save" }).click();
await page.getByRole("status").filter({ hasText: "Saved" }).waitFor();

// A paper with text, choices, an equation, a table and an answer key.
await page.goto("/templates");
await page
  .getByRole("link", { name: /Theory · End-Semester · 4 credits/ })
  .first()
  .click();
await page.getByRole("button", { name: "New paper" }).click();
const dialog = page.getByRole("dialog", { name: "New paper" });
await dialog.getByLabel("Title", { exact: true }).fill(PAPER);
const course = dialog.getByLabel("Course", { exact: true });
const option = await course.locator("option", { hasText: /^BP604T/ }).textContent();
await course.selectOption({ label: option ?? "" });
await dialog.getByLabel("Exam date").fill("2030-11-20");
await dialog.getByLabel("Academic year").fill("2030-31");
await dialog.getByRole("button", { name: "Create paper" }).click();
await page.waitForURL(/\/papers\/[0-9a-f-]{36}$/);
await page.getByRole("img", { name: /page 1 of/ }).waitFor({ timeout: 120_000 });

const open = async (p: Page, name: string) => {
  await p
    .getByRole("button", { name: new RegExp(`^(Write|Edit) ${name.replace(/[().]/g, "\\$&")}$`) })
    .click();
  await expect(p.getByRole("textbox", { name: `Text of ${name}` })).toBeFocused();
};
await open(page, "Q.1(1)");
await page.keyboard.type("Which invented drug is a beta blocker? ");
await page.keyboard.type("/choi");
await page.getByRole("option", { name: "Choices (A–D)" }).click();
for (const [i, o] of ["Inventolol", "Fictropine", "Madeupamol", "Placebine"].entries()) {
  if (i > 0) await page.keyboard.press("ArrowDown");
  await page.keyboard.type(o);
}
const q11 = page.getByRole("listitem", { name: "Q.1(1)", exact: true });
await q11.getByLabel("A is the correct answer").check();
if (advanced) await page.getByLabel("CO tag for Q.1(1)").fill("BP604T.01");
else await page.getByLabel("CO tag for Q.1(1)").selectOption({ index: 1 });
await page.getByLabel("Bloom level for Q.1(1)").selectOption("REMEMBER");

await open(page, "Q.2(1)");
await page.keyboard.type("Simplify ");
await page.getByRole("button", { name: "Insert" }).click();
await page.getByRole("menuitem", { name: "Equation", exact: true }).click();
const field = page.locator('math-field[aria-label="Equation"]');
await expect(field).toBeFocused();
await page.keyboard.type("x^2");
await page.keyboard.press("ArrowRight");
await page.keyboard.type("+2x+1");
await page.keyboard.press("Enter");
await expect(field).toBeHidden();
await page.keyboard.type(" and explain each step.");

await open(page, "Q.2(2)");
await page.keyboard.type("Complete the invented table.");
await page.getByRole("button", { name: "Insert" }).click();
await page.getByRole("menuitem", { name: "Table" }).click();
await page.keyboard.type("Drug");
await page.keyboard.press("Tab");
await page.keyboard.type("Dose");

await open(page, "Q.3(1)");
await page.keyboard.type("Describe the mechanism of action of an invented diuretic.");

if (advanced) {
  await open(page, "Q.3(2)");
  await page.keyboard.type("Explain the expression below.");
  await page.getByRole("button", { name: "Insert" }).click();
  await page.getByRole("menuitem", { name: "Advanced LaTeX" }).click();
  await page
    .getByLabel("Advanced LaTeX (checked before it reaches the paper)")
    .fill("\\begin{center}\\textbf{Invented} $\\frac{a}{b} + x^2$\\end{center}");
  await page.getByRole("button", { name: "Done" }).click();
}

const q21 = page.getByRole("listitem", { name: "Q.2(1)", exact: true });
await q21.getByRole("button", { name: /^Answer key/ }).click();
await q21.getByRole("textbox", { name: "Model answer for Q.2(1)" }).click();
await page.keyboard.type("Recognise the perfect square: (x+1) squared.");
await q21.getByRole("button", { name: "Add a row" }).click();
await q21.getByLabel("What earns marks, row 1").fill("Correct working");
await q21.getByLabel("Marks for row 1").fill("2");
await page
  .getByRole("status")
  .filter({ hasText: "All changes saved" })
  .waitFor({ timeout: 15_000 });

if (tag === "v0.8.0") {
  // Mark it Final through the old Details dialog (v0.8.0 had no lock).
  await page.getByRole("button", { name: "Details" }).click();
  const details = page.getByRole("dialog", { name: "Paper details" });
  await details.getByLabel("Status").selectOption("FINAL");
  await details.getByRole("button", { name: "Save details" }).click();
  await expect(details).toBeHidden();
} else {
  // v0.10.0 and later: print Bloom levels (D64), then "Mark as Final" (D56).
  await page.getByRole("button", { name: "Details" }).click();
  const details = page.getByRole("dialog", { name: "Paper details" });
  await details.getByLabel("Print Bloom levels").check();
  await details.getByRole("button", { name: "Save details" }).click();
  await expect(details).toBeHidden();
  await page.getByRole("button", { name: "Mark as Final" }).click();
  await page.getByRole("note").filter({ hasText: "This paper is Final." }).waitFor();
}

// That version's export of the paper: the reference for "compiles the same".
await page.reload();
await page.getByRole("img", { name: /page 1 of/ }).waitFor({ timeout: 120_000 });
await page.getByRole("button", { name: "Export" }).click();
const download = page.waitForEvent("download");
await page
  .getByRole("dialog", { name: "Export with these gaps?" })
  .getByRole("button", { name: "Export anyway" })
  .click();
const zip = unzipSync(fs.readFileSync(await (await download).path()));
const pdfOf = (name: string) => {
  const entry = Object.entries(zip).find(([n]) => n.endsWith(`/${name}`));
  if (!entry) throw new Error(`${name} missing from the export`);
  return entry[1];
};

// A backup, made the way an administrator does.
await page.goto("/admin/backups");
await page.getByRole("button", { name: "Back up now" }).click();
await page.getByRole("status").filter({ hasText: "Backup saved." }).waitFor({ timeout: 60_000 });
await browser.close();

const backups = path.join(dataDir, "backups");
const newest = fs
  .readdirSync(backups)
  .filter((n) => n.endsWith(".zip"))
  .map((n) => ({ n, t: fs.statSync(path.join(backups, n)).mtimeMs }))
  .sort((a, b) => b.t - a.t)[0];
if (!newest) throw new Error("No backup was written.");
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(path.join(backups, newest.n), path.join(out, `${tag}-backup.zip`));
fs.writeFileSync(path.join(out, `${tag}-paper.pdf`), pdfOf("paper.pdf"));
fs.writeFileSync(path.join(out, `${tag}-key.pdf`), pdfOf("key.pdf"));
console.log(`tests/fixtures/upgrade/${tag}-backup.zip, -paper.pdf, -key.pdf`);
