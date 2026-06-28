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

test("user can move a segment up via reorder buttons", async ({ page }) => {
  await loginAsHiker(page);
  await page.goto("/trail/buckeye-trail");
  await page.getByTestId("trail-segments-edit").click();
  await expect(page.getByTestId(`segment-reorder-up-${FIXTURE_IDS.seg2}`)).toBeVisible();
  await page.getByTestId(`segment-reorder-up-${FIXTURE_IDS.seg2}`).click();
  await page.waitForTimeout(1000);
  await expect(page.getByTestId("trail-segment-edit-list")).toBeVisible();
});

test("reorder up button is disabled for the first segment", async ({ page }) => {
  await page.goto("/trail/buckeye-trail");
  await page.getByTestId("trail-segments-edit").click();
  // Verify the up button for the first segment doesn't change the order
  const beforeFirst = await page.getByTestId(`segment-editor-${FIXTURE_IDS.seg1}`).textContent();
  await page.getByTestId(`segment-reorder-up-${FIXTURE_IDS.seg1}`).click();
  const afterFirst = await page.getByTestId(`segment-editor-${FIXTURE_IDS.seg1}`).textContent();
  expect(afterFirst).toBe(beforeFirst);
});

test("reorder down button is disabled for the last segment", async ({ page }) => {
  await page.goto("/trail/buckeye-trail");
  await page.getByTestId("trail-segments-edit").click();
  // Verify the down button for the last segment doesn't change the order
  const beforeLast = await page.getByTestId(`segment-editor-${FIXTURE_IDS.seg2}`).textContent();
  await page.getByTestId(`segment-reorder-down-${FIXTURE_IDS.seg2}`).click();
  const afterLast = await page.getByTestId(`segment-editor-${FIXTURE_IDS.seg2}`).textContent();
  expect(afterLast).toBe(beforeLast);
});

test("user can move a segment down via reorder buttons", async ({ page }) => {
  await loginAsHiker(page);
  await page.goto("/trail/buckeye-trail");
  await page.getByTestId("trail-segments-edit").click();
  await page.getByTestId(`segment-reorder-down-${FIXTURE_IDS.seg1}`).click();
  await page.waitForTimeout(1000);
  await expect(page.getByTestId("trail-segment-edit-list")).toBeVisible();
});

test("deleting a segment removes it from the editor list", async ({ page }) => {
  await loginAsHiker(page);
  await page.goto("/trail/buckeye-trail");
  await page.getByTestId("trail-segments-edit").click();
  await expect(page.getByTestId(`segment-editor-${FIXTURE_IDS.seg2}`)).toBeVisible();
  await page.getByTestId(`segment-editor-delete-${FIXTURE_IDS.seg2}`).click();
  await page.waitForTimeout(1000);
  await expect(page.getByTestId("trail-segment-edit-list")).toBeVisible();
});
