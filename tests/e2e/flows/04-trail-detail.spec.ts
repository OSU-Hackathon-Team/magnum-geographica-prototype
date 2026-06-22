import { test, expect } from "@playwright/test";
import { installApiMock } from "../helpers/api-mock.js";

test.beforeEach(async ({ page }) => {
  await installApiMock(page);
});

test("user opens a trail and sees the name, stats, and verified badge", async ({ page }) => {
  await page.goto("/trail/buckeye-trail");

  await expect(page.getByTestId("trail-detail-screen")).toBeVisible();
  await expect(page.getByTestId("trail-name")).toHaveText("Buckeye Trail");
  await expect(page.getByTestId("trail-stats")).toBeVisible();
  await expect(page.getByTestId("trail-length")).toBeVisible();
  await expect(page.getByTestId("trail-elevation")).toBeVisible();
  await expect(page.getByTestId("trail-verified")).toBeVisible();
});

test("user sees the trail's segments with surface types and hazard flags", async ({ page }) => {
  await page.goto("/trail/buckeye-trail");

  await expect(page.getByTestId("trail-segment-seg-1")).toBeVisible();
  await expect(page.getByTestId("trail-segment-seg-2")).toBeVisible();
  await expect(page.getByTestId("trail-segment-length-seg-1")).toBeVisible();
  await expect(page.getByTestId("trail-segment-hazards-seg-1")).toBeVisible();
});

test("user sees the trail's features with type tags", async ({ page }) => {
  await page.goto("/trail/buckeye-trail");
  await expect(page.getByTestId("trail-feature-f-1")).toBeVisible();
  // FeatureTypeIcon renders a single-letter abbreviation (e.g., "V" for scenic_point)
  await expect(page.getByTestId("trail-feature-type-f-1")).toBeVisible();
  await expect(page.getByTestId("trail-feature-type-f-1")).toContainText("V");
});

test("user sees an empty state for trails without features", async ({ page }) => {
  await page.goto("/trail/hocking-hills-indian-run");
  await expect(page.getByTestId("trail-features-empty")).toBeVisible();
});

test("user can navigate from a trail list card to its detail", async ({ page }) => {
  await page.goto("/trails");
  await page.getByTestId("trail-card-towpath-trail").click();
  await expect(page).toHaveURL(/\/trail\/towpath-trail$/);
  await expect(page.getByTestId("trail-detail-screen")).toBeVisible();
});

test("user can filter trails from the Trails tab", async ({ page }) => {
  await page.goto("/trails");
  await expect(page.getByTestId("trail-card-buckeye-trail")).toBeVisible();

  await page.getByTestId("trails-search").fill("buckeye");
  await expect(page.getByTestId("trail-card-towpath-trail")).toHaveCount(0);
  await expect(page.getByTestId("trail-card-hocking-hills-indian-run")).toHaveCount(0);
});
