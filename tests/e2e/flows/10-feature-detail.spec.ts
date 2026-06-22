import { test, expect } from "@playwright/test";
import { installApiMock } from "../helpers/api-mock.js";

test.beforeEach(async ({ page }) => {
  await installApiMock(page);
});

test("user opens a feature detail page and sees its name and type", async ({ page }) => {
  await page.goto("/feature/f-1");

  await expect(page.getByTestId("feature-detail-screen")).toBeVisible();
  await expect(page.getByTestId("feature-name")).toHaveText("Old Man's Cave");
  // Feature type is displayed (rendered as "scenic point" with capitalization)
  await expect(page.getByTestId("feature-meta")).toBeVisible();
  await expect(page.getByText(/scenic/i)).toBeVisible();
});

test("unknown feature id shows the error state", async ({ page }) => {
  await page.goto("/feature/does-not-exist");

  await expect(page.getByTestId("feature-detail-error")).toBeVisible();
});

test("tapping a feature card on a trail detail page navigates to feature detail", async ({ page }) => {
  await page.goto("/trail/buckeye-trail");

  await page.getByTestId("trail-feature-f-1").click();
  await expect(page).toHaveURL(/\/feature\/f-1$/);
  await expect(page.getByTestId("feature-detail-screen")).toBeVisible();
});
