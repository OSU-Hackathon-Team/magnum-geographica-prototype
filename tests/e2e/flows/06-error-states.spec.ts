import { test, expect } from "@playwright/test";
import { installApi } from "../helpers/api.js";

test.beforeEach(async ({ page }) => {
  await installApi(page);
});

test("404 on unknown system shows the error state", async ({ page }) => {
  await page.goto("/system/does-not-exist");
  await expect(page.getByTestId("system-detail-error")).toBeVisible();
});

test("404 on unknown trail shows the error state", async ({ page }) => {
  await page.goto("/trail/does-not-exist");
  await expect(page.getByTestId("trail-detail-error")).toBeVisible();
});

test("API down -> systems list shows empty state, not a crash", async ({ page }) => {
  // Make every API call fail with 500 to simulate the API being down.
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"boom"}' }),
  );
  await page.goto("/systems");
  await expect(page.getByTestId("systems-empty")).toBeVisible();
});

test("API down -> profile still loads (no required network call)", async ({ page }) => {
  // The profile screen doesn't require a network call to render.
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"boom"}' }),
  );
  await page.goto("/profile");
  await expect(page.getByTestId("profile-screen")).toBeVisible();
});
