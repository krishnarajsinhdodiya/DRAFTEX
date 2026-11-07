// Dev only (/break-ui, Phase 12): the Advanced LaTeX box at its worst, in a
// THROWAWAY copy, with screenshots at 1366, 900 and 375 px in the OS temp
// folder. Invented text only.
//   - a 4 KB block of one unbroken line (the size cap) and one just over it;
//   - the longest refusal message (enumitem options) and a refusal on a
//     command name of 60 letters;
//   - a block using all eight packages, so the "Uses ..." line is longest;
//   - the command list open under each.
// 1. node scripts/e2e-server.ts 3212   (fresh folder)
// 2. node tests/break-ui/worst-advanced.ts http://127.0.0.1:3212
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, expect } from "@playwright/test";

const base = process.argv[2] ?? "http://127.0.0.1:3212";
const out = fs.mkdtempSync(path.join(os.tmpdir(), "draftex-break-advanced-"));
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

await page.goto("/admin/users");
await page
  .getByRole("row")
  .filter({ hasText: ADMIN.email })
  .getByRole("button", { name: "Allow Advanced LaTeX" })
  .click();
await page.getByText("May use Advanced LaTeX").waitFor();

await page.goto("/templates");
await page
  .getByRole("link", { name: /Theory · End-Semester · 4 credits/ })
  .first()
  .click();
await page.getByRole("button", { name: "New paper" }).click();
const dialog = page.getByRole("dialog", { name: "New paper" });
await dialog.getByLabel("Title", { exact: true }).fill("Break Advanced Paper");
await dialog.getByRole("button", { name: "Create paper" }).click();
await page.waitForURL(/\/papers\/[0-9a-f-]{36}$/);

await page.getByRole("button", { name: "Write Q.2(1)" }).click();
await expect(page.getByRole("textbox", { name: "Text of Q.2(1)" })).toBeFocused();
await page.getByRole("button", { name: "Insert" }).click();
await page.getByRole("menuitem", { name: "Advanced LaTeX" }).click();
const box = page.getByLabel("Advanced LaTeX (checked before it reaches the paper)");
await page.getByText("Chemistry, colour and list commands").click();

const cases: Array<[string, string]> = [
  ["cap", "x".repeat(4096)],
  ["over-cap", "x".repeat(4097)],
  [
    "enumitem",
    "\\begin{enumerate}[label=(\\alph*), nosep, before={\\large}, itemsep=2pt]\\item x\\end{enumerate}",
  ],
  ["long-name", `\\${"a".repeat(60)}`],
  [
    "all-packages",
    "\\ce{H2O} \\chemfig{A-B} $\\coloneqq$ \\multirow{2}{*}{a} \\begin{enumerate}[nosep]\\item x\\end{enumerate} \\textcolor{red}{x} \\begin{framed}x\\end{framed} \\rupee{}",
  ],
];
for (const width of [1366, 900, 375]) {
  await page.setViewportSize({ width, height: width === 375 ? 812 : 800 });
  for (const [name, text] of cases) {
    await box.fill(text);
    await page.waitForTimeout(200);
    const pop = page.locator(".dx-popover").filter({ has: box });
    await pop.scrollIntoViewIfNeeded();
    const b = await pop.boundingBox();
    const vw = page.viewportSize()?.width ?? width;
    const outside = b ? Math.max(0, b.x + b.width - vw, -b.x) : -1;
    const textOverflow = await pop.evaluate((el) => el.scrollWidth - el.clientWidth);
    const shot = path.join(out, `${width}-${name}.png`);
    await pop.screenshot({ path: shot });
    console.log(
      `${shot}  popover ${Math.round(b?.width ?? 0)}px, outside ${Math.round(outside)}px, inner overflow ${textOverflow}px`,
    );
  }
}
await browser.close();
