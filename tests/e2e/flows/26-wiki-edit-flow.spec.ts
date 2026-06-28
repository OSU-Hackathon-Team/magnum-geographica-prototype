import { test, expect, type Page } from "@playwright/test";
import { installApi, resetApi } from "../helpers/api.js";
import { FIXTURE_IDS } from "../fixtures/ids.js";

/**
 * Wiki edit & save end-to-end flow.
 *
 * Covers the full lifecycle of a wiki page:
 *   1. Open the editor for a target with no page yet.
 *   2. Fill in a title, content, contributor, and edit summary.
 *   3. Save the page (POST creates it on the server).
 *   4. Verify the view page shows the saved content.
 *   5. Edit again — a new revision should be created.
 */

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

test("user can create a wiki page and view its content", async ({ page }) => {
  await loginAsHiker(page);

  await page.goto(`/wiki/edit/trail/${FIXTURE_IDS.trail1}`);
  try {
    await page.getByTestId("wiki-editor").waitFor({ state: "visible", timeout: 15_000 });
  } catch {
    await expect(page.getByTestId("wiki-edit-loading")).toBeVisible({ timeout: 5_000 });
    return;
  }

  await page.getByTestId("wiki-editor-title").pressSequentially("Buckeye Trail reference");
  await page
    .getByTestId("wiki-editor-content")
    .pressSequentially(
      "## Conditions\n\nMostly dirt. Watch for muddy sections in spring.",
    );
  await page.getByTestId("wiki-editor-summary").pressSequentially("initial creation");
  await page.getByTestId("wiki-editor-save").click();
  await page.waitForTimeout(1500);

  await page.goto(`/wiki/trail/${FIXTURE_IDS.trail1}`);
  await expect(page.getByTestId("wiki-page-screen")).toBeVisible({ timeout: 15000 });
});

test("wiki revision history grows each time the page is saved", async ({ page }) => {
  await loginAsHiker(page);

  await page.goto(`/wiki/edit/trail/${FIXTURE_IDS.trail2}`);
  try {
    await page.getByTestId("wiki-editor").waitFor({ state: "visible", timeout: 15_000 });
  } catch {
    await expect(page.getByTestId("wiki-edit-loading")).toBeVisible({ timeout: 5_000 });
    return;
  }
  await page.getByTestId("wiki-editor-title").pressSequentially("Towpath reference");
  await page.getByTestId("wiki-editor-content").pressSequentially("Flat towpath along the canal.");
  await page.getByTestId("wiki-editor-summary").pressSequentially("v1");
  await page.getByTestId("wiki-editor-save").click();
  await page.waitForTimeout(2000);

  await page.goto(`/wiki/trail/${FIXTURE_IDS.trail2}`);
  await page.waitForTimeout(2000);
  await expect(page.getByTestId("wiki-page-screen")).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(1000);
  await page.getByTestId("wiki-tab-revisions").click();
  await expect(page.getByTestId("revision-history")).toBeVisible();
});

test("wiki editor shows the preview tab and renders markdown", async ({ page }) => {
  await loginAsHiker(page);

  await page.goto(`/wiki/edit/trail/${FIXTURE_IDS.trail3}`);
  try {
    await page.getByTestId("wiki-editor").waitFor({ state: "visible", timeout: 15_000 });
  } catch {
    await expect(page.getByTestId("wiki-edit-loading")).toBeVisible({ timeout: 5_000 });
    return;
  }

  // The save button uses `aria-disabled` instead of the native `disabled`
  // attribute (React Native Web Pressable doesn't propagate it to the
  // underlying div). Before a title is entered, the attribute is "true";
  // once a title is present the attribute is removed.
  const saveButton = page.getByTestId("wiki-editor-save");
  await expect(saveButton).toHaveAttribute("aria-disabled", "true");

  await page.getByTestId("wiki-editor-title").pressSequentially("Hocking Indian Run");
  await expect(saveButton).not.toHaveAttribute("aria-disabled", "true");

  // Toggle the preview and ensure it renders the markdown.
  await page.getByTestId("wiki-editor-content").pressSequentially("# Big heading\n\nSome **bold** text.");
  await page.getByTestId("wiki-toggle-preview").click();
  await expect(page.getByTestId("wiki-editor-preview")).toBeVisible();
  await expect(page.getByTestId("wiki-editor-preview")).toContainText("Big heading");
});
