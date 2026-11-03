import { expect, test } from "@playwright/test";

test("the app answers with its name", async ({ page }) => {
  const response = await page.goto("/login");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle(/DRAFTEX/);
  await expect(page.getByText("DRAFTEX", { exact: true })).toBeVisible();
});

test("does not advertise the framework", async ({ request }) => {
  const response = await request.get("/login");
  expect(response.headers()["x-powered-by"]).toBeUndefined();
});
