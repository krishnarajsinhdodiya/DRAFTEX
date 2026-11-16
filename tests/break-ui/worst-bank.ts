// Dev only (/break-ui, Phase 11): worst-case question bank data in a
// THROWAWAY copy, then screenshots of every bank screen at 1366, 900 and
// 375 px in the OS temp folder. Invented text only.
//   - a colleague whose name is 120 characters (the users limit) shares a
//     course, so "From <name>" badges and the read-only view get the long name;
//   - 260 questions imported by CSV (more than five pages): course codes at
//     the 29-character limit, 100-character titles (the CSV cap), questions of
//     4,000 characters and of one word, ten 30-character tags, unbroken
//     chemical names, 99.5 marks, elective suffixes, every Bloom level;
//   - an import file with every kind of row problem for the preview table;
//   - a paper whose picker shows the long rows and an Add to bank report
//     with many skips; ten questions in Trash.
// 1. node scripts/e2e-server.ts 3212   (fresh folder)
// 2. node tests/break-ui/worst-bank.ts http://127.0.0.1:3212
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { type Page, chromium, expect } from "@playwright/test";

const base = process.argv[2] ?? "http://127.0.0.1:3212";
const out = fs.mkdtempSync(path.join(os.tmpdir(), "draftex-break-bank-"));
const ADMIN = { name: "Break Admin", email: "break@example.test", password: "break ui password" };
const LONG_NAME =
  "Aleksandra Wiśniewska-Kowalczyk Bartholomew Fitzgerald-Montgomery van der Westhuizen-Ramaswamy Iyer";
const COLLEAGUE = {
  name: (LONG_NAME + " Chakraborty-Venkataraman").slice(0, 120),
  email: "bartholomew.fitzgerald@northwind-industries-holdings.example.com",
  temp: "temporary break 1",
  own: "colleague break password",
};
const CODE = "ABCDEFGHIJKLMNOPQ LONGSUF8"; // 17 + space + 8 = 26, the course-code limit
const TITLE =
  "Pharmaceutical Analysis and Quality Assurance of Novel Drug Delivery Systems Including Nanocarriers".slice(
    0,
    100,
  );
const CHEM = "2-(4-isobutylphenyl)propanoic-acid-N,N-dimethylaminoethylesterhydrochloride";
const levels = ["Remember", "Understand", "Apply", "Analyse", "Evaluate", "Create"];
const tags = Array.from({ length: 10 }, (_, i) => `tag ${i} ${"x".repeat(30)}`.slice(0, 30));

function csv(rows: string[][]): string {
  const cell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return rows.map((r) => r.map(cell).join(",")).join("\r\n");
}
const HEADER = [
  "course code",
  "unit",
  "co",
  "bloom",
  "marks",
  "type",
  "question",
  "answer",
  "tags",
  "course title",
];

async function shoot(page: Page, name: string, fullPage = true) {
  for (const width of [1366, 900, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(150);
    // Dialogs are fixed to the viewport, so they are shot without fullPage.
    await page.screenshot({ path: path.join(out, `${name}-${width}.png`), fullPage });
  }
  await page.setViewportSize({ width: 1366, height: 900 });
}

async function importFile(page: Page, name: string, content: string, save: boolean) {
  const file = path.join(out, name);
  fs.writeFileSync(file, content);
  await page.goto("/bank/import");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose a CSV file" }).click();
  await (await chooser).setFiles(file);
  await page.getByRole("status").filter({ hasText: "Read as" }).waitFor({ timeout: 60_000 });
  if (save) {
    await page.getByRole("button", { name: /^Save \d+ question/ }).click();
    await page.getByText(/were saved to your bank/).waitFor({ timeout: 60_000 });
  }
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ baseURL: base, viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();
await page.goto("/");
await page.getByLabel("Your name").fill(ADMIN.name);
await page.getByLabel("Email").fill(ADMIN.email);
await page.getByLabel("Password", { exact: true }).fill(ADMIN.password);
await page.getByLabel("Type the password again").fill(ADMIN.password);
await page.getByRole("button", { name: "Create administrator" }).click();
await page.getByRole("heading", { name: `Welcome, ${ADMIN.name}` }).waitFor();

// Empty states first.
await page.goto("/bank");
await shoot(page, "01-bank-empty");

// The colleague with the longest name shares a whole course.
await page.goto("/admin/users");
await page.getByLabel("Name", { exact: true }).fill(COLLEAGUE.name);
await page.getByRole("textbox", { name: "Email", exact: true }).fill(COLLEAGUE.email);
await page.getByLabel("Temporary password").fill(COLLEAGUE.temp);
await page.getByRole("button", { name: "Add person" }).click();
await page.getByRole("status").filter({ hasText: "can now sign in" }).waitFor();
const cctx = await browser.newContext({ baseURL: base, viewport: { width: 1366, height: 900 } });
const cpage = await cctx.newPage();
await cpage.goto("/login");
await cpage.getByLabel("Email").fill(COLLEAGUE.email);
await cpage.getByLabel("Password").fill(COLLEAGUE.temp);
await cpage.getByRole("button", { name: "Sign in" }).click();
await cpage.getByLabel("Current password").fill(COLLEAGUE.temp);
await cpage.getByLabel("New password", { exact: true }).fill(COLLEAGUE.own);
await cpage.getByLabel("Type the new password again").fill(COLLEAGUE.own);
await cpage.getByRole("button", { name: "Change password" }).click();
await cpage.getByRole("heading", { name: /^Welcome/ }).waitFor();
await importFile(
  cpage,
  "colleague.csv",
  csv([
    HEADER,
    ...Array.from({ length: 30 }, (_, i) => [
      CODE,
      String(1 + (i % 20)),
      String(1 + (i % 99)),
      levels[i % 6] as string,
      i % 2 ? "99.5" : "1",
      i % 3 ? "LONG" : "SHORT_NOTE",
      i % 5
        ? `Colleague question ${i}: ${CHEM} ${"explain the reasoning in detail ".repeat(20)}`
        : "Define.",
      "",
      tags.join(";"),
      TITLE,
    ]),
  ]),
  true,
);
await cpage.goto("/bank");
await cpage.getByRole("region", { name: "Share a whole course" }).getByRole("checkbox").check();
await cpage.waitForTimeout(500);
await cctx.close();

// The administrator's own 260 questions, mixed failures across the first rows.
const mine = Array.from({ length: 260 }, (_, i) => [
  i % 4 === 0 ? CODE : i % 4 === 1 ? "BP607T AEC1" : i % 4 === 2 ? "MPH101T" : "BP604T",
  i % 7 ? String(1 + (i % 5)) : "",
  i % 4 === 1 ? "BP607T.01 AEC1" : String(1 + (i % 9)),
  levels[i % 6] as string,
  ["1", "2", "5", "10", "99.5"][i % 5] as string,
  ["SHORT", "LONG", "SHORT_NOTE", "FREE"][i % 4] as string,
  i === 0
    ? "Q".concat(" Explain ".repeat(499)).slice(0, 4000)
    : i === 1
      ? "Why?"
      : i === 2
        ? CHEM.repeat(3)
        : `Invented question ${i} about ${CHEM.slice(0, 20 + (i % 40))} and its uses.`,
  i % 3 ? "" : "A model answer.",
  i % 2 ? tags.join(";") : "",
  i % 4 === 0 ? TITLE : "",
]);
await importFile(page, "mine.csv", csv([HEADER, ...mine]), true);
await page.goto("/bank");
await shoot(page, "02-bank-list");
await page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name: "Older" }).click();
await shoot(page, "03-bank-last-page");
await page.goto("/bank?q=nothing+matches+this");
await shoot(page, "04-bank-no-match");
await page.goto("/bank?scope=shared");
await page
  .getByRole("link", { name: /Colleague question 1/ })
  .first()
  .click();
await shoot(page, "05-shared-view");
await page.goto("/bank?q=Explain+Explain");
await page.getByRole("link").filter({ hasText: "Q Explain" }).first().click();
await shoot(page, "06-own-form-long");
await page.goto("/bank/new");
await shoot(page, "07-new-form");

// An import with every kind of row problem.
await importFile(
  page,
  "problems.csv",
  csv([
    HEADER,
    [CODE, "21", "CO 1", "Memorise", "0", "Essay", "", "", "", ""],
    ["BP604T", "1", "1", "Apply", "2", "SHORT", "Smile 😀 and bell \u0007", "", "", ""],
    ["BP604T", "1", "1", "Apply", "2", "SHORT", `x${"y".repeat(4000)}`, "", "", ""],
    mine[3] as string[],
    ["BP604T", "1", "1", "Apply", "2", "SHORT", `${CHEM} ${CHEM} ${CHEM}`, "", tags.join(";"), ""],
  ]),
  false,
);
await shoot(page, "08-import-preview");

// Picker and Add to bank report in a paper of the long course.
await page.goto("/templates");
await page
  .getByRole("link", { name: /Theory · End-Semester · 4 credits/ })
  .first()
  .click();
await page.getByRole("button", { name: "New paper" }).click();
const dialog = page.getByRole("dialog", { name: "New paper" });
await dialog.getByLabel("Title", { exact: true }).fill("W".repeat(200));
await dialog.getByLabel("Course code").fill(CODE);
await dialog.getByRole("button", { name: "Create paper" }).click();
await page.waitForURL(/\/papers\/[0-9a-f-]{36}$/);
for (let n = 1; n <= 7; n++) {
  await page.getByRole("button", { name: `Write Q.2(${n})` }).click();
  await expect(page.getByRole("textbox", { name: `Text of Q.2(${n})` })).toBeFocused();
  await page.keyboard.type(n === 1 ? `${CHEM} ${CHEM}` : `Short question ${n}`);
}
await page.getByRole("button", { name: "Add to bank" }).click();
await page.getByRole("dialog", { name: /added to the bank/ }).waitFor();
await shoot(page, "09-add-report", false);
await page.getByRole("button", { name: "OK" }).click();
await page.getByRole("button", { name: "Write Q.3(1)" }).click();
await page.getByRole("button", { name: "Use a bank question for Q.3(1)" }).click();
await page
  .getByRole("dialog", { name: /from the question bank/ })
  .getByLabel("Marks")
  .fill("");
await page.waitForTimeout(1000);
await shoot(page, "10-picker", false);

// Trash with ten questions.
for (let i = 0; i < 10; i++) {
  await page.goto(`/bank?course=${encodeURIComponent(CODE)}&scope=mine`);
  await page
    .getByRole("link", { name: /Invented question|Q Explain|ABCDEF/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await page.waitForURL(/\/bank$/);
}
await page.goto("/papers/trash");
await shoot(page, "11-trash");

await browser.close();
console.log(out);
