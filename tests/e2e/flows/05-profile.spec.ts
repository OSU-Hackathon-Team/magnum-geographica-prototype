import { test, expect } from "@playwright/test";
import { installApi } from "../helpers/api.js";

const BASE = "http://localhost:4173";

test.beforeEach(async ({ page }) => {
  await installApi(page);
});

test("user opens Profile and sees status sections", async ({ page }) => {
  await page.goto(`${BASE}/profile`);

  await expect(page.getByTestId("profile-screen")).toBeVisible();
  await expect(page.getByTestId("profile-contributor")).toBeVisible();
  await expect(page.getByTestId("profile-status")).toBeVisible();
});

test("contributor name defaults to the caller's IP (Wikipedia-style)", async ({ page }) => {
  await page.goto(`${BASE}/profile`);
  // The e2e API has no proxy in front, so the server reports the loopback
  // address; we only assert the "IP:" prefix + shape, not the exact value.
  await expect(page.getByTestId("profile-contributor")).toHaveText(/^IP:[\d.:a-fA-F]+$/);
  await expect(page.getByTestId("profile-ip-note")).toBeVisible();
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

test("login and register buttons are visible when not authenticated", async ({ page }) => {
  await page.goto(`${BASE}/profile`);
  await expect(page.getByTestId("profile-login")).toBeVisible();
  await expect(page.getByTestId("profile-register")).toBeVisible();
});
