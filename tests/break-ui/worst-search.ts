// Dev only (/break-ui, Phase 16): worst-case data for search, pages and
// near-duplicates in a THROWAWAY copy, then screenshots at 1366, 900 and
// 375 px in the OS temp folder. Invented text only.
//   - 160 questions in one 26-character course, written from five templates,
//     so every question has near-duplicates and the duplicates page is full;
//   - summaries of 120 characters with an unbroken 75-letter chemical name;
//   - searches: 100 characters, eight words, quotes and FTS words, emoji,
//     non-Latin text, % and _;
//   - Older/Newer links at every width; a question page with five alike ones;
//   - an import preview where every row has a near-duplicate warning;
//   - 60 papers so the papers list pages too.
// 1. node scripts/e2e-server.ts 3212   (fresh folder)
// 2. node tests/break-ui/worst-search.ts http://127.0.0.1:3212
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { type Page, chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://127.0.0.1:3212";
const out = fs.mkdtempSync(path.join(os.tmpdir(), "draftex-break-search-"));
const ADMIN = { name: "Break Admin", email: "break@example.test", password: "break ui password" };
const CODE = "ABCDEFGHIJKLMNOPQ LONGSUF8";
const CHEM = "2-(4-isobutylphenyl)propanoic-acid-N,N-dimethylaminoethylesterhydrochloride";
const TEMPLATES = [
  (i: number) =>
    `Explain the mechanism of action of ${CHEM} variant ${i} with a neat labelled diagram.`,
  (i: number) =>
    `Write a note on the stability testing of tablets batch ${i} as per ICH guidelines.`,
  (i: number) =>
    `Describe the evaluation tests for capsules lot ${i}: weight variation and dissolution.`,
  (i: number) =>
    `Classify diuretics group ${i} and describe the mechanism of action of loop diuretics.`,
  (i: number) =>
    `Discuss the synthesis of paracetamol route ${i} from phenol with reaction conditions.`,
];

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
];
const row = (text: string) => [CODE, "1", "1", "Apply", "5", "SHORT", text, "", ""];

async function shoot(page: Page, name: string) {
  for (const width of [1366, 900, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(out, `${name}-${width}.png`), fullPage: true });
    const wide = await page.evaluate(() => document.documentElement.scrollWidth);
    if (wide > width) console.log(`${name} at ${width}px scrolls sideways: ${wide}px`);
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

await page.goto("/bank/duplicates");
await shoot(page, "01-duplicates-empty");

await importFile(
  page,
  "templated.csv",
  csv([HEADER, ...Array.from({ length: 160 }, (_, i) => row(TEMPLATES[i % 5]!(i)))]),
  true,
);
await page.goto("/bank");
await shoot(page, "02-bank-first-page");
await page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name: "Older" }).click();
await shoot(page, "03-bank-middle-page");

for (const [n, q] of [
  ["04-search-100", "x".repeat(40) + " " + "y".repeat(59)],
  ["05-search-8-words", "explain mechanism action variant neat labelled diagram isobutylphenyl"],
  ["06-search-syntax", '"NEAR( OR title:x * -z AND'],
  ["07-search-emoji", "😀😀😀 औषध ΔG"],
  ["08-search-wildcards", "% _ 100%_sure"],
] as const) {
  await page.goto(`/bank?q=${encodeURIComponent(q)}`);
  await shoot(page, n);
}

await page.goto("/bank/duplicates");
await shoot(page, "09-duplicates-full");
await page.getByRole("list", { name: "Possible duplicates" }).getByRole("link").first().click();
await shoot(page, "10-question-with-alike");

await importFile(
  page,
  "alike.csv",
  csv([HEADER, ...Array.from({ length: 12 }, (_, i) => row(TEMPLATES[i % 5]!(1000 + i)))]),
  false,
);
await shoot(page, "11-import-alike-warnings");

// 60 papers so the papers list has an Older link.
for (let i = 0; i < 60; i++) {
  await page.goto("/templates");
  await page
    .getByRole("link", { name: /Theory · End-Semester · 4 credits/ })
    .first()
    .click();
  await page.getByRole("button", { name: "New paper" }).click();
  const dialog = page.getByRole("dialog", { name: "New paper" });
  await dialog
    .getByLabel("Title", { exact: true })
    .fill(`Break paper ${i} ${"long title ".repeat(8)}`);
  const course = dialog.getByLabel("Course", { exact: true });
  const value = await course.locator("option", { hasText: "BP604T ·" }).getAttribute("value");
  await course.selectOption(value ?? "");
  await dialog.getByRole("button", { name: "Create paper" }).click();
  await page.waitForURL(/\/papers\/[0-9a-f-]{36}/);
}
await page.goto("/papers");
await shoot(page, "12-papers-first-page");
await page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name: "Older" }).click();
await shoot(page, "13-papers-last-page");

await browser.close();
console.log(`Screenshots in ${out}`);
