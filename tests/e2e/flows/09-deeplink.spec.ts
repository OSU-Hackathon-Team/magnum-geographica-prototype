import { test, expect } from "@playwright/test";
import { installApiMock } from "../helpers/api-mock.js";

test.beforeEach(async ({ page }) => {
  await installApiMock(page);
});

test("/explore?lat&lon&zoom deep link shows coords badge and centers the map", async ({ page }) => {
  await page.goto("/explore?lat=39.4301&lon=-82.5404&zoom=10");

  await expect(page.getByTestId("explore-screen")).toBeVisible();
  await expect(page.getByTestId("explore-coords")).toBeVisible();
  await expect(page.getByTestId("explore-coords")).toContainText("39.43");
  await expect(page.getByTestId("explore-coords")).toContainText("-82.54");
});

test("/explore deep link rejects invalid coordinates gracefully", async ({ page }) => {
  await page.goto("/explore?lat=999&lon=foo&zoom=12");

  await expect(page.getByTestId("explore-screen")).toBeVisible();
  await expect(page.getByTestId("explore-coords")).toHaveCount(0);
});

test("trail detail 'View on map' opens the explore map with deep-link coords", async ({ page }) => {
  await page.goto("/trail/buckeye-trail");

  await expect(page.getByTestId("trail-view-on-map")).toBeVisible();
  await page.getByTestId("trail-view-on-map").click();

  await expect(page).toHaveURL(/\/explore\?lat=39\.43/);
  await expect(page).toHaveURL(/lon=-82\.54/);
  await expect(page.getByTestId("explore-coords")).toBeVisible();
});

test("system detail 'View on map' opens the explore map with deep-link coords", async ({
  page,
}) => {
  await page.goto("/system/cuyahoga-valley-national-park");

  await expect(page.getByTestId("system-view-on-map")).toBeVisible();
  await page.getByTestId("system-view-on-map").click();

  await expect(page).toHaveURL(/\/explore\?lat=41\.27/);
  await expect(page).toHaveURL(/lon=-81\.55/);
  await expect(page.getByTestId("explore-coords")).toBeVisible();
});

test("feature detail 'View on map' opens the explore map with deep-link coords", async ({
  page,
}) => {
  await page.goto("/feature/f-1");

  await expect(page.getByTestId("feature-view-on-map")).toBeVisible();
  await page.getByTestId("feature-view-on-map").click();

  await expect(page).toHaveURL(/\/explore\?lat=39\.43/);
  await expect(page).toHaveURL(/lon=-82\.54/);
  await expect(page.getByTestId("explore-coords")).toBeVisible();
});
