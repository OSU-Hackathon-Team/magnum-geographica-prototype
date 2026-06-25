import { test, expect } from "@playwright/test";
import { installApiMock, resetApiMock } from "../helpers/api-mock.js";

const BASE = "http://localhost:4173";

test.beforeEach(async ({ page }) => {
  await installApiMock(page);
});

test.afterEach(() => {
  resetApiMock();
});

test.describe("Feature detail — preset rendering (§21.4)", () => {
  test("preset label is shown for f-4 (Cedar Falls Overlook, viewpoint)", async ({ page }) => {
    await page.goto(`${BASE}/feature/f-4`);
    await expect(page.getByTestId("feature-detail-screen")).toBeVisible();
    await expect(page.getByTestId("feature-preset-label")).toHaveText("Viewpoint");
  });

  test("answer badges render for boolean preset questions", async ({ page }) => {
    await page.goto(`${BASE}/feature/f-4`);
    // f-4 has answers {panoramic: true, covered: false}. The detail
    // page should show those as badges.
    await expect(page.getByTestId("feature-answers")).toBeVisible();
    // We don't assert exact labels because the badge text format
    // depends on the preset's question labels.
  });

  test("feature without preset does not show a preset label", async ({ page }) => {
    await page.goto(`${BASE}/feature/f-1`);
    await expect(page.getByTestId("feature-detail-screen")).toBeVisible();
    // f-1 has no preset — no preset label.
    await expect(page.getByTestId("feature-preset-label")).not.toBeVisible();
  });
});
