// Dev only (/break-ui, Phase 15): CO blueprints at their worst, in a
// THROWAWAY copy, with screenshots at 1366, 900 and 375 px in the OS temp
// folder. Invented text only.
//   - a 26-character course code (17-character base + 8-character suffix);
//   - 30 COs (the limit), each tag at its 29-character maximum;
//   - percent targets of 100 and 0 (one CO takes the whole paper);
//   - a paper of that course with two COs on every written question, one
//     untagged question and CO tags not in the blueprint;
//   - a long colleague name on a shared blueprint.
// Reports, per width: how far each page scrolls sideways, whether the
// blueprint form's rows and the editor's check table fit, and the export
// dialog's height.
// 1. node scripts/e2e-server.ts 3212   (fresh folder)
// 2. node tests/break-ui/worst-blueprint.ts http://127.0.0.1:3212
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { type Page, chromium, expect } from "@playwright/test";

const base = process.argv[2] ?? "http://127.0.0.1:3212";
const out = fs.mkdtempSync(path.join(os.tmpdir(), "draftex-break-blueprint-"));
const ADMIN = {
  // The longest name an account may have (120 characters).
  name: `Dr ${"Invented Colleague With A Very Long Name ".repeat(3)}`.slice(0, 120).trim(),
  email: "break@example.test",
  password: "break ui password",
};
const CODE = "XXXXXXXXXXXXXXXXX AEC12345";
const tag = (n: number) => `XXXXXXXXXXXXXXXXX.${String(n).padStart(2, "0")} AEC12345`;

const browser = await chromium.launch();
const context = await browser.newContext({ baseURL: base, viewport: { width: 1366, height: 800 } });
const page = await context.newPage();

await page.goto("/");
await page.getByLabel("Your name").fill(ADMIN.name);
await page.getByLabel("Email").fill(ADMIN.email);
await page.getByLabel("Password", { exact: true }).fill(ADMIN.password);
await page.getByLabel("Type the password again").fill(ADMIN.password);
await page.getByRole("button", { name: "Create administrator" }).click();
await page.getByRole("heading", { name: /^Welcome,/ }).waitFor();

// Blueprint: 30 COs, percent, CO 1 = 100 %, the rest 0 %.
await page.goto("/blueprints/new");
await page.getByLabel("Course code").fill(CODE);
await page.getByLabel("Exam group").selectOption({ label: "End-semester" });
await page.getByLabel("Percent of the paper").check();
await page.getByLabel("Allowed difference (±%)").fill("0");
for (let i = 1; i <= 30; i++) {
  if (i > 1) await page.getByRole("button", { name: "Add CO" }).click();
  await page.getByLabel(`CO ${i}`, { exact: true }).fill(tag(i));
  await page.getByLabel(`Target for CO ${i} (%)`).fill(i === 1 ? "100" : "0");
}
console.log(
  `at 30 COs, Add CO disabled: ${await page.getByRole("button", { name: "Add CO" }).isDisabled()}`,
);
await page.getByRole("button", { name: "Save blueprint" }).click();
await page.getByText("Blueprint saved.").waitFor();
const blueprintUrl = page.url().replace(/\?.*$/, "");
await page.getByLabel(/Share with colleagues/).check();

// Paper: two COs on every written question, one untagged.
await page.goto("/templates");
await page
  .getByRole("link", { name: /Theory · End-Semester · 4 credits/ })
  .first()
  .click();
await page.getByRole("button", { name: "New paper" }).click();
const dialog = page.getByRole("dialog", { name: "New paper" });
await dialog.getByLabel("Title", { exact: true }).fill("Break Blueprint Paper");
await dialog.getByLabel("Course code").fill(CODE);
await dialog.getByRole("button", { name: "Create paper" }).click();
await page.waitForURL(/\/papers\/[0-9a-f-]{36}$/);
const paperUrl = page.url();

async function write(name: string, text: string, cos: [string, string] | null) {
  await page.getByRole("button", { name: `Write ${name}` }).click();
  await expect(page.getByRole("textbox", { name: `Text of ${name}` })).toBeFocused();
  await page.keyboard.type(text);
  if (!cos) return;
  const q = page.getByRole("listitem", { name, exact: true });
  await q.getByLabel(`CO tag for ${name}`, { exact: true }).fill(cos[0]);
  await q.getByLabel(`Second CO tag for ${name} (optional)`, { exact: true }).fill(cos[1]);
}
await write("Q.2(1)", "Define an invented term.", [tag(1), tag(2)]);
await write("Q.2(2)", "State an invented rule.", [tag(29), tag(30)]);
await write("Q.2(3)", "Name an invented thing.", null);
await write("Q.3(1)", "Explain an invented process.", ["YYYYYYYYYYYYYYYYY.01 SEC12345", tag(3)]);
await expect(page.getByRole("status").filter({ hasText: "All changes saved" })).toBeVisible({
  timeout: 15_000,
});

async function overflow(p: Page) {
  return p.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

for (const width of [1366, 900, 375]) {
  await page.setViewportSize({ width, height: width === 375 ? 812 : 800 });

  await page.goto("/blueprints");
  await page.screenshot({ path: path.join(out, `${width}-list.png`), fullPage: true });
  const list = await overflow(page);

  await page.goto(blueprintUrl);
  await page.screenshot({ path: path.join(out, `${width}-form.png`), fullPage: true });
  const form = await overflow(page);
  const rowsFit = await page.evaluate(() =>
    [...document.querySelectorAll("form li")].every(
      (li) => li.getBoundingClientRect().right <= document.documentElement.clientWidth + 0.5,
    ),
  );

  await page.goto(paperUrl);
  await page.getByText("Bloom and CO summary").click();
  const table = page.getByRole("table", { name: "Paper against the CO blueprint" });
  await table.scrollIntoViewIfNeeded();
  await table.screenshot({ path: path.join(out, `${width}-check.png`) });
  const editor = await overflow(page);
  const tableRight = await table.evaluate((t) => t.getBoundingClientRect().right);
  const panelRight = await table.evaluate(
    (t) => (t.closest("details") as HTMLElement).getBoundingClientRect().right,
  );

  await page.getByRole("button", { name: "Export" }).click();
  const ask = page.getByRole("dialog", { name: "Export with these gaps?" });
  await ask.waitFor({ timeout: 60_000 });
  await page.screenshot({ path: path.join(out, `${width}-export.png`) });
  const box = await ask.boundingBox();
  const closeVisible = await ask.getByRole("button", { name: "Cancel" }).isVisible();
  await ask.getByRole("button", { name: "Cancel" }).click();

  console.log(
    JSON.stringify({
      width,
      sidewaysScroll: { list, form, editor },
      formRowsFit: rowsFit,
      checkTablePastPanel: Math.round(tableRight - panelRight),
      exportDialogHeight: Math.round(box?.height ?? 0),
      exportCancelVisible: closeVisible,
    }),
  );
}
console.log(`screenshots: ${out}`);
await browser.close();
