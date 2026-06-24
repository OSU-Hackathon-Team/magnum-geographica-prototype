import { test, expect } from "@playwright/test";
import { installApiMock, resetApiMock } from "../helpers/api-mock.js";

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
  resetApiMock();
  await installApiMock(page);
});

test("user can edit a segment name, surface, and hazards from the editor", async ({ page }) => {
  await page.goto("/trail/buckeye-trail");
  await expect(page.getByTestId("trail-detail-screen")).toBeVisible();

  // The mock fixture has seg-1 ("North loop") and seg-2 ("Road connector").
  // Scroll to the Edit Segments button and tap it.
  await page.getByTestId("trail-segments").scrollIntoViewIfNeeded();
  await page.getByTestId("trail-segments-edit").click();
  await expect(page.getByTestId("trail-segment-edit-list")).toBeVisible();

  // 1. The first segment's editor should be visible.
  const seg1Editor = page.getByTestId("segment-editor-seg-1");
  await expect(seg1Editor).toBeVisible();
  await expect(page.getByTestId("segment-editor-name-seg-1")).toHaveValue("North loop");

  // 2. Change the name and save. The editor's text field has internal
  //    state — the assertion on its value is local to the input. After
  //    save, the editor remains on screen.
  await page.getByTestId("segment-editor-name-seg-1").fill("Northern ridge");
  await page.getByTestId("segment-editor-save-seg-1").click();
  await expect(seg1Editor).toBeVisible();

  // 3. Toggle a hazard on the same segment, then save.
  await page.getByTestId("segment-editor-hazard-muddy-seg-1").click();
  await page.getByTestId("segment-editor-save-seg-1").click();
  await expect(seg1Editor).toBeVisible();

  // 4. The other segment is also in the list.
  const seg2Editor = page.getByTestId("segment-editor-seg-2");
  await expect(seg2Editor).toBeVisible();

  // 5. Exit edit mode.
  await page.getByTestId("segment-edit-exit").click();
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
  await expect(page.getByTestId("segment-reorder-up-seg-1")).toHaveAttribute(
    "aria-disabled",
    "true",
  );

  // 2. The last segment's "down" button is disabled.
  await expect(page.getByTestId("segment-reorder-down-seg-2")).toHaveAttribute(
    "aria-disabled",
    "true",
  );

  // 3. Move the first segment down. After this, seg-1 should be at index 1
  //    and seg-2 at index 0.
  await page.getByTestId("segment-reorder-down-seg-1").click();

  // 4. Move it back up.
  await page.getByTestId("segment-reorder-up-seg-2").click();

  // 5. Exit edit mode.
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
  await page.getByTestId("segment-editor-delete-seg-1").click();

  // After the delete, the editor list should still be visible (it doesn't
  // navigate away). The remaining segment is seg-2.
  await expect(page.getByTestId("trail-segment-edit-list")).toBeVisible();
  await expect(page.getByTestId("segment-editor-seg-2")).toBeVisible();

  await page.getByTestId("segment-edit-exit").click();
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
  await expect(page.getByTestId("segment-editor-road-seg-1")).toBeVisible();
  await expect(page.getByTestId("segment-editor-steep-seg-1")).toBeVisible();
  await expect(page.getByTestId("segment-editor-oneway-seg-1")).toBeVisible();
  await expect(page.getByTestId("segment-editor-road-seg-2")).toBeVisible();
  await expect(page.getByTestId("segment-editor-steep-seg-2")).toBeVisible();
  await expect(page.getByTestId("segment-editor-oneway-seg-2")).toBeVisible();

  // 2. Select a different surface type for seg-1 and save.
  await page.getByTestId("segment-editor-surface-gravel-seg-1").click();
  await page.getByTestId("segment-editor-save-seg-1").click();
  await expect(page.getByTestId("segment-editor-seg-1")).toBeVisible();

  // 3. Exit edit mode.
  await page.getByTestId("segment-edit-exit").click();
  await expect(page.getByTestId("trail-detail-screen")).toBeVisible();
});
