import { expect, test } from "@playwright/test";

test("home page renders the app name", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle("DRAFTEX");
  await expect(page.getByRole("heading", { level: 1, name: "DRAFTEX" })).toBeVisible();
});

test("does not advertise the framework", async ({ request }) => {
  const response = await request.get("/");
  expect(response.headers()["x-powered-by"]).toBeUndefined();
});
