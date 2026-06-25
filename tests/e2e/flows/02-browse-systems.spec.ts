import { test, expect } from "@playwright/test";
import { installApi } from "../helpers/api.js";

test.beforeEach(async ({ page }) => {
  await installApi(page);
});

test("user sees the list of all systems", async ({ page }) => {
  await page.goto("/systems");

  await expect(page.getByTestId("system-card-hocking-hills-state-park")).toBeVisible();
  await expect(page.getByTestId("system-card-cuyahoga-valley-national-park")).toBeVisible();
  await expect(page.getByTestId("system-card-wayne-national-forest")).toBeVisible();
});

test("user filters the list by typing in the search", async ({ page }) => {
  await page.goto("/systems");
  await expect(page.getByTestId("system-card-hocking-hills-state-park")).toBeVisible();

  await page.getByTestId("systems-search").fill("hocking");

  await expect(page.getByTestId("system-card-cuyahoga-valley-national-park")).toHaveCount(0);
  await expect(page.getByTestId("system-card-wayne-national-forest")).toHaveCount(0);
});

test("user can narrow to a single system and then back to all", async ({ page }) => {
  await page.goto("/systems");
  await expect(page.getByTestId("system-card-hocking-hills-state-park")).toBeVisible();

  await page.getByTestId("systems-search").fill("wayne");
  await expect(page.getByTestId("system-card-wayne-national-forest")).toBeVisible();
  await expect(page.getByTestId("system-card-hocking-hills-state-park")).toHaveCount(0);

  await page.getByTestId("systems-search").fill("");
  await expect(page.getByTestId("system-card-hocking-hills-state-park")).toBeVisible();
  await expect(page.getByTestId("system-card-wayne-national-forest")).toBeVisible();
});

test("user sees an empty state when no systems match", async ({ page }) => {
  await page.goto("/systems");
  await expect(page.getByTestId("system-card-hocking-hills-state-park")).toBeVisible();

  await page.getByTestId("systems-search").fill("nothing-matches-this");
  await expect(page.getByTestId("systems-empty")).toBeVisible();
});

test("user can tap a system card to open its detail page", async ({ page }) => {
  await page.goto("/systems");
  await page.getByTestId("system-card-hocking-hills-state-park").click();
  await expect(page).toHaveURL(/\/system\/hocking-hills-state-park$/);
  await expect(page.getByTestId("system-detail-screen")).toBeVisible();
});

test("user sees the same list of trails as the Trails tab", async ({ page }) => {
  await page.goto("/trails");
  await expect(page.getByTestId("trail-card-buckeye-trail")).toBeVisible();
  await expect(page.getByTestId("trail-card-towpath-trail")).toBeVisible();
  await expect(page.getByTestId("trail-card-hocking-hills-indian-run")).toBeVisible();
});
