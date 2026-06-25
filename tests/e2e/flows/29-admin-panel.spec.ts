import { test, expect } from "@playwright/test";
import { installApiMock } from "../helpers/api-mock.js";

const BASE = "http://localhost:4173";

test.beforeEach(async ({ page }) => {
  await installApiMock(page);
});

test.describe("Admin panel — access control", () => {
  test("dashboard redirects unauthenticated users to explore", async ({ page }) => {
    await page.goto(`${BASE}/admin/dashboard`);
    await expect(page).toHaveURL(/\/explore$/);
  });

  test("revisions page redirects unauthenticated users", async ({ page }) => {
    await page.goto(`${BASE}/admin/revisions`);
    await expect(page).toHaveURL(/\/explore$/);
  });

  test("users page redirects unauthenticated users", async ({ page }) => {
    await page.goto(`${BASE}/admin/users`);
    await expect(page).toHaveURL(/\/explore$/);
  });

  test("unauthenticated user does not see admin button on profile", async ({ page }) => {
    await page.goto(`${BASE}/profile`);
    await expect(page.getByTestId("profile-admin")).not.toBeAttached();
    await expect(page.getByTestId("profile-login")).toBeVisible();
  });
});

test.describe("Admin panel — admin access", () => {
  async function loginAsAdmin(page: import("@playwright/test").Page) {
    await page.goto(`${BASE}/auth/login`);
    await page.getByTestId("login-email").fill("admin@example.com");
    await page.getByTestId("login-password").fill("adminpass");
    await page.getByTestId("login-submit").click();
    await expect(page).toHaveURL(/\/explore$/);
  }

  test("authenticated admin can open the dashboard", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/dashboard`);
    // The dashboard renders with admin-only data — we just verify it
    // does not redirect to /explore.
    await expect(page).toHaveURL(/\/admin\/dashboard/);
  });

  test("authenticated admin can open the patrol feed", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/patrol`);
    await expect(page.getByTestId("admin-patrol")).toBeVisible();
  });

  test("authenticated admin can open the presets list", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/presets`);
    await expect(page.getByTestId("admin-presets")).toBeVisible();
  });

  test("admin button is visible on the profile page for admins", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/profile`);
    await expect(page.getByTestId("profile-admin")).toBeVisible();
  });
});

