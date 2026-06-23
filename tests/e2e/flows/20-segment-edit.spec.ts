import { test, expect } from "@playwright/test";
import { installApiMock, resetApiMock } from "../helpers/api-mock.js";

test.beforeEach(async ({ page }) => {
  resetApiMock();
  await installApiMock(page);
});

test("trail detail shows Edit Segments button", async ({ page }) => {
  await page.goto("/trail/buckeye-trail");
  await expect(page.getByTestId("trail-detail-screen")).toBeVisible();
  await expect(page.getByTestId("trail-segments-edit")).toBeVisible();
});

test("entering edit mode shows segment editors for each segment", async ({ page }) => {
  await page.goto("/trail/buckeye-trail");
  await expect(page.getByTestId("trail-detail-screen")).toBeVisible();
  await page.getByTestId("trail-segments-edit").click();
  await expect(page.getByTestId("trail-segment-edit-list")).toBeVisible();
  await expect(page.getByTestId("segment-editor-seg-1")).toBeVisible();
  await expect(page.getByTestId("segment-editor-seg-2")).toBeVisible();
  await expect(page.getByTestId("segment-edit-exit")).toBeVisible();
});

test("segment editor has surface, hazards, and toggle fields", async ({ page }) => {
  await page.goto("/trail/buckeye-trail");
  await page.getByTestId("trail-segments-edit").click();
  await expect(page.getByTestId("segment-editor-seg-1")).toBeVisible();
  await expect(page.getByTestId("segment-editor-surface-natural-seg-1")).toBeVisible();
  await expect(page.getByTestId("segment-editor-hazard-steep-seg-1")).toBeVisible();
  await expect(page.getByTestId("segment-editor-steep-seg-1")).toBeVisible();
  await expect(page.getByTestId("segment-editor-road-seg-1")).toBeVisible();
  await expect(page.getByTestId("segment-editor-oneway-seg-1")).toBeVisible();
});

test("user can edit a segment name and save it", async ({ page }) => {
  await page.goto("/trail/buckeye-trail");
  await page.getByTestId("trail-segments-edit").click();
  await expect(page.getByTestId("segment-editor-seg-1")).toBeVisible();
  await page.getByTestId("segment-editor-name-seg-1").fill("Renamed segment");
  await page.getByTestId("segment-editor-save-seg-1").click();
  // save triggers a PUT and the editor should remain visible
  await expect(page.getByTestId("segment-editor-seg-1")).toBeVisible();
});

test("user can toggle hazards on a segment", async ({ page }) => {
  await page.goto("/trail/buckeye-trail");
  await page.getByTestId("trail-segments-edit").click();
  await expect(page.getByTestId("segment-editor-seg-2")).toBeVisible();
  await page.getByTestId("segment-editor-hazard-muddy-seg-2").click();
  await page.getByTestId("segment-editor-save-seg-2").click();
  await expect(page.getByTestId("segment-editor-seg-2")).toBeVisible();
});

test("exiting edit mode returns to the trail detail view", async ({ page }) => {
  await page.goto("/trail/buckeye-trail");
  await page.getByTestId("trail-segments-edit").click();
  await expect(page.getByTestId("trail-segment-edit-list")).toBeVisible();
  await page.getByTestId("segment-edit-exit").click();
  await expect(page.getByTestId("trail-detail-screen")).toBeVisible();
});
