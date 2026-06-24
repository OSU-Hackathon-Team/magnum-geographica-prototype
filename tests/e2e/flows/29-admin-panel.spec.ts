import { test, expect } from "@playwright/test";
import { installApiMock } from "../helpers/api-mock.js";

test.beforeEach(async ({ page }) => {
  await installApiMock(page);
});

test.describe("Admin panel — access control", () => {
  test("dashboard redirects unauthenticated users to explore", async ({ page }) => {
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/explore$/);
  });

  test("revisions page redirects unauthenticated users", async ({ page }) => {
    await page.goto("/admin/revisions");
    await expect(page).toHaveURL(/\/explore$/);
  });

  test("users page redirects unauthenticated users", async ({ page }) => {
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/explore$/);
  });

  test("unauthenticated user does not see admin button on profile", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.getByTestId("profile-admin")).not.toBeAttached();
    await expect(page.getByTestId("profile-login")).toBeVisible();
  });
});
