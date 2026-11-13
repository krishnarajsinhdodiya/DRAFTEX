// Dev only (/break-ui, Phase 13): code blocks and View LaTeX at their worst,
// in a THROWAWAY copy, with screenshots at 1366, 900 and 375 px in the OS temp
// folder. Invented text only.
//   - 40 lines, each exactly as long as the paper allows (the tallest, widest
//     block that still prints);
//   - one line of 1,000 characters (the stored cap) and a 41st line;
//   - every unprintable kind at once (the longest refusal message);
//   - a code block inside a sub-part;
//   - View LaTeX of the whole paper (the longest text) and of one question.
// Reports, per width: how far the page scrolls sideways, how far each block
// reaches past its question card, and the dialog's size.
// 1. node scripts/e2e-server.ts 3212   (fresh folder)
// 2. node tests/break-ui/worst-code.ts http://127.0.0.1:3212
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { type Page, chromium, expect } from "@playwright/test";

const base = process.argv[2] ?? "http://127.0.0.1:3212";
const out = fs.mkdtempSync(path.join(os.tmpdir(), "draftex-break-code-"));
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
await dialog.getByLabel("Title", { exact: true }).fill("Break Code Paper");
await dialog.getByRole("button", { name: "Create paper" }).click();
await page.waitForURL(/\/papers\/[0-9a-f-]{36}$/);

async function codeIn(name: string, lines: string[], lead = "") {
  await page.getByRole("button", { name: `Write ${name}` }).click();
  await expect(page.getByRole("textbox", { name: `Text of ${name}` })).toBeFocused();
  if (lead) await page.keyboard.type(lead);
  await page.getByRole("button", { name: "Insert" }).click();
  await page.getByRole("menuitem", { name: "Code block" }).click();
  for (const [i, l] of lines.entries()) {
    if (i > 0) await page.keyboard.press("Enter");
    await page.keyboard.insertText(l);
  }
}

const limit = 73; // 4-credit end-sem built-in: 12 pt, 6.2 in, 11.7 pt body (question level)
await codeIn(
  "Q.2(1)",
  Array.from(
    { length: 40 },
    (_, i) => `${String(i + 1).padStart(2, "0")} ${"x".repeat(limit - 3)}`,
  ),
);
await codeIn("Q.2(2)", ["x".repeat(1000), ...Array.from({ length: 40 }, () => "y")]);
await codeIn("Q.2(3)", ["cost = ₹5 😀 é ü ç ñ ß ø å ğ ı ł ő ş ž → ≤ ≥ α β γ ∞ × ÷ ° µ ± ½ ™ © ®"]);
// A code block in a sub-part.
await page.getByRole("button", { name: "Write Q.3(1)" }).click();
await page.keyboard.type("Answer both. ");
await page.getByRole("button", { name: "Insert" }).click();
await page.getByRole("menuitem", { name: "Sub-parts (a)(b)(c)" }).click();
await page.getByRole("button", { name: "Insert" }).click();
await page.getByRole("menuitem", { name: "Code block" }).click();
await page.keyboard.insertText(`print("${"z".repeat(70)}")`);
await page
  .getByRole("status")
  .filter({ hasText: "All changes saved" })
  .waitFor({ timeout: 20_000 });

async function report(p: Page, width: number, what: string) {
  const r = await p.evaluate(() => {
    const doc = document.scrollingElement as HTMLElement;
    const blocks = [...document.querySelectorAll<HTMLElement>("pre.dx-codeblock")].map((pre) => {
      const card = pre.closest("li[id^='q-']") as HTMLElement | null;
      const b = pre.parentElement?.parentElement?.getBoundingClientRect();
      const c = card?.getBoundingClientRect();
      return b && c ? Math.round(Math.max(0, b.right - c.right, c.left - b.left)) : -1;
    });
    const statuses = [...document.querySelectorAll<HTMLElement>("pre.dx-codeblock")].map((pre) => {
      const s = pre.closest("[data-node-view-wrapper]")?.querySelector("[role=status]");
      return s ? Math.round(s.getBoundingClientRect().width) : -1;
    });
    // What makes the page wider than the screen (the admin navigation is a known one).
    const wide = [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((el) => el.getBoundingClientRect().right > doc.clientWidth + 1)
      .filter(
        (el) =>
          !el.parentElement ||
          el.parentElement.getBoundingClientRect().right <= doc.clientWidth + 1,
      )
      .slice(0, 4)
      .map(
        (el) =>
          `${el.tagName.toLowerCase()}${el.getAttribute("aria-label") ? `[${el.getAttribute("aria-label")}]` : ""}.${[...el.classList].slice(0, 2).join(".")}`,
      );
    return { pageOverflow: doc.scrollWidth - doc.clientWidth, blocks, statuses, wide };
  });
  console.log(
    `${width}px ${what}: page sideways ${r.pageOverflow}px; blocks past card ${r.blocks.join(",")}; status widths ${r.statuses.join(",")}; wider than the screen: ${r.wide.join(" ")}`,
  );
}

for (const width of [1366, 900, 375]) {
  await page.setViewportSize({ width, height: width === 375 ? 812 : 800 });
  for (const name of ["Q.2(1)", "Q.2(2)", "Q.2(3)", "Q.3(1)"]) {
    const card = page.getByRole("listitem", { name, exact: true });
    await card.scrollIntoViewIfNeeded();
    await card.screenshot({ path: path.join(out, `${width}-${name.replace(/[().]/g, "")}.png`) });
  }
  await report(page, width, "editor");

  await latexDialog(width, "Some questions need fixing first.", "latex-refused");
}

// Without the refused blocks (the sub-part line is too long on purpose), the
// whole paper's LaTeX: the longest text the dialog shows.
for (const name of ["Q.2(2)", "Q.2(3)", "Q.3(1)"]) {
  await page
    .getByRole("listitem", { name, exact: true })
    .getByRole("button", { name: `Clear ${name}` })
    .click();
}
await page
  .getByRole("status")
  .filter({ hasText: "All changes saved" })
  .waitFor({ timeout: 20_000 });
for (const width of [1366, 900, 375]) {
  await page.setViewportSize({ width, height: width === 375 ? 812 : 800 });
  await latexDialog(width, "\\begin{document}", "latex-paper");
}

async function latexDialog(width: number, waitFor: string, file: string) {
  await page.getByRole("button", { name: "LaTeX", exact: true }).click();
  const d = page.getByRole("dialog", { name: "LaTeX of the paper" });
  await d.getByText(waitFor, { exact: false }).first().waitFor();
  const box = await d.boundingBox();
  const vw = page.viewportSize()?.width ?? width;
  const inner = await d.evaluate((el) => el.scrollWidth - el.clientWidth);
  await d.screenshot({ path: path.join(out, `${width}-${file}.png`) });
  console.log(
    `${width}px ${file}: dialog ${Math.round(box?.width ?? 0)}x${Math.round(box?.height ?? 0)}, outside ${Math.round(Math.max(0, (box?.x ?? 0) + (box?.width ?? 0) - vw, -(box?.x ?? 0)))}px, inner overflow ${inner}px`,
  );
  await d.getByRole("button", { name: "Close" }).click();
}
console.log(`screenshots: ${out}`);
await browser.close();
