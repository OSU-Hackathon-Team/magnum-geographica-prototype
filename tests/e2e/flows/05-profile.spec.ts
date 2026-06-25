import { test, expect } from "@playwright/test";
import { installApiMock } from "../helpers/api-mock.js";

const BASE = "http://localhost:4173";

test.beforeEach(async ({ page }) => {
  await installApiMock(page);
});

test("user opens Profile and sees status sections", async ({ page }) => {
  await page.goto(`${BASE}/profile`);

  await expect(page.getByTestId("profile-screen")).toBeVisible();
  await expect(page.getByTestId("profile-contributor")).toBeVisible();
  await expect(page.getByTestId("profile-status")).toBeVisible();
  await expect(page.getByTestId("profile-reset")).toBeVisible();
});

test("contributor name defaults to 'anonymous'", async ({ page }) => {
  await page.goto(`${BASE}/profile`);
  await expect(page.getByTestId("profile-contributor")).toHaveText("anonymous");
});

test("status reflects online by default", async ({ page }) => {
  await page.goto(`${BASE}/profile`);
  await expect(page.getByTestId("profile-status")).toHaveText("Online");
});

test("karma card is NOT shown for anonymous users", async ({ page }) => {
  await page.goto(`${BASE}/profile`);
  // Anonymous → no karma card (we don't reveal karma for anons).
  await expect(page.getByTestId("profile-karma")).not.toBeAttached();
});

test("authenticated user sees the karma card on profile", async ({ page }) => {
  await page.goto(`${BASE}/auth/register`);
  await page.getByTestId("register-username").fill("reg01");
  await page.getByTestId("register-email").fill("reg01@example.com");
  await page.getByTestId("register-password").fill("testpass123");
  await page.getByTestId("register-confirm-password").fill("testpass123");
  await page.getByTestId("register-submit").click();
  await expect(page).toHaveURL(/\/explore$/);
  await page.goto(`${BASE}/profile`);
  await expect(page.getByTestId("profile-karma")).toBeVisible();
  await expect(page.getByTestId("profile-karma-value")).toBeVisible();
  await expect(page.getByTestId("profile-tier-badge")).toBeVisible();
});

test("contributor name can be reset to anonymous via the hint link", async ({ page }) => {
  await page.goto(`${BASE}/profile`);
  // The hint is always visible for anonymous users. Clicking it
  // shouldn't throw.
  await page.getByTestId("profile-reset").click();
  await expect(page.getByTestId("profile-contributor")).toHaveText("anonymous");
});

test("login and register buttons are visible when not authenticated", async ({ page }) => {
  await page.goto(`${BASE}/profile`);
  await expect(page.getByTestId("profile-login")).toBeVisible();
  await expect(page.getByTestId("profile-register")).toBeVisible();
});

