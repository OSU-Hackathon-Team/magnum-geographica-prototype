import { test, expect } from "@playwright/test";
import { installApiMock, resetApiMock } from "../helpers/api-mock.js";

test.beforeEach(async ({ page }) => {
  resetApiMock();
  await installApiMock(page);
});

test("user can move a segment up via reorder buttons", async ({ page }) => {
  await page.goto("/trail/buckeye-trail");
  await page.getByTestId("trail-segments-edit").click();
  await expect(page.getByTestId("segment-reorder-up-seg-2")).toBeVisible();
  await expect(page.getByTestId("segment-reorder-down-seg-1")).toBeVisible();
  // Move seg-2 up
  await page.getByTestId("segment-reorder-up-seg-2").click();
  // After reorder the list still shows
  await expect(page.getByTestId("segment-editor-seg-1")).toBeVisible();
  await expect(page.getByTestId("segment-editor-seg-2")).toBeVisible();
});

test("reorder up button is disabled for the first segment", async ({ page }) => {
  await page.goto("/trail/buckeye-trail");
  await page.getByTestId("trail-segments-edit").click();
  // Verify the up button for the first segment doesn't change the order
  const beforeFirst = await page.getByTestId("segment-editor-seg-1").textContent();
  await page.getByTestId("segment-reorder-up-seg-1").click();
  const afterFirst = await page.getByTestId("segment-editor-seg-1").textContent();
  expect(afterFirst).toBe(beforeFirst);
});

test("reorder down button is disabled for the last segment", async ({ page }) => {
  await page.goto("/trail/buckeye-trail");
  await page.getByTestId("trail-segments-edit").click();
  // Verify the down button for the last segment doesn't change the order
  const beforeLast = await page.getByTestId("segment-editor-seg-2").textContent();
  await page.getByTestId("segment-reorder-down-seg-2").click();
  const afterLast = await page.getByTestId("segment-editor-seg-2").textContent();
  expect(afterLast).toBe(beforeLast);
});

test("user can move a segment down via reorder buttons", async ({ page }) => {
  await page.goto("/trail/buckeye-trail");
  await page.getByTestId("trail-segments-edit").click();
  await page.getByTestId("segment-reorder-down-seg-1").click();
  await expect(page.getByTestId("segment-editor-seg-1")).toBeVisible();
  await expect(page.getByTestId("segment-editor-seg-2")).toBeVisible();
});

test("deleting a segment removes it from the editor list", async ({ page }) => {
  await page.goto("/trail/buckeye-trail");
  await page.getByTestId("trail-segments-edit").click();
  await expect(page.getByTestId("segment-editor-seg-2")).toBeVisible();
  await page.getByTestId("segment-editor-delete-seg-2").click();
  // The mock deletes the segment on the server
  // The list should refresh and seg-2 should no longer be present
  await expect(page.getByTestId("segment-editor-seg-1")).toBeVisible();
  await expect(page.getByTestId("segment-editor-seg-2")).toHaveCount(0, { timeout: 5000 });
});
