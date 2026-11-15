// Dev only (/break-ui, Phase 14): tables at their worst, in a THROWAWAY copy,
// with screenshots at 1366, 900 and 375 px in the OS temp folder. Invented
// text only.
//   - 10 columns × 30 rows (the D107 limit), every cell filled; the add-column
//     and add-row buttons must be off at the limit;
//   - a cell of 400 characters with a 60-letter word (no break point);
//   - a header merged over three columns and a cell merged over three rows;
//   - widths that do not add up (the longest live problem list);
//   - the Columns popover with ten rows of controls.
// Reports, per width: how far the page scrolls sideways, how far the table
// reaches past its question card, the table bar's height, and whether the
// Columns popover fits the screen.
// 1. node scripts/e2e-server.ts 3212   (fresh folder)
// 2. node tests/break-ui/worst-tables.ts http://127.0.0.1:3212
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, expect } from "@playwright/test";

const base = process.argv[2] ?? "http://127.0.0.1:3212";
const out = fs.mkdtempSync(path.join(os.tmpdir(), "draftex-break-tables-"));
const ADMIN = { name: "Break Admin", email: "break@example.test", password: "break ui password" };

const browser = await chromium.launch();
const context = await browser.newContext({ baseURL: base, viewport: { width: 1366, height: 800 } });
const page = await context.newPage();

await page.goto("/");
await page.getByLabel("Your name").fill(ADMIN.name);
await page.getByLabel("Email").fill(ADMIN.email);
await page.getByLabel("Password", { exact: true }).fill(ADMIN.password);
await page.getByLabel("Type the password again").fill(ADMIN.password);
await page.getByRole("button", { name: "Create administrator" }).click();
await page.getByRole("heading", { name: `Welcome, ${ADMIN.name}` }).waitFor();

await page.goto("/templates");
await page
  .getByRole("link", { name: /Theory · End-Semester · 4 credits/ })
  .first()
  .click();
await page.getByRole("button", { name: "New paper" }).click();
const dialog = page.getByRole("dialog", { name: "New paper" });
await dialog.getByLabel("Title", { exact: true }).fill("Break Tables Paper");
await dialog.getByRole("button", { name: "Create paper" }).click();
await page.waitForURL(/\/papers\/[0-9a-f-]{36}$/);

const NAME = "Q.3(1)";
const card = page.getByRole("listitem", { name: NAME, exact: true });
await page.getByRole("button", { name: `Write ${NAME}` }).click();
await expect(page.getByRole("textbox", { name: `Text of ${NAME}` })).toBeFocused();
await page.keyboard.type("Fill the largest table a paper may hold.");
await page.getByRole("button", { name: "Insert" }).click();
await page.getByRole("menuitem", { name: "Table" }).click();
const bar = page.getByRole("toolbar", { name: "Table" });
for (let i = 0; i < 7; i++)
  await bar.getByRole("button", { name: "Add a column on the right" }).click();
const addCol = bar.getByRole("button", { name: "Add a column on the right" });
console.log(`at 10 columns, add column disabled: ${await addCol.isDisabled()}`);

const LONG =
  `${"Hydroxypropylmethylcellulosephthalateacetatesuccinatepolymer"} ${"long cell text ".repeat(23)}`.slice(
    0,
    400,
  );
// Into the first cell, then Tab through 300 cells (Tab past the last row adds one).
await card.locator("th").first().click();
for (let i = 0; i < 300; i++) {
  if (i > 0) await page.keyboard.press("Tab");
  await page.keyboard.insertText(i === 15 ? LONG : `r${Math.floor(i / 10)}c${i % 10}`);
}
const addRow = bar.getByRole("button", { name: "Add a row below" });
console.log(`at 30 rows, add row disabled: ${await addRow.isDisabled()}`);

// Merge three header cells, and three cells of the first column.
await card.locator("th").nth(1).click();
await card
  .locator("th")
  .nth(3)
  .click({ modifiers: ["Shift"] });
await bar.getByRole("button", { name: /^Merge the selected cells/ }).click();
await card.locator("tr").nth(3).locator("td").first().click();
await card
  .locator("tr")
  .nth(5)
  .locator("td")
  .first()
  .click({ modifiers: ["Shift"] });
await bar.getByRole("button", { name: /^Merge the selected cells/ }).click();
await bar.getByRole("radio", { name: "Grid" }).click();

// Widths that do not add up, so the live problem shows.
await bar.getByRole("button", { name: "Columns" }).click();
const columns = page.getByRole("dialog", { name: "Columns" });
for (let i = 1; i <= 10; i++)
  await columns.getByLabel(`Column ${i} width`).fill(i === 1 ? "5" : "9");
await page
  .getByRole("status")
  .filter({ hasText: "All changes saved" })
  .waitFor({ timeout: 30_000 });

for (const width of [1366, 900, 375]) {
  await page.setViewportSize({ width, height: width === 375 ? 812 : 800 });
  if (!(await columns.isVisible())) await bar.getByRole("button", { name: "Columns" }).click();
  const pop = await columns.boundingBox();
  const vw = width;
  const vh = width === 375 ? 812 : 800;
  await page.screenshot({ path: path.join(out, `${width}-popover.png`) });
  await page.keyboard.press("Escape");
  await card.scrollIntoViewIfNeeded();
  await card.screenshot({ path: path.join(out, `${width}-table.png`) });
  const barBox = await bar.boundingBox();
  const r = await page.evaluate(() => {
    const doc = document.scrollingElement as HTMLElement;
    const table = document.querySelector<HTMLElement>(".dx-question table");
    const cardEl = table?.closest("li[id^='q-']") as HTMLElement | null;
    const t = table?.getBoundingClientRect();
    const c = cardEl?.getBoundingClientRect();
    const problems = [...document.querySelectorAll("[role=toolbar][aria-label=Table] ~ ul li")].map(
      (li) => li.textContent,
    );
    return {
      pageOverflow: doc.scrollWidth - doc.clientWidth,
      past: t && c ? Math.round(Math.max(0, t.right - c.right)) : -1,
      problems,
    };
  });
  console.log(
    `${width}px: page sideways ${r.pageOverflow}px; table past card ${r.past}px; table bar ${Math.round(barBox?.width ?? 0)}x${Math.round(barBox?.height ?? 0)}; popover ${Math.round(pop?.width ?? 0)}x${Math.round(pop?.height ?? 0)} at ${Math.round(pop?.x ?? 0)},${Math.round(pop?.y ?? 0)} (outside: ${pop ? Math.round(Math.max(0, pop.x + pop.width - vw, -pop.x, pop.y + pop.height - vh)) : "?"}px); problems: ${r.problems.join(" | ")}`,
  );
}
console.log(`screenshots: ${out}`);
await browser.close();
