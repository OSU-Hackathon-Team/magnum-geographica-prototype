import { test, expect } from "@playwright/test";
import { installApiMock } from "../helpers/api-mock.js";

test.beforeEach(async ({ page }) => {
  await installApiMock(page);
});

test("map canvas is NOT recreated when returning to explore via 'View on map'", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("explore-screen")).toBeVisible();
  const canvas = page.locator('[data-testid="explore-map"] canvas');
  await expect(canvas).toHaveCount(1, { timeout: 15_000 });
  await canvas.evaluate((el) => ((el as HTMLElement).dataset.reproMarker = "original"));

  await page.getByRole("tab", { name: "Systems" }).click();
  await page.getByTestId("system-card-cuyahoga-valley-national-park").click();
  await expect(page).toHaveURL(/\/system\/cuyahoga-valley-national-park$/);
  await page.getByTestId("system-trail-card-towpath-trail").click();
  await expect(page).toHaveURL(/\/trail\/towpath-trail$/);

  await page.getByTestId("trail-view-on-map").click();
  await expect(page).toHaveURL(/\/explore\?lat=/);
  await page.waitForTimeout(600);

  await expect(canvas).toHaveCount(1);
  const marker = await canvas.first().evaluate((el) => (el as HTMLElement).dataset.reproMarker ?? null);
  expect(marker).toBe("original");
});

test("'View on map' from a directly-opened detail page reuses the single map", async ({ page }) => {
  // Open a trail detail directly (no prior explore visit in this tab session).
  await page.goto("/trail/buckeye-trail");
  await expect(page.getByTestId("trail-detail-screen")).toBeVisible();

  await page.getByTestId("trail-view-on-map").click();
  await expect(page).toHaveURL(/\/explore\?lat=/);
  await expect(page.getByTestId("explore-screen")).toBeVisible();
  await page.waitForTimeout(600);

  // Exactly one map canvas — no duplicate (tabs) instance.
  await expect(page.locator('[data-testid="explore-map"] canvas')).toHaveCount(1);
  await expect(page.getByTestId("explore-screen")).toHaveCount(1);
});

test("map canvas is NOT recreated by plain re-renders (typing in search)", async ({ page }) => {
  await page.goto("/explore");
  await expect(page.getByTestId("explore-screen")).toBeVisible();
  const canvas = page.locator('[data-testid="explore-map"] canvas');
  await expect(canvas).toHaveCount(1, { timeout: 15_000 });
  await canvas.evaluate((el) => ((el as HTMLElement).dataset.reproMarker = "orig2"));

  // Trigger re-renders via state changes (search query) — no navigation, no param change.
  await page.getByTestId("explore-search").click();
  await page.getByTestId("explore-search").fill("buckeye");
  await page.waitForTimeout(400);
  await page.getByTestId("explore-search-clear").click();
  await page.waitForTimeout(200);

  await expect(canvas).toHaveCount(1);
  const marker = await canvas.first().evaluate((el) => (el as HTMLElement).dataset.reproMarker ?? null);
  expect(marker).toBe("orig2");
});

test("zooming after a deep link does NOT snap the camera back to the deep-link position", async ({ page }) => {
  // Arrive via a deep link (sets flyTo target).
  await page.goto("/explore?lat=39.4301&lon=-82.5404&zoom=10");
  await expect(page.getByTestId("explore-screen")).toBeVisible();
  const canvas = page.locator('[data-testid="explore-map"] canvas');
  await expect(canvas).toHaveCount(1, { timeout: 15_000 });

  // Wait for the flyTo animation to settle and the moveend data attrs to appear.
  const container = page.locator('[data-testid="explore-map"] > div');
  await expect(container).toHaveAttribute("data-map-zoom", /.+/, { timeout: 10_000 });
  const zoomBefore = parseFloat(await container.getAttribute("data-map-zoom") ?? "0");
  const centerBefore = await container.getAttribute("data-map-center") ?? "";

  // Zoom in via mouse wheel over the map center.
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(800);

  // The zoom should have increased, and the center should NOT have snapped
  // back to the deep-link coords (39.4301, -82.5404).
  await expect(container).toHaveAttribute("data-map-zoom", /.+/);
  const zoomAfter = parseFloat(await container.getAttribute("data-map-zoom") ?? "0");
  const centerAfter = await container.getAttribute("data-map-center") ?? "";

  expect(zoomAfter).toBeGreaterThan(zoomBefore);
  // Center may shift slightly during zoom-to-cursor, but it must NOT snap back
  // to the exact deep-link position.
  expect(centerAfter).not.toBe("39.430100,-82.540400");
});
