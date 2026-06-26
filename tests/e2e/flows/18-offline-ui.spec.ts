import { test, expect } from "@playwright/test";
import { installApi, resetApi } from "../helpers/api.js";

test.beforeEach(async ({ page }) => {
  resetApi();
  await installApi(page);
});

test("status indicator shows Online when connected", async ({ page }) => {
  await page.goto("/explore");
  await expect(page.getByTestId("explore-screen")).toBeVisible();
  await expect(page.getByTestId("status-indicator")).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("status-label")).toHaveText("Online");
});

test("status indicator shows dot and label", async ({ page }) => {
  await page.goto("/explore");
  await expect(page.getByTestId("status-indicator")).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("status-dot")).toBeVisible();
  await expect(page.getByTestId("status-label")).toBeVisible();
});

test("profile shows contributor name and online status", async ({ page }) => {
  await page.goto("/profile");
  await expect(page.getByTestId("profile-screen")).toBeVisible();
  await expect(page.getByTestId("profile-contributor")).toBeVisible();
  // Anonymous users are attributed to their public IP (Wikipedia-style).
  await expect(page.getByTestId("profile-contributor")).toHaveText(/^IP:[\d.:a-fA-F]+$/);
  await expect(page.getByTestId("profile-status")).toBeVisible();
});

test("storage manager renders in profile", async ({ page }) => {
  await page.goto("/profile");
  await expect(page.getByTestId("profile-screen")).toBeVisible();
  await expect(page.getByTestId("storage-manager")).toBeVisible({ timeout: 15000 });
});

test("storage manager shows empty state when nothing downloaded", async ({ page }) => {
  await page.goto("/profile");
  await expect(page.getByTestId("profile-screen")).toBeVisible();
  await expect(page.getByTestId("storage-manager")).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("storage-empty")).toBeVisible();
});

test("pending queue section visible in profile", async ({ page }) => {
  await page.goto("/profile");
  await expect(page.getByTestId("profile-screen")).toBeVisible();
  await expect(page.getByTestId("profile-pending-section")).toBeVisible({ timeout: 15000 });
});
