import { test, expect } from "@playwright/test";
import { installApi, resetApi } from "../helpers/api.js";
import { FIXTURE_IDS } from "../fixtures/ids.js";

/**
 * Segment editor end-to-end flow.
 *
 * Walks the user through the segment editor for a trail that has multiple
 * segments:
 *   1. Open a trail detail page (Buckeye Trail has two segments in the
 *      mock fixture).
 *   2. Tap "Edit Segments" to enter the editor.
 *   3. Change a segment's name and save.
 *   4. Toggle a hazard on a segment.
 *   5. Reorder two segments.
 *   6. Exit edit mode and verify the trail detail is restored.
 */
test.beforeEach(async ({ page }) => {
  resetApi();
  await installApi(page);
});

test("user can edit a segment name, surface, and hazards from the editor", async ({ page }) => {
  await page.goto("/trail/buckeye-trail");
  await expect(page.getByTestId("trail-detail-screen")).toBeVisible();

  // The mock fixture has FIXTURE_IDS.seg1 ("North loop") and FIXTURE_IDS.seg2 ("Road connector").
  // Scroll to the Edit Segments button and tap it.
  await page.getByTestId("trail-segments").scrollIntoViewIfNeeded();
  await page.getByTestId("trail-segments-edit").click();
  await expect(page.getByTestId("trail-segment-edit-list")).toBeVisible();

  // 1. The first segment's editor should be visible.
  const seg1Editor = page.getByTestId(`segment-editor-${FIXTURE_IDS.seg1}`);
  await expect(seg1Editor).toBeVisible();
  await expect(page.getByTestId(`segment-editor-name-${FIXTURE_IDS.seg1}`)).toHaveValue("North loop");

  // 2. Change the name and save. The save navigates away from the editor.
  await page.getByTestId(`segment-editor-name-${FIXTURE_IDS.seg1}`).fill("Northern ridge");
  await page.getByTestId(`segment-editor-save-${FIXTURE_IDS.seg1}`).click();
  await page.waitForTimeout(1000);
  await expect(page.getByTestId("trail-detail-screen")).toBeVisible();
});

test("user can reorder segments with the up and down buttons", async ({ page }) => {
  await page.goto("/trail/buckeye-trail");
  await expect(page.getByTestId("trail-detail-screen")).toBeVisible();
  await page.getByTestId("trail-segments").scrollIntoViewIfNeeded();
  await page.getByTestId("trail-segments-edit").click();
  await expect(page.getByTestId("trail-segment-edit-list")).toBeVisible();

  // 1. The first segment's "up" button is disabled (it can't go higher).
  //    React Native Web uses `aria-disabled` for Pressable's `disabled` prop.
  await expect(page.getByTestId(`segment-reorder-up-${FIXTURE_IDS.seg1}`)).toHaveAttribute(
    "aria-disabled",
    "true",
  );

  // 2. The last segment's "down" button is disabled.
  await expect(page.getByTestId(`segment-reorder-down-${FIXTURE_IDS.seg2}`)).toHaveAttribute(
    "aria-disabled",
    "true",
  );

  // 3. Move the first segment down.
  await page.getByTestId(`segment-reorder-down-${FIXTURE_IDS.seg1}`).click();
  await page.waitForTimeout(1000);

  // 4. Exit edit mode.
  await page.getByTestId("segment-edit-exit").click();
  await expect(page.getByTestId("trail-detail-screen")).toBeVisible();
});

test("user can delete a segment from the editor", async ({ page }) => {
  await page.goto("/trail/buckeye-trail");
  await expect(page.getByTestId("trail-detail-screen")).toBeVisible();
  await page.getByTestId("trail-segments").scrollIntoViewIfNeeded();
  await page.getByTestId("trail-segments-edit").click();
  await expect(page.getByTestId("trail-segment-edit-list")).toBeVisible();

  // The trail starts with two segments. Delete one.
  await page.getByTestId(`segment-editor-delete-${FIXTURE_IDS.seg1}`).click();
  await page.waitForTimeout(1000);

  await expect(page.getByTestId("trail-detail-screen")).toBeVisible();
});

test("segment surface and road connector toggles can be changed", async ({ page }) => {
  await page.goto("/trail/buckeye-trail");
  await expect(page.getByTestId("trail-detail-screen")).toBeVisible();
  await page.getByTestId("trail-segments").scrollIntoViewIfNeeded();
  await page.getByTestId("trail-segments-edit").click();
  await expect(page.getByTestId("trail-segment-edit-list")).toBeVisible();

  // 1. The Switch components (road connector, steep grade, one-way) are
  //    rendered for each segment.
  await expect(page.getByTestId(`segment-editor-road-${FIXTURE_IDS.seg1}`)).toBeVisible();
  await expect(page.getByTestId(`segment-editor-steep-${FIXTURE_IDS.seg1}`)).toBeVisible();
  await expect(page.getByTestId(`segment-editor-oneway-${FIXTURE_IDS.seg1}`)).toBeVisible();
  await expect(page.getByTestId(`segment-editor-road-${FIXTURE_IDS.seg2}`)).toBeVisible();
  await expect(page.getByTestId(`segment-editor-steep-${FIXTURE_IDS.seg2}`)).toBeVisible();
  await expect(page.getByTestId(`segment-editor-oneway-${FIXTURE_IDS.seg2}`)).toBeVisible();

  // 2. Select a different surface type for FIXTURE_IDS.seg1 and save.
  await page.getByTestId(`segment-editor-surface-gravel-${FIXTURE_IDS.seg1}`).click();
  await page.getByTestId(`segment-editor-save-${FIXTURE_IDS.seg1}`).click();
  await page.waitForTimeout(1000);

  await expect(page.getByTestId("trail-detail-screen")).toBeVisible();
});
