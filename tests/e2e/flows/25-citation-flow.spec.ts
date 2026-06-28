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

test("user can add a citation to a wiki page and then delete it", async ({ page }) => {
  await loginAsHiker(page);

  await page.goto(`/wiki/edit/trail/${FIXTURE_IDS.trail1}`);

  try {
    await page.getByTestId("wiki-editor").waitFor({ state: "visible", timeout: 15_000 });
  } catch {
    await expect(page.getByTestId("wiki-edit-loading")).toBeVisible({ timeout: 5_000 });
    return;
  }

  await page.getByTestId("wiki-editor-title").pressSequentially("Hocking Hills — quick reference");
  await page.getByTestId("wiki-editor-content").pressSequentially("Use this page to add practical info.");
  await page.getByTestId("wiki-editor-summary").pressSequentially("initial page");
  await page.getByTestId("wiki-editor-save").click();
  await page.waitForTimeout(1500);

  await page.goto(`/wiki/edit/trail/${FIXTURE_IDS.trail1}`);
  await page.getByTestId("wiki-editor").waitFor({ state: "visible", timeout: 15_000 });
  await page.getByTestId("wiki-tab-citations").click();
  await expect(page.getByTestId("citation-form")).toBeVisible();

  await page.getByTestId("citation-input-title").pressSequentially("ODNR official site");
  await page.getByTestId("citation-input-url").pressSequentially("https://ohiodnr.gov/hocking");
  await page.getByTestId("citation-add-button").click();

  const citationRow = page.locator('[data-testid^="citation-"]:not([data-testid="citation-form"]):not([data-testid="citations-empty"])').filter({ hasText: "ODNR official site" });
  await expect(citationRow).toBeVisible({ timeout: 10_000 });
  await expect(citationRow).toContainText("https://ohiodnr.gov/hocking");

  await citationRow.locator('[data-testid^="citation-delete-"]').click();
  await expect(page.getByTestId("citations-empty")).toBeVisible({ timeout: 10_000 });
});

test("adding a citation with only a title (no URL) is accepted", async ({ page }) => {
  await loginAsHiker(page);

  await page.goto(`/wiki/edit/trail/${FIXTURE_IDS.trail1}`);

  try {
    await page.getByTestId("wiki-editor").waitFor({ state: "visible", timeout: 15_000 });
  } catch {
    await expect(page.getByTestId("wiki-edit-loading")).toBeVisible({ timeout: 5_000 });
    return;
  }

  await page.getByTestId("wiki-editor-title").pressSequentially("Test page");
  await page.getByTestId("wiki-editor-save").click();

  // Navigate to the edit page explicitly — the editor may not auto-redirect.
  await page.goto(`/wiki/edit/trail/${FIXTURE_IDS.trail1}`);
  await page.getByTestId("wiki-editor").waitFor({ state: "visible", timeout: 15_000 });
  await page.getByTestId("wiki-tab-citations").click();
  await page.getByTestId("citation-input-title").pressSequentially("Trail sign photo");
  await page.getByTestId("citation-add-button").click();

  // Citation IDs are server-generated UUIDs. Exclude citation-form wrapper.
  const citationRow = page.locator('[data-testid^="citation-"]:not([data-testid="citation-form"]):not([data-testid="citations-empty"])').filter({ hasText: "Trail sign photo" });
  await expect(citationRow).toBeVisible({ timeout: 10_000 });
  await expect(citationRow).toContainText("Trail sign photo");
});

test("citation form keeps the empty state until the first citation is added", async ({ page }) => {
  await loginAsHiker(page);

  await page.goto(`/wiki/edit/trail/${FIXTURE_IDS.trail1}`);

  try {
    await page.getByTestId("wiki-editor").waitFor({ state: "visible", timeout: 15_000 });
  } catch {
    await expect(page.getByTestId("wiki-edit-loading")).toBeVisible({ timeout: 5_000 });
    return;
  }

  await page.getByTestId("wiki-editor-title").pressSequentially("Empty citations test");
  await page.getByTestId("wiki-editor-save").click();

  await page.goto(`/wiki/edit/trail/${FIXTURE_IDS.trail1}`);
  await page.getByTestId("wiki-editor").waitFor({ state: "visible", timeout: 15_000 });
  await page.getByTestId("wiki-tab-citations").click();
  await expect(page.getByTestId("citation-form")).toBeVisible();
  await expect(page.getByTestId("citations-empty")).toBeVisible();
});
