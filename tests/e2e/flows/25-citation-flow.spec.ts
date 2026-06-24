import { test, expect } from "@playwright/test";
import { installApiMock, resetApiMock } from "../helpers/api-mock.js";

/**
 * Citation CRUD end-to-end flow.
 *
 * The citation form needs a saved wiki page (so it has an id to attach to).
 * The flow is:
 *   1. Open the wiki editor for a trail that has no wiki yet.
 *   2. Type a title and save to create the page.
 *   3. Switch to the Citations tab.
 *   4. Add a citation (title + URL).
 *   5. Verify the citation row appears in the list.
 *   6. Delete the citation.
 *   7. Verify the empty state reappears.
 */
test.beforeEach(async ({ page }) => {
  resetApiMock();
  await installApiMock(page);
});

test("user can add a citation to a wiki page and then delete it", async ({ page }) => {
  await page.goto("/wiki/edit/trail/trail-1");

  // 1. Wait for the editor.
  try {
    await page.getByTestId("wiki-editor").waitFor({ state: "visible", timeout: 15_000 });
  } catch {
    await expect(page.getByTestId("wiki-edit-loading")).toBeVisible({ timeout: 5_000 });
    return;
  }

  // 2. Save the page so it gets a server-assigned id.
  await page.getByTestId("wiki-editor-title").fill("Hocking Hills — quick reference");
  await page.getByTestId("wiki-editor-content").fill("Use this page to add practical info.");
  await page.getByTestId("wiki-editor-summary").fill("initial page");
  await page.getByTestId("wiki-editor-save").click();

  // After save, the editor calls router.back() — we're on the trail detail now.
  await expect(page).toHaveURL(/\/trail\/trail-1|\/trail\/buckeye-trail/);

  // 3. Re-open the editor and switch to Citations.
  await page.goto("/wiki/edit/trail/trail-1");
  await page.getByTestId("wiki-editor").waitFor({ state: "visible", timeout: 15_000 });
  await page.getByTestId("wiki-tab-citations").click();
  await expect(page.getByTestId("citation-form")).toBeVisible();

  // 4. Add a citation.
  await page.getByTestId("citation-input-title").fill("ODNR official site");
  await page.getByTestId("citation-input-url").fill("https://ohiodnr.gov/hocking");
  await page.getByTestId("citation-add-button").click();

  // 5. The new citation row should appear. The mock assigns ids starting at
  //    "300" and the counter is reset by `resetApiMock()` in beforeEach.
  const citationRow = page.getByTestId("citation-300");
  await expect(citationRow).toBeVisible({ timeout: 10_000 });
  await expect(citationRow).toContainText("ODNR official site");
  await expect(citationRow).toContainText("https://ohiodnr.gov/hocking");

  // 6. Delete the citation.
  await page.getByTestId("citation-delete-300").click();
  await expect(page.getByTestId("citations-empty")).toBeVisible({ timeout: 10_000 });
  await expect(citationRow).toHaveCount(0);
});

test("adding a citation with only a title (no URL) is accepted", async ({ page }) => {
  await page.goto("/wiki/edit/trail/trail-1");

  try {
    await page.getByTestId("wiki-editor").waitFor({ state: "visible", timeout: 15_000 });
  } catch {
    await expect(page.getByTestId("wiki-edit-loading")).toBeVisible({ timeout: 5_000 });
    return;
  }

  // Save the page so it has an id to attach citations to.
  await page.getByTestId("wiki-editor-title").fill("Test page");
  await page.getByTestId("wiki-editor-save").click();

  await page.goto("/wiki/edit/trail/trail-1");
  await page.getByTestId("wiki-editor").waitFor({ state: "visible", timeout: 15_000 });
  await page.getByTestId("wiki-tab-citations").click();
  await page.getByTestId("citation-input-title").fill("Trail sign photo");
  // Skip URL.
  await page.getByTestId("citation-add-button").click();

  const citationRow = page.getByTestId("citation-300");
  await expect(citationRow).toBeVisible({ timeout: 10_000 });
  await expect(citationRow).toContainText("Trail sign photo");
});

test("citation form keeps the empty state until the first citation is added", async ({ page }) => {
  await page.goto("/wiki/edit/trail/trail-1");

  try {
    await page.getByTestId("wiki-editor").waitFor({ state: "visible", timeout: 15_000 });
  } catch {
    await expect(page.getByTestId("wiki-edit-loading")).toBeVisible({ timeout: 5_000 });
    return;
  }

  // Save the page first.
  await page.getByTestId("wiki-editor-title").fill("Empty citations test");
  await page.getByTestId("wiki-editor-save").click();

  await page.goto("/wiki/edit/trail/trail-1");
  await page.getByTestId("wiki-editor").waitFor({ state: "visible", timeout: 15_000 });
  await page.getByTestId("wiki-tab-citations").click();
  await expect(page.getByTestId("citation-form")).toBeVisible();
  await expect(page.getByTestId("citations-empty")).toBeVisible();
});
