import { test, expect } from "@playwright/test";
import { installApi } from "../helpers/api.js";
import { FIXTURE_IDS } from "../fixtures/ids.js";

test.beforeEach(async ({ page }) => {
  await installApi(page);
});

test("media uploader shows input and attach button", async ({ page }) => {
  await page.goto(`/feature/${FIXTURE_IDS.f1}`);
  await expect(page.getByTestId("feature-detail-screen")).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId("feature-media-gallery")).toBeVisible();
});

test("media gallery shows no items initially for a feature", async ({ page }) => {
  await page.goto(`/feature/${FIXTURE_IDS.f1}`);
  await expect(page.getByTestId("feature-detail-screen")).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId("feature-media")).toBeVisible();
});

test("user can view feature detail with wiki section", async ({ page }) => {
  await page.goto(`/feature/${FIXTURE_IDS.f1}`);
  await expect(page.getByTestId("feature-detail-screen")).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId("feature-name")).toHaveText("Old Man's Cave");
  await expect(page.getByTestId("feature-meta")).toBeVisible();
  await expect(page.getByTestId("feature-wiki")).toBeVisible();
});

test("feature detail shows view-on-map button", async ({ page }) => {
  await page.goto(`/feature/${FIXTURE_IDS.f1}`);
  await expect(page.getByTestId("feature-detail-screen")).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId("feature-view-on-map")).toBeVisible();
});

test("user can see wiki edit/create button on feature", async ({ page }) => {
  await page.goto(`/feature/${FIXTURE_IDS.f1}`);
  await expect(page.getByTestId("feature-detail-screen")).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId("feature-wiki-edit")).toBeVisible();
});

test("feature detail shows Add Photo button", async ({ page }) => {
  await page.goto(`/feature/${FIXTURE_IDS.f1}`);
  await expect(page.getByTestId("feature-detail-screen")).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId("feature-media-toggle")).toBeVisible();
});

test("tapping Add Photo shows the uploader component", async ({ page }) => {
  await page.goto(`/feature/${FIXTURE_IDS.f1}`);
  await expect(page.getByTestId("feature-detail-screen")).toBeVisible({ timeout: 10000 });
  await page.getByTestId("feature-media-toggle").click();
  await expect(page.getByTestId("feature-media-uploader")).toBeVisible();
  await expect(page.getByTestId("feature-media-uploader-component")).toBeVisible();
});

test("uploader shows input and attach button", async ({ page }) => {
  await page.goto(`/feature/${FIXTURE_IDS.f1}`);
  await page.getByTestId("feature-media-toggle").click();
  await expect(page.getByTestId("feature-media-uploader-component")).toBeVisible();
  await expect(page.getByTestId("media-uploader-input")).toBeVisible();
  await expect(page.getByTestId("media-uploader-attach")).toBeVisible();
});

test("tapping Cancel hides the uploader", async ({ page }) => {
  await page.goto(`/feature/${FIXTURE_IDS.f1}`);
  await page.getByTestId("feature-media-toggle").click();
  await expect(page.getByTestId("feature-media-uploader")).toBeVisible();
  await page.getByTestId("feature-media-toggle").click();
  await expect(page.getByTestId("feature-media-uploader")).toHaveCount(0);
});
