// Dev only (/break-ui, Phase 10): worst-case Bloom and CO data in a
// THROWAWAY copy: a course outside the catalogue (free-text CO tags at the
// 29-character limit), a question with ten sub-parts that all differ, and
// ten more questions with distinct tags so the summary is long. Screenshots
// at 1366, 900 and 375 px go to the OS temp folder. Invented text only.
// 1. node scripts/e2e-server.ts 3212   (fresh folder; run the guide
//    screenshots first so its administrator exists)
// 2. node tests/break-ui/worst-tags.ts http://127.0.0.1:3212
import os from "node:os";
import path from "node:path";
import { chromium, expect } from "@playwright/test";

const base = process.argv[2] ?? "http://127.0.0.1:3212";
const LONG = "ABCDEFGHIJKLMNOPQRS.01 SUFFIX99";
const levels = ["Remember", "Understand", "Apply", "Analyse", "Evaluate", "Create"];

const browser = await chromium.launch();
const context = await browser.newContext({ baseURL: base, viewport: { width: 1366, height: 800 } });
const page = await context.newPage();
await page.goto("/login");
await page.getByLabel("Email").fill("admin@example.test");
await page.getByLabel("Password").fill("example guide password");
await page.getByRole("button", { name: "Sign in" }).click();
await page.getByRole("heading", { name: /^Welcome/ }).waitFor();

await page.goto("/templates");
await page
  .getByRole("link", { name: /Theory · End-Semester · 4 credits/ })
  .first()
  .click();
await page.getByRole("button", { name: "New paper" }).click();
const dialog = page.getByRole("dialog", { name: "New paper" });
await dialog.getByLabel("Title", { exact: true }).fill("W".repeat(200));
await dialog.getByLabel("Course code").fill("ZZ999T LONGSUFFIX");
await dialog.getByLabel("Course title").fill("Worst Case Course");
await dialog.getByRole("button", { name: "Create paper" }).click();
await page.waitForURL(/\/papers\/[0-9a-f-]{36}$/);

await page.getByRole("button", { name: "Write Q.3(1)" }).click();
await expect(page.getByRole("textbox", { name: "Text of Q.3(1)" })).toBeFocused();
await page.keyboard.type("Stem. /sub");
await page.getByRole("option", { name: "Sub-parts (a)(b)(c)" }).click();
await page.keyboard.type("Part a with a fairly long text that wraps across the column.");
await page.keyboard.press("ArrowDown");
await page.keyboard.type("Part b.");
const q = page.getByRole("listitem", { name: "Q.3(1)", exact: true });
await q.getByLabel("CO tag for Q.3(1)", { exact: true }).fill(LONG.slice(0, 29));
for (const [i, part] of ["a", "b"].entries()) {
  await page
    .getByRole("button", { name: new RegExp(`^Marks, CO and Bloom for Q\\.3\\(1\\) \\(${part}\\)`) })
    .click();
  const pop = page.getByRole("dialog", { name: `Marks, CO and Bloom for Q.3(1) (${part})` });
  await pop.getByLabel(`Marks for Q.3(1) (${part})`).fill("99.5");
  await pop.getByLabel(`CO tag for Q.3(1) (${part})`).fill(`X${i}${LONG}`.slice(0, 29));
  await pop.getByLabel(`Bloom level for Q.3(1) (${part})`).selectOption({ label: levels[i] });
  await pop.getByRole("button", { name: "Done" }).click();
}
for (let n = 1; n <= 7; n++) {
  await page.getByRole("button", { name: `Write Q.2(${n})` }).click();
  await expect(page.getByRole("textbox", { name: `Text of Q.2(${n})` })).toBeFocused();
  await page.keyboard.type(`Q ${n}`);
  const s = page.getByRole("listitem", { name: `Q.2(${n})`, exact: true });
  await s.getByLabel(`CO tag for Q.2(${n})`, { exact: true }).fill(`TAG${n}${LONG}`.slice(0, 20));
  await s
    .getByLabel(`Bloom level for Q.2(${n})`, { exact: true })
    .selectOption({ label: levels[n % 6] });
}
await page.getByRole("status").filter({ hasText: "All changes saved" }).waitFor({ timeout: 15_000 });
await page.getByText("Bloom and CO summary").click();

const out = os.tmpdir();
for (const width of [1366, 900, 375]) {
  await page.setViewportSize({ width, height: 900 });
  await page.getByText("Bloom and CO summary").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(out, `dx-tags-summary-${width}.png`) });
  await q.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(out, `dx-tags-q-${width}.png`) });
  console.log(width);
}
await browser.close();
