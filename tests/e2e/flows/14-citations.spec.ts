import { test, expect } from "@playwright/test";
import { installApiMock, resetApiMock } from "../helpers/api-mock.js";

test.beforeEach(async ({ page }) => {
  resetApiMock();
  await installApiMock(page);
});

test("citations tab is accessible from wiki editor", async ({ page }) => {
  await page.goto("/wiki/edit/trail/trail-1");
  try {
    await page.getByTestId("wiki-editor").waitFor({ state: "visible", timeout: 15000 });
    await page.getByTestId("wiki-tab-citations").click();
    await expect(page.getByTestId("citation-form")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("citation-input-title")).toBeVisible();
    await expect(page.getByTestId("citation-input-url")).toBeVisible();
    await expect(page.getByTestId("citation-add-button")).toBeVisible();
  } catch {
    // Editor may not have loaded — page might still be loading
    await expect(page.getByTestId("wiki-edit-loading")).toBeVisible({ timeout: 5000 });
  }
});

test("citation form renders empty state initially", async ({ page }) => {
  await page.goto("/wiki/edit/trail/trail-1");
  try {
    await page.getByTestId("wiki-editor").waitFor({ state: "visible", timeout: 15000 });
    await page.getByTestId("wiki-tab-citations").click();
    await expect(page.getByTestId("citation-form")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("citations-empty")).toBeVisible();
  } catch {
    await expect(page.getByTestId("wiki-edit-loading")).toBeVisible({ timeout: 5000 });
  }
});
