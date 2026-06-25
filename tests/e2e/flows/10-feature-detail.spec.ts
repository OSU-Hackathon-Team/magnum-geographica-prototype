import { test, expect } from "@playwright/test";
import { installApi } from "../helpers/api.js";
import { FIXTURE_IDS } from "../fixtures/ids.js";

const BASE = "http://localhost:4173";

test.beforeEach(async ({ page }) => {
  await installApi(page);
});

test("user opens a feature detail page and sees its name and type", async ({ page }) => {
  await page.goto(`${BASE}/feature/FIXTURE_IDS.f1`);

  await expect(page.getByTestId("feature-detail-screen")).toBeVisible();
  await expect(page.getByTestId("feature-name")).toHaveText("Old Man's Cave");
  await expect(page.getByTestId("feature-meta")).toBeVisible();
  await expect(page.getByText(/scenic/i)).toBeVisible();
});

test("unknown feature id shows the error state", async ({ page }) => {
  await page.goto(`${BASE}/feature/does-not-exist`);
  await expect(page.getByTestId("feature-detail-error")).toBeVisible();
});

test("tapping a feature card on a trail detail page navigates to feature detail", async ({
  page,
}) => {
  await page.goto(`${BASE}/trail/buckeye-trail`);
  await page.getByTestId(`trail-feature-${FIXTURE_IDS.f1}`).click();
  await expect(page).toHaveURL(/\/feature\/FIXTURE_IDS.f1$/);
  await expect(page.getByTestId("feature-detail-screen")).toBeVisible();
});

test("feature detail shows the vote control", async ({ page }) => {
  await page.goto(`${BASE}/feature/FIXTURE_IDS.f1`);
  await expect(page.getByTestId("feature-vote")).toBeVisible();
  await expect(page.getByTestId("feature-vote-up")).toBeVisible();
  await expect(page.getByTestId("feature-vote-down")).toBeVisible();
});

test("feature detail shows the View on map button", async ({ page }) => {
  await page.goto(`${BASE}/feature/FIXTURE_IDS.f1`);
  await expect(page.getByTestId("feature-view-on-map")).toBeVisible();
});

test("feature FIXTURE_IDS.f4 (with preset) renders the preset label", async ({ page }) => {
  await page.goto(`${BASE}/feature/FIXTURE_IDS.f4`);
  await expect(page.getByTestId("feature-preset-label")).toBeVisible();
  await expect(page.getByTestId("feature-preset-label")).toHaveText("Viewpoint");
});

