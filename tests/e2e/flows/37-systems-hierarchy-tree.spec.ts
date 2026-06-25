import { test, expect, type Page } from "@playwright/test";
import { installApi, resetApi, apiFetch } from "../helpers/api.js";
import { FIXTURE_IDS } from "../fixtures/ids.js";

const BASE = "http://localhost:4173";

test.beforeEach(async ({ page }) => {
  await installApi(page);
});

test.afterEach(() => {
  resetApi();
});


test.describe("Systems hierarchy tree (§21.5)", () => {
  test("tree page is reachable and renders", async ({ page }) => {
    await page.goto(`${BASE}/systems/tree`);
    await expect(page.getByTestId("hierarchy-tree-screen")).toBeVisible();
  });

  test("tree has a New button", async ({ page }) => {
    await page.goto(`${BASE}/systems/tree`);
    await expect(page.getByTestId("hierarchy-new-system")).toBeVisible();
  });

  test("seeded super-systems render as tree-super-* cards", async ({ page }) => {
    await page.goto(`${BASE}/systems/tree`);
    // FIXTURE_IDS.super1 = "ohio-erie-trail" → slug "ohio-erie-trail".
    await expect(page.getByTestId("tree-super-ohio-erie-trail")).toBeVisible();
    await expect(page.getByTestId("tree-super-us-bike-route-50")).toBeVisible();
  });

  test("clicking a super-system expands/collapses it", async ({ page }) => {
    await page.goto(`${BASE}/systems/tree`);
    const sup = page.getByTestId("tree-super-ohio-erie-trail");
    await sup.click();
    // After expanding, the children (FIXTURE_IDS.sys1, FIXTURE_IDS.sys2) should be visible.
    await expect(page.getByTestId("tree-system-hocking-hills-state-park")).toBeVisible();
  });

  test("system rows have a toggle button when they have sub-systems", async ({ page }) => {
    await page.goto(`${BASE}/systems/tree`);
    const sup = page.getByTestId("tree-super-ohio-erie-trail");
    await sup.click();
    // FIXTURE_IDS.sys1 (hocking-hills-state-park) has FIXTURE_IDS.sub1 and FIXTURE_IDS.sub2 — toggle should appear.
    await expect(page.getByTestId("tree-system-toggle-hocking-hills-state-park")).toBeVisible();
  });

  test("clicking the toggle shows sub-systems", async ({ page }) => {
    await page.goto(`${BASE}/systems/tree`);
    await page.getByTestId("tree-super-ohio-erie-trail").click();
    await page.getByTestId("tree-system-toggle-hocking-hills-state-park").click();
    // FIXTURE_IDS.sub1 = "old-mans-cave-area", FIXTURE_IDS.sub2 = "ash-cave-area".
    await expect(page.getByTestId("tree-sub-old-mans-cave-area")).toBeVisible();
  });

  test("tree endpoint returns the expected shape", async ({ page }) => {
    await page.goto(`${BASE}/explore`);
    const res = await apiFetch(page, "/api/systems/tree");
    expect(res.status).toBe(200);
    // The mock returns the tree wrapped in { nodes, total }.
    const raw = res.body as
      | { nodes?: Array<{ id: string; slug: string; children: Array<{ id: string; slug: string; children: unknown[] }> }> }
      | Array<{ id: string; slug: string; children: Array<{ id: string; slug: string; children: unknown[] }> }>;
    const body = Array.isArray(raw) ? raw : (raw.nodes ?? []);
    expect(body.length).toBeGreaterThanOrEqual(2);
    const sup1 = body.find((b) => b.slug === "ohio-erie-trail");
    expect(sup1).toBeDefined();
    expect(sup1?.children.length).toBeGreaterThanOrEqual(1);
  });
});
