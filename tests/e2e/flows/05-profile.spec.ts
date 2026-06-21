import { test, expect } from "@playwright/test";
import { installApiMock } from "../helpers/api-mock.js";

test.beforeEach(async ({ page }) => {
  await installApiMock(page);
});

test("user opens Profile and sees status sections", async ({ page }) => {
  await page.goto("/profile");

  await expect(page.getByTestId("profile-screen")).toBeVisible();
  await expect(page.getByTestId("profile-contributor")).toBeVisible();
  await expect(page.getByTestId("profile-status")).toBeVisible();
  await expect(page.getByTestId("profile-reset")).toBeVisible();
});

test("contributor name defaults to 'anonymous'", async ({ page }) => {
  await page.goto("/profile");
  await expect(page.getByTestId("profile-contributor")).toHaveText("anonymous");
});

test("status reflects online by default", async ({ page }) => {
  await page.goto("/profile");
  await expect(page.getByTestId("profile-status")).toHaveText("Online");
});
