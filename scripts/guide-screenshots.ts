// Takes the screenshots in docs/USER_GUIDE.md from a fresh throwaway copy of
// DRAFTEX, using invented accounts and questions only (never real papers).
// 1. node scripts/e2e-server.ts 3212        (fresh data folder, built app)
// 2. node scripts/guide-screenshots.ts http://127.0.0.1:3212
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

await browser.close();
