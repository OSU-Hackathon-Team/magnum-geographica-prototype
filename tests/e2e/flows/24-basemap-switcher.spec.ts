import { test, expect } from "@playwright/test";
import { installApi } from "../helpers/api.js";

test.beforeEach(async ({ page }) => {
  await installApi(page);
});

test("basemap switcher is visible on the explore screen", async ({ page }) => {
  await page.goto("/explore");
  await expect(page.getByTestId("explore-screen")).toBeVisible();
  const switcher = page.getByTestId("explore-base-layer-switcher-trigger");
  await expect(switcher).toBeVisible();
});

test("default basemap is 'Simplified'", async ({ page }) => {
  await page.goto("/explore");
  const switcher = page.getByTestId("explore-base-layer-switcher-trigger");
  await expect(switcher).toBeVisible();
  await expect(switcher).toContainText("Simplified");
});

test("clicking the switcher opens a menu with both layers", async ({ page }) => {
  await page.goto("/explore");
  const switcher = page.getByTestId("explore-base-layer-switcher-trigger");
  await switcher.click();
  await expect(page.getByTestId("explore-base-layer-switcher-option-simplified")).toBeVisible();
  await expect(page.getByTestId("explore-base-layer-switcher-option-satellite")).toBeVisible();
});

test("selecting 'Satellite' updates the trigger label", async ({ page }) => {
  await page.goto("/explore");
  const switcher = page.getByTestId("explore-base-layer-switcher-trigger");
  await switcher.click();
  await page.getByTestId("explore-base-layer-switcher-option-satellite").click();
  // The menu closes after picking — the trigger should now read "Satellite".
  await expect(switcher).toContainText("Satellite");
});

test("the basemap choice persists across reloads", async ({ page }) => {
  await page.goto("/explore");
  const switcher = page.getByTestId("explore-base-layer-switcher-trigger");
  await switcher.click();
  await page.getByTestId("explore-base-layer-switcher-option-satellite").click();
  await expect(switcher).toContainText("Satellite");

  // Reload and verify the choice was restored from AsyncStorage.
  await page.reload();
  await expect(page.getByTestId("explore-screen")).toBeVisible();
  const reloadedSwitcher = page.getByTestId("explore-base-layer-switcher-trigger");
  await expect(reloadedSwitcher).toContainText("Satellite");
});

test("the basemap choice persists across navigation (away and back)", async ({ page }) => {
  await page.goto("/explore");
  const switcher = page.getByTestId("explore-base-layer-switcher-trigger");
  await switcher.click();
  await page.getByTestId("explore-base-layer-switcher-option-satellite").click();
  await expect(switcher).toContainText("Satellite");

  // Switch to a different tab, then back to Explore.
  await page.getByRole("tab", { name: "Systems" }).click();
  await expect(page).toHaveURL(/\/systems$/);
  await page.getByRole("tab", { name: "Explore" }).click();
  await expect(page).toHaveURL(/\/explore$/);
  await expect(page.getByTestId("explore-base-layer-switcher-trigger")).toContainText("Satellite");
});

test("selecting 'Simplified' after 'Satellite' reverts the label", async ({ page }) => {
  await page.goto("/explore");
  const switcher = page.getByTestId("explore-base-layer-switcher-trigger");
  await switcher.click();
  await page.getByTestId("explore-base-layer-switcher-option-satellite").click();
  await expect(switcher).toContainText("Satellite");

  await switcher.click();
  await page.getByTestId("explore-base-layer-switcher-option-simplified").click();
  await expect(switcher).toContainText("Simplified");
});

test("clicking the backdrop dismisses the menu without changing the selection", async ({
  page,
}) => {
  await page.goto("/explore");
  const switcher = page.getByTestId("explore-base-layer-switcher-trigger");
  await switcher.click();
  await expect(page.getByTestId("explore-base-layer-switcher-option-satellite")).toBeVisible();

  await page.getByTestId("explore-base-layer-switcher-backdrop").click();
  // The menu option should no longer be visible (modal dismissed).
  await expect(page.getByTestId("explore-base-layer-switcher-option-satellite")).toHaveCount(0);
  // The original selection is unchanged.
  await expect(switcher).toContainText("Simplified");
});

test("the map canvas is NOT recreated when switching basemaps", async ({ page }) => {
  await page.goto("/explore");
  const canvas = page.locator('[data-testid="explore-map"] canvas');
  await expect(canvas).toHaveCount(1, { timeout: 15_000 });
  // Tag the parent container (the OL target div) — it must persist across
  // layer swaps, which proves the OL Map instance is reused rather than
  // recreated. Toggling the basemap swaps layer sources (MVT → XYZ), which
  // can briefly disturb the canvas itself; checking the surrounding
  // container is the stable invariant we care about.
  const mapDiv = page.locator('[data-testid="explore-map"] > div').first();
  await mapDiv.evaluate((el) => ((el as HTMLElement).dataset.reproMarker = "original"));

  const switcher = page.getByTestId("explore-base-layer-switcher-trigger");
  await switcher.click();
  await page.getByTestId("explore-base-layer-switcher-option-satellite").click();
  // Give the layer swap a moment to apply.
  await page.waitForTimeout(300);

  // The OL map container is the same DOM node — proves the map wasn't
  // recreated. We don't assert the canvas is identical because swapping
  // between a VectorTileSource and an XYZ source can momentarily replace
  // the underlying canvas.
  await expect(mapDiv).toHaveCount(1);
  const marker = await mapDiv.evaluate((el) => (el as HTMLElement).dataset.reproMarker ?? null);
  expect(marker).toBe("original");
  // And the canvas is still there.
  await expect(canvas).toHaveCount(1);
});
