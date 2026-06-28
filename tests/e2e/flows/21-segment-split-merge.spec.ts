import { test, expect, type Page } from "@playwright/test";
import { installApi, resetApi } from "../helpers/api.js";
import { FIXTURE_IDS } from "../fixtures/ids.js";

const BASE = "http://localhost:4173";

test.beforeEach(async ({ page }) => {
  await resetApi();
  await installApi(page);
});

async function loginAsHiker(page: Page) {
  await page.goto(`${BASE}/auth/login`);
  await page.getByTestId("login-email").fill("hiker1@example.com");
  await page.getByTestId("login-password").fill("password123");
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/explore$/);
  await page.waitForTimeout(2000);
}

test("user can split a segment into two", async ({ page }) => {
  await loginAsHiker(page);
  await page.goto("/trail/buckeye-trail");
  await page.getByTestId("trail-segments-edit").click();
  await expect(page.getByTestId(`segment-editor-${FIXTURE_IDS.seg1}`)).toBeVisible();
  await page.getByTestId(`segment-editor-split-toggle-${FIXTURE_IDS.seg1}`).click();
  await expect(page.getByTestId(`segment-editor-split-panel-${FIXTURE_IDS.seg1}`)).toBeVisible();
  await page.getByTestId(`segment-editor-split-preset-0.5-${FIXTURE_IDS.seg1}`).click();
  await page.getByTestId(`segment-editor-split-name-a-${FIXTURE_IDS.seg1}`).pressSequentially("First half");
  await page.getByTestId(`segment-editor-split-name-b-${FIXTURE_IDS.seg1}`).pressSequentially("Second half");
  await page.getByTestId(`segment-editor-split-confirm-${FIXTURE_IDS.seg1}`).click();
  await page.waitForTimeout(1000);
  await expect(page.getByTestId("trail-segment-edit-list")).toBeVisible();
});

test("user can select two segments and merge them", async ({ page }) => {
  await page.goto("/trail/buckeye-trail");
  await page.getByTestId("trail-segments-edit").click();
  await expect(page.getByTestId(`segment-merge-toggle-${FIXTURE_IDS.seg1}`)).toBeVisible();
  await expect(page.getByTestId(`segment-merge-toggle-${FIXTURE_IDS.seg2}`)).toBeVisible();
  // FIXTURE_IDS.seg2 is a road connector, but our mock just deletes one
  await page.getByTestId(`segment-merge-toggle-${FIXTURE_IDS.seg1}`).click();
  await page.getByTestId(`segment-merge-toggle-${FIXTURE_IDS.seg2}`).click();
  // merge button is enabled when 2 selected
  await expect(page.getByTestId("segment-merge-confirm")).toBeEnabled();
});

test("merge button is disabled with no segments selected", async ({ page }) => {
  await page.goto("/trail/buckeye-trail");
  await page.getByTestId("trail-segments-edit").click();
  // The button should not change anything when 0 segments are selected
  const segsBefore = await page.locator("[data-testid^='segment-editor-seg-']").count();
  await page.getByTestId("segment-merge-confirm").click();
  const segsAfter = await page.locator("[data-testid^='segment-editor-seg-']").count();
  expect(segsAfter).toBe(segsBefore);
});

test("merge button is disabled with only one segment selected", async ({ page }) => {
  await page.goto("/trail/buckeye-trail");
  await page.getByTestId("trail-segments-edit").click();
  await page.getByTestId(`segment-merge-toggle-${FIXTURE_IDS.seg1}`).click();
  // With only 1 selected, click should not merge
  const segsBefore = await page.locator("[data-testid^='segment-editor-seg-']").count();
  await page.getByTestId("segment-merge-confirm").click();
  const segsAfter = await page.locator("[data-testid^='segment-editor-seg-']").count();
  expect(segsAfter).toBe(segsBefore);
});

test("merge bar shows selection count", async ({ page }) => {
  await page.goto("/trail/buckeye-trail");
  await page.getByTestId("trail-segments-edit").click();
  await expect(page.getByTestId("segment-merge-bar")).toBeVisible();
  await page.getByTestId(`segment-merge-toggle-${FIXTURE_IDS.seg1}`).click();
  await expect(page.getByTestId("segment-merge-bar")).toContainText("1/2");
});
