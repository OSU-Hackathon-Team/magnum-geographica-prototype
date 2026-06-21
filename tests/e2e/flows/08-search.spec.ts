import { test, expect } from "@playwright/test";
import { installApiMock } from "../helpers/api-mock.js";

test.beforeEach(async ({ page }) => {
  await installApiMock(page);
});

test("typing in the explore search returns grouped results", async ({ page }) => {
  await page.goto("/explore");

  await page.getByTestId("explore-search").fill("buckeye");

  await expect(page.getByTestId("search-result-trail-buckeye-trail")).toBeVisible();
});

test("tapping a trail result navigates to that trail's detail page", async ({ page }) => {
  await page.goto("/explore");

  await page.getByTestId("explore-search").fill("towpath");
  await page.getByTestId("search-result-trail-towpath-trail").click();

  await expect(page).toHaveURL(/\/trail\/towpath-trail$/);
  await expect(page.getByTestId("trail-detail-screen")).toBeVisible();
});

test("tapping a system result navigates to that system's detail page", async ({ page }) => {
  await page.goto("/explore");

  await page.getByTestId("explore-search").fill("cuyahoga");
  await page.getByTestId("search-result-system-cuyahoga-valley-national-park").click();

  await expect(page).toHaveURL(/\/system\/cuyahoga-valley-national-park$/);
  await expect(page.getByTestId("system-detail-screen")).toBeVisible();
});

test("tapping a feature result navigates to that feature's detail page", async ({ page }) => {
  await page.goto("/explore");

  await page.getByTestId("explore-search").fill("cave");
  await page.getByTestId("search-result-feature-f-1").click();

  await expect(page).toHaveURL(/\/feature\/f-1$/);
  await expect(page.getByTestId("feature-detail-screen")).toBeVisible();
});

test("the clear button dismisses results and resets the query", async ({ page }) => {
  await page.goto("/explore");

  await page.getByTestId("explore-search").fill("cuyahoga");
  await expect(page.getByTestId("search-result-system-cuyahoga-valley-national-park")).toBeVisible();

  await page.getByTestId("explore-search-clear").click();
  await expect(page.getByTestId("search-results")).toHaveCount(0);
  await expect(page.getByTestId("explore-search")).toHaveValue("");
});

test("search shows an empty state when no results match", async ({ page }) => {
  await page.goto("/explore");

  await page.getByTestId("explore-search").fill("zzz-no-match-zzz");
  await expect(page.getByTestId("search-empty")).toBeVisible();
});
