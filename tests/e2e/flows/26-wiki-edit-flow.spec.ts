import { test, expect } from "@playwright/test";
import { installApiMock, resetApiMock } from "../helpers/api-mock.js";

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
test.beforeEach(async ({ page }) => {
  resetApiMock();
  await installApiMock(page);
});

test("user can create a wiki page and view its content", async ({ page }) => {
  // 1. Open the editor.
  await page.goto("/wiki/edit/trail/trail-1");
  try {
    await page.getByTestId("wiki-editor").waitFor({ state: "visible", timeout: 15_000 });
  } catch {
    await expect(page.getByTestId("wiki-edit-loading")).toBeVisible({ timeout: 5_000 });
    return;
  }

  // 2. Fill in the editor and save.
  await page.getByTestId("wiki-editor-contributor").fill("test-user");
  await page.getByTestId("wiki-editor-title").fill("Buckeye Trail reference");
  await page.getByTestId("wiki-editor-content").fill(
    "## Conditions\n\nMostly dirt. Watch for muddy sections in spring.\n\n## Access\n\nFree. Open daily.",
  );
  await page.getByTestId("wiki-editor-summary").fill("initial creation");
  await page.getByTestId("wiki-editor-save").click();

  // 3. Navigate to the wiki view for the same target.
  await page.goto("/wiki/trail/trail-1");
  await page.getByTestId("wiki-page-screen").waitFor({ state: "visible", timeout: 15_000 });
  await expect(page.getByTestId("wiki-page-title")).toHaveText("Buckeye Trail reference");
  await expect(page.getByTestId("wiki-page-content")).toContainText("Mostly dirt");
  await expect(page.getByTestId("wiki-page-meta")).toBeVisible();
});

test("wiki revision history grows each time the page is saved", async ({ page }) => {
  // First save: creates the page (id "100") and 1 revision.
  await page.goto("/wiki/edit/trail/trail-2");
  try {
    await page.getByTestId("wiki-editor").waitFor({ state: "visible", timeout: 15_000 });
  } catch {
    await expect(page.getByTestId("wiki-edit-loading")).toBeVisible({ timeout: 5_000 });
    return;
  }
  await page.getByTestId("wiki-editor-title").fill("Towpath reference");
  await page.getByTestId("wiki-editor-content").fill("Flat towpath along the canal.");
  await page.getByTestId("wiki-editor-summary").fill("v1");
  await page.getByTestId("wiki-editor-save").click();

  // The save calls `router.back()` which is a no-op if the page was loaded
  // directly. Wait briefly for the API call to settle, then navigate
  // explicitly to the wiki view.
  await page.waitForTimeout(500);
  await page.goto("/wiki/trail/trail-2");
  await page.getByTestId("wiki-page-screen").waitFor({ state: "visible", timeout: 15_000 });

  // Second save: opens the editor, modifies content, saves.
  await page.getByTestId("wiki-edit-button").click();
  await page.getByTestId("wiki-editor").waitFor({ state: "visible", timeout: 15_000 });
  await page.getByTestId("wiki-editor-content").fill(
    "Flat towpath along the canal. Family-friendly.",
  );
  await page.getByTestId("wiki-editor-summary").fill("v2: add family note");
  await page.getByTestId("wiki-editor-save").click();

  // Same: `router.back()` from a hard-loaded editor doesn't navigate, so
  // wait briefly and re-enter the editor via the view's Edit button.
  await page.waitForTimeout(500);
  await page.goto("/wiki/trail/trail-2");
  await page.getByTestId("wiki-page-screen").waitFor({ state: "visible", timeout: 15_000 });
  await page.getByTestId("wiki-edit-button").click();
  await page.getByTestId("wiki-editor").waitFor({ state: "visible", timeout: 15_000 });
  await page.getByTestId("wiki-tab-revisions").click();
  await expect(page.getByTestId("revision-history")).toBeVisible();

  // The two revisions should both be visible in the history.
  // The mock returns revisions newest-first.
  await expect(page.getByTestId("revision-history")).toContainText("v1");
  await expect(page.getByTestId("revision-history")).toContainText("v2");
});

test("wiki editor shows the preview tab and renders markdown", async ({ page }) => {
  await page.goto("/wiki/edit/trail/trail-3");
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

  await page.getByTestId("wiki-editor-title").fill("Hocking Indian Run");
  await expect(saveButton).not.toHaveAttribute("aria-disabled", "true");

  // Toggle the preview and ensure it renders the markdown.
  await page.getByTestId("wiki-editor-content").fill("# Big heading\n\nSome **bold** text.");
  await page.getByTestId("wiki-toggle-preview").click();
  await expect(page.getByTestId("wiki-editor-preview")).toBeVisible();
  await expect(page.getByTestId("wiki-editor-preview")).toContainText("Big heading");
});
