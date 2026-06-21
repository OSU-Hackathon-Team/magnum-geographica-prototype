import { test, expect } from "@playwright/test";
import { installApiMock } from "../helpers/api-mock.js";

test.beforeEach(async ({ page }) => {
  await installApiMock(page);
});

test("user opens the app and lands on the Explore tab", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/explore$/);
  await expect(page.getByTestId("explore-screen")).toBeVisible();
  await expect(page.getByTestId("explore-map")).toBeVisible();
  await expect(page.getByPlaceholder("Search trails, systems, features...")).toBeVisible();
});

test("status indicator is visible in the tab bar header", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Online")).toBeVisible();
});

test("user can switch between all four tabs", async ({ page }) => {
  await page.goto("/explore");
  await expect(page.getByTestId("explore-screen")).toBeVisible();

  await page.getByRole("tab", { name: "Systems" }).click();
  await expect(page).toHaveURL(/\/systems$/);
  await expect(page.getByTestId("systems-screen")).toBeVisible();

  await page.getByRole("tab", { name: "Trails" }).click();
  await expect(page).toHaveURL(/\/trails$/);
  await expect(page.getByTestId("trails-screen")).toBeVisible();

  await page.getByRole("tab", { name: "Profile" }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByTestId("profile-screen")).toBeVisible();
});
