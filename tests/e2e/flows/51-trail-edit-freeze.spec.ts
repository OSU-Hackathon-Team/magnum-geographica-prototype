import { test, expect, type Page } from "@playwright/test";
import { installApi, resetApi } from "../helpers/api.js";

test.beforeEach(async ({ page }) => {
  await installApi(page);
});

test.afterEach(() => {
  resetApi();
});

async function loginAsAdmin(page: Page) {
  await page.goto("/auth/login");
  await page.getByTestId("login-email").fill("admin@example.com");
  await page.getByTestId("login-password").fill("adminpass");
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/explore$/);
}

test.describe("Trail edit details (§21.6)", () => {
  test("navigates to edit form from trail detail", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/trail/buckeye-trail");
    await expect(page.getByTestId("trail-edit-details")).toBeVisible();
    await page.getByTestId("trail-edit-details").click();
    await expect(page).toHaveURL(/\/trail\/buckeye-trail\/edit$/);
  });

  test("edit form pre-fills trail name", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/trail/buckeye-trail/edit");
    await expect(page.getByTestId("edit-trail-name")).toBeVisible();
    const input = page.getByTestId("edit-trail-name");
    await expect(input).not.toHaveValue("");
  });

  test("changes difficulty and saves", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/trail/buckeye-trail/edit");
    await page.getByTestId("edit-trail-difficulty-hard").click();
    await page.getByTestId("edit-trail-save").click();
    await expect(page).toHaveURL(/\/trail\/buckeye-trail/);
  });

  test("saves provenance fields", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/trail/buckeye-trail/edit");
    await page.getByTestId("edit-trail-source").fill("NPS-Official");
    await page.getByTestId("edit-trail-source-date").fill("2025-01-15");
    await page.getByTestId("edit-trail-url").fill("https://nps.gov/trail");
    await page.getByTestId("edit-trail-save").click();
    await expect(page).toHaveURL(/\/trail\/buckeye-trail/);
  });
});

test.describe("Trail freeze / unfreeze (§21.6)", () => {
  test("synthesized trail shows Freeze button for admin", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/trail/buckeye-trail");
    await expect(page.getByTestId("trail-freeze")).toBeVisible();
  });

  test("clicking Freeze promotes trail to elevated", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/trail/buckeye-trail");
    await page.getByTestId("trail-freeze").click();
    await page.waitForTimeout(1000);
    await expect(page.getByTestId("trail-tier-badge-elevated")).toBeVisible();
    await expect(page.getByTestId("trail-unfreeze")).toBeVisible();
  });

  test("clicking Unfreeze demotes trail back to synthesized", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/trail/buckeye-trail");
    // First freeze (synthesized → elevated)
    await page.getByTestId("trail-freeze").click();
    await page.waitForTimeout(1000);
    await expect(page.getByTestId("trail-tier-badge-elevated")).toBeVisible();
    // Then unfreeze (elevated → synthesized)
    await page.getByTestId("trail-unfreeze").click();
    await page.waitForTimeout(1000);
    await expect(page.getByTestId("trail-tier-badge-synthesized")).toBeVisible();
    await expect(page.getByTestId("trail-freeze")).toBeVisible();
  });

  test("premium trail does not show freeze or unfreeze", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/trail/hocking-hills-indian-run");
    await expect(page.getByTestId("trail-freeze")).not.toBeVisible();
    await expect(page.getByTestId("trail-unfreeze")).not.toBeVisible();
  });

  test("elevated trail shows Unfreeze button", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/trail/towpath-trail");
    await expect(page.getByTestId("trail-unfreeze")).toBeVisible();
  });
});
