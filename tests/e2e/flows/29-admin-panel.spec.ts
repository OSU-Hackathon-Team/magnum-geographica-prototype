import { test, expect } from "@playwright/test";
import { installApiMock } from "../helpers/api-mock.js";

test.beforeEach(async ({ page }) => {
  await installApiMock(page);
});

test.describe("Admin flow", () => {
  test("admin dashboard is not accessible to unauthenticated users", async ({ page }) => {
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/(explore|tabs)\//);
  });

  test("admin revisions page is not accessible to unauthenticated users", async ({ page }) => {
    await page.goto("/admin/revisions");
    await expect(page).toHaveURL(/\/(explore|tabs)\//);
  });

  test("admin users page is not accessible to unauthenticated users", async ({ page }) => {
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/(explore|tabs)\//);
  });
});
