import { test, expect } from "@playwright/test";
import { installApi } from "../helpers/api.js";

test.beforeEach(async ({ page }) => {
  await installApi(page);
});

test("user opens a system and sees its name, description, and external link", async ({ page }) => {
  await page.goto("/system/hocking-hills-state-park");

  await expect(page.getByTestId("system-detail-screen")).toBeVisible();
  await expect(page.getByTestId("system-name")).toHaveText("Hocking Hills State Park");
  await expect(page.getByText(/state park in southeastern Ohio/i)).toBeVisible();
  await expect(page.getByTestId("system-external-link")).toBeVisible();
});

test("user sees the trails listed under the system", async ({ page }) => {
  await page.goto("/system/hocking-hills-state-park");
  const trailsSection = page.getByTestId("system-trails");
  await trailsSection.scrollIntoViewIfNeeded();
  await expect(trailsSection).toBeVisible();
  await expect(page.getByTestId("system-trail-card-buckeye-trail")).toBeVisible();
  await expect(page.getByTestId("system-trail-card-hocking-hills-indian-run")).toBeVisible();
});

test("user sees an empty state for systems with no trails", async ({ page }) => {
  await page.goto("/system/wayne-national-forest");
  const trailsSection = page.getByTestId("system-trails");
  await trailsSection.scrollIntoViewIfNeeded();
  await expect(page.getByTestId("system-trails-empty")).toBeVisible();
});

test("user can navigate from a system to a trail", async ({ page }) => {
  await page.goto("/system/cuyahoga-valley-national-park");
  const trailsSection = page.getByTestId("system-trails");
  await trailsSection.scrollIntoViewIfNeeded();
  await expect(trailsSection).toBeVisible();
  await page.getByTestId("system-trail-card-towpath-trail").click();
  await expect(page).toHaveURL(/\/trail\/towpath-trail$/);
  await expect(page.getByTestId("trail-detail-screen")).toBeVisible();
});
