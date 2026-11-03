// Template library and builder end to end (SPEC §13 Phase 4), plus the
// route-level part of gate 8 for templates (D6): pages and the preview route
// answer "not found" for someone else's private template, whatever the ID.
// Runs after auth.spec.ts, which creates the accounts used here.
import { type Page, expect, test } from "@playwright/test";
import { ADMIN, FACULTY, signedIn } from "./support";

test.describe.configure({ mode: "serial" });

const COPY_TITLE = "Invented Pharmacology End-Sem";
let copyId = "";

const preview = (page: Page) => page.getByRole("img", { name: /page 1 of/ });

async function openTemplate(page: Page, title: string) {
  await page.goto("/templates");
  await page
    .getByRole("link", { name: new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) })
    .first()
    .click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
}

test("the library lists every built-in with its PCI status and filters", async ({ browser }) => {
  const page = await signedIn(browser, FACULTY, FACULTY.own);
  await page.goto("/templates");
  await expect(page.getByText("12 templates")).toBeVisible();
  const legacy = page.getByRole("link", { name: /KSV Legacy/ });
  await expect(legacy.getByText("Non-PCI")).toBeVisible();
  await expect(legacy.getByText("Built-in")).toBeVisible();
  await expect(
    page
      .getByRole("link", { name: /Theory · End-Semester · 4 credits/ })
      .getByText("PCI 2026", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Pharm\.D/ }).getByText("No rule set")).toBeVisible();

  await page.getByLabel("Search").fill("Pharm.D");
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page.getByText("1 template", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Clear" }).click();
  await expect(page).toHaveURL(/\/templates$/);
  await expect(page.getByLabel("Search")).toHaveValue("");
  await page.getByLabel("Exam").selectOption("SYNOPSIS");
  await expect(page).toHaveURL(/kind=SYNOPSIS/);
  await expect(page.getByText("1 template", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Mine" }).click();
  await expect(page.getByText("No templates match.")).toBeVisible();
});

test("a built-in shows its preview, cannot be edited, and is copied into the builder", async ({
  browser,
}) => {
  const page = await signedIn(browser, FACULTY, FACULTY.own);
  await openTemplate(page, "PCI 2026 · B.Pharm · Theory · End-Semester · 4 credits");
  await expect(preview(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("link", { name: "Edit" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
  const builtInUrl = page.url();
  expect((await page.goto(`${builtInUrl}/edit`))?.status()).toBe(404);

  await page.goto(builtInUrl);
  await page.getByRole("button", { name: "Make a copy" }).click();
  await expect(page).toHaveURL(/\/templates\/[0-9a-f-]{36}\/edit$/);
  copyId = /templates\/([0-9a-f-]{36})\/edit/.exec(page.url())?.[1] ?? "";
  await expect(page.getByText("Follows the PCI 2026 pattern.")).toBeVisible();
  await expect(preview(page)).toBeVisible({ timeout: 30_000 });

  await page.getByLabel("Title").fill(COPY_TITLE);
  await page.getByLabel("Paper out of (marks)").fill("75");
  await expect(page.getByText("The questions add up to 60.")).toBeVisible();
  await expect(page.getByText(/problem stops saving/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();
  await page.getByRole("button", { name: "Make the paper out of 60" }).click();

  await page.getByLabel("Marks each").nth(2).fill("7.5");
  await page.getByLabel("Paper out of (marks)").fill("55");
  await expect(page.getByText("Can be saved, but differs from PCI 2026:")).toBeVisible();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();

  // Undo brings back a removed group; leaving with unsaved changes asks first.
  await expect(page.getByLabel("Heading")).toHaveCount(3);
  await page.getByRole("button", { name: "Remove Q.3" }).click();
  await expect(page.getByLabel("Heading")).toHaveCount(2);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByLabel("Heading")).toHaveCount(3);
  await page.getByLabel("Description").fill("Not saved");
  page.once("dialog", (d) => void d.dismiss());
  await page.getByRole("link", { name: "← Back to the template" }).click();
  await expect(page).toHaveURL(/\/edit$/);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByLabel("Description")).toHaveValue(/^KSV university paper/);

  await page.reload();
  await expect(page.getByLabel("Title")).toHaveValue(COPY_TITLE);
  await page.getByRole("link", { name: "← Back to the template" }).click();
  await expect(page.getByText("Non-PCI")).toBeVisible();
  await expect(page.getByText("Only you")).toBeVisible();
});

test("a stale window cannot overwrite a newer save", async ({ browser }) => {
  const a = await signedIn(browser, FACULTY, FACULTY.own);
  const b = await a.context().newPage();
  await a.goto(`/templates/${copyId}/edit`);
  await b.goto(`/templates/${copyId}/edit`);
  await a.getByLabel("Description").fill("Saved first");
  await a.getByRole("button", { name: "Save" }).click();
  await expect(a.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  await b.getByLabel("Description").fill("Saved second");
  await b.getByRole("button", { name: "Save" }).click();
  await expect(b.getByRole("alert").filter({ hasText: "another window" })).toBeVisible();
});

test("someone else's private template does not exist for them, by any route", async ({
  browser,
}) => {
  const admin = await signedIn(browser, ADMIN, ADMIN.password);
  await admin.goto("/templates");
  await expect(admin.getByRole("link", { name: new RegExp(COPY_TITLE) })).toHaveCount(0);
  for (const id of [copyId, "00000000-0000-4000-8000-000000000000"]) {
    expect((await admin.goto(`/templates/${id}`))?.status()).toBe(404);
    expect((await admin.goto(`/templates/${id}/edit`))?.status()).toBe(404);
    const res = await admin.request.get(`/api/templates/${id}/preview`);
    expect(res.status()).toBe(404);
  }
});

test("the owner makes it global; others see and copy it but cannot edit; an admin can unpublish and delete", async ({
  browser,
}) => {
  const owner = await signedIn(browser, FACULTY, FACULTY.own);
  await owner.goto(`/templates/${copyId}`);
  await owner.getByRole("button", { name: "Make global" }).click();
  await expect(owner.getByText("Global", { exact: true })).toBeVisible();

  const admin = await signedIn(browser, ADMIN, ADMIN.password);
  await admin.goto(`/templates/${copyId}`);
  await expect(admin.getByRole("heading", { level: 1, name: COPY_TITLE })).toBeVisible();
  await expect(admin.getByRole("link", { name: "Edit" })).toHaveCount(0);
  await expect(admin.getByRole("button", { name: "Make global" })).toHaveCount(0);
  expect((await admin.goto(`/templates/${copyId}/edit`))?.status()).toBe(404);
  expect((await admin.request.get(`/api/templates/${copyId}/preview`)).status()).toBe(200);

  await admin.goto(`/templates/${copyId}`);
  await admin.getByRole("button", { name: "Make private" }).click();
  await expect(admin).toHaveURL(/./);
  await admin.reload();
  expect((await admin.goto(`/templates/${copyId}`))?.status()).toBe(404);

  await owner.goto(`/templates/${copyId}`);
  await expect(owner.getByText("Only you")).toBeVisible();
  await owner.getByRole("button", { name: "Make global" }).click();
  await expect(owner.getByText("Global", { exact: true })).toBeVisible();

  await admin.goto(`/templates/${copyId}`);
  await admin.getByRole("button", { name: "Delete" }).click();
  await admin.getByRole("dialog").getByRole("button", { name: "Delete template" }).click();
  await expect(admin).toHaveURL(/\/templates\?deleted=1$/);
  await expect(admin.getByText("The template was deleted.")).toBeVisible();

  await owner.goto("/templates?scope=MINE");
  await expect(owner.getByText("No templates match.")).toBeVisible();
});

test("the preview route refuses other sites and signed-out callers", async ({ playwright }) => {
  const anon = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
  const body = { data: "{}" };
  expect((await anon.post("/api/templates/preview", body)).status()).toBe(403);
  const origin = test.info().project.use.baseURL as string;
  expect(
    (
      await anon.post("/api/templates/preview", {
        ...body,
        headers: { origin: "http://evil.test" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (await anon.post("/api/templates/preview", { ...body, headers: { origin } })).status(),
  ).toBe(401);
  expect((await anon.get(`/api/templates/${copyId}/preview`)).status()).toBe(401);
  await anon.dispose();
});
