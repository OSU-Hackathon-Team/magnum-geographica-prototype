import { test, expect } from "@playwright/test";
import { installApi, resetApi } from "../helpers/api.js";
import { FIXTURE_IDS } from "../fixtures/ids.js";

test.beforeEach(async ({ page }) => {
  resetApi();
  await installApi(page);
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
  await expect(page.getByTestId(`segment-editor-${FIXTURE_IDS.seg1}`)).toBeVisible();
  await expect(page.getByTestId(`segment-editor-${FIXTURE_IDS.seg2}`)).toBeVisible();
  await expect(page.getByTestId("segment-edit-exit")).toBeVisible();
});

test("segment editor has surface, hazards, and toggle fields", async ({ page }) => {
  await page.goto("/trail/buckeye-trail");
  await page.getByTestId("trail-segments-edit").click();
  await expect(page.getByTestId(`segment-editor-${FIXTURE_IDS.seg1}`)).toBeVisible();
  await expect(page.getByTestId(`segment-editor-surface-natural-${FIXTURE_IDS.seg1}`)).toBeVisible();
  await expect(page.getByTestId(`segment-editor-hazard-steep-${FIXTURE_IDS.seg1}`)).toBeVisible();
  await expect(page.getByTestId(`segment-editor-steep-${FIXTURE_IDS.seg1}`)).toBeVisible();
  await expect(page.getByTestId(`segment-editor-road-${FIXTURE_IDS.seg1}`)).toBeVisible();
  await expect(page.getByTestId(`segment-editor-oneway-${FIXTURE_IDS.seg1}`)).toBeVisible();
});

test("user can edit a segment name and save it", async ({ page }) => {
  await page.goto("/trail/buckeye-trail");
  await page.getByTestId("trail-segments-edit").click();
  await expect(page.getByTestId(`segment-editor-${FIXTURE_IDS.seg1}`)).toBeVisible();
  await page.getByTestId(`segment-editor-name-${FIXTURE_IDS.seg1}`).fill("Renamed segment");
  await page.getByTestId(`segment-editor-save-${FIXTURE_IDS.seg1}`).click();
  await page.waitForTimeout(2000);
  await expect(page.getByTestId(`segment-editor-${FIXTURE_IDS.seg1}`)).toBeVisible({ timeout: 10000 });
});

test("user can toggle hazards on a segment", async ({ page }) => {
  await page.goto("/trail/buckeye-trail");
  await page.getByTestId("trail-segments-edit").click();
  await expect(page.getByTestId(`segment-editor-${FIXTURE_IDS.seg2}`)).toBeVisible();
  await page.getByTestId(`segment-editor-hazard-muddy-${FIXTURE_IDS.seg2}`).click();
  await page.getByTestId(`segment-editor-save-${FIXTURE_IDS.seg2}`).click();
  await page.waitForTimeout(2000);
  await expect(page.getByTestId(`segment-editor-${FIXTURE_IDS.seg2}`)).toBeVisible({ timeout: 10000 });
});

test("exiting edit mode returns to the trail detail view", async ({ page }) => {
  await page.goto("/trail/buckeye-trail");
  await page.getByTestId("trail-segments-edit").click();
  await expect(page.getByTestId("trail-segment-edit-list")).toBeVisible();
  await page.getByTestId("segment-edit-exit").click();
  await expect(page.getByTestId("trail-detail-screen")).toBeVisible();
});
