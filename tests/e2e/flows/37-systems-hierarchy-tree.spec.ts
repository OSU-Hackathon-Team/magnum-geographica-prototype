import { test, expect, type Page } from "@playwright/test";
import { installApi, resetApi, apiFetch } from "../helpers/api.js";
import { FIXTURE_SLUGS } from "../fixtures/ids.js";

const BASE = "http://localhost:4173";

test.beforeEach(async ({ page }) => {
  await installApi(page);
});

test.afterEach(() => {
  resetApi();
});


test.describe("Systems hierarchy (unified in Systems tab, §21.5)", () => {
  test("seeded super-systems render as groups in the systems list", async ({ page }) => {
    await page.goto(`${BASE}/systems`);
    await expect(page.getByTestId("systems-screen")).toBeVisible();
    // Wait for data to load: the first system card must be visible.
    await expect(page.getByTestId("system-card-hocking-hills-state-park")).toBeVisible();
    // FIXTURE_IDS.super1 = "ohio-erie-trail" → slug "ohio-erie-trail".
    await expect(page.getByTestId("systems-group-ohio-erie-trail")).toBeVisible();
    // US Bike Route 50 has no child systems, so it is filtered from the UI.
  });

  test("systems in a super-system are listed under it", async ({ page }) => {
    await page.goto(`${BASE}/systems`);
    // FIXTURE_IDS.sys1 = "hocking-hills-state-park" should appear in the systems tab.
    await expect(page.getByTestId("system-card-hocking-hills-state-park")).toBeVisible();
  });

  test("clicking a system card navigates to detail", async ({ page }) => {
    await page.goto(`${BASE}/systems`);
    await page.getByTestId("system-card-hocking-hills-state-park").click();
    await expect(page).toHaveURL(/\/system\/hocking-hills-state-park$/);
  });

  test("the systems tab has a New button", async ({ page }) => {
    await page.goto(`${BASE}/systems`);
    await expect(page.getByTestId("systems-new")).toBeVisible();
  });

  test("search filters systems by name", async ({ page }) => {
    await page.goto(`${BASE}/systems`);
    // Wait for data to load before searching.
    await expect(page.getByTestId("system-card-hocking-hills-state-park")).toBeVisible();
    await page.getByTestId("systems-search").fill("hocking");
    // Should still show hocking hills.
    await expect(page.getByTestId("system-card-hocking-hills-state-park")).toBeVisible();
    // Should not show wayne.
    await expect(page.getByTestId("system-card-wayne-national-forest")).not.toBeVisible();
  });

  test("search with no matches shows empty state", async ({ page }) => {
    await page.goto(`${BASE}/systems`);
    // Wait for data to load before searching.
    await expect(page.getByTestId("system-card-hocking-hills-state-park")).toBeVisible();
    await page.getByTestId("systems-search").fill("zzznoresults");
    await expect(page.getByTestId("systems-empty").first()).toBeVisible();
  });

  test("tree endpoint returns the expected shape", async ({ page }) => {
    await page.goto(`${BASE}/explore`);
    const res = await apiFetch(page, "/api/systems/tree");
    expect(res.status).toBe(200);
    const raw = res.body as
      | { nodes?: Array<{ id: string; slug: string; children: Array<{ id: string; slug: string; children: unknown[] }> }> }
      | Array<{ id: string; slug: string; children: Array<{ id: string; slug: string; children: unknown[] }> }>;
    const body = Array.isArray(raw) ? raw : (raw.nodes ?? []);
    expect(body.length).toBeGreaterThanOrEqual(2);
    const sup1 = body.find((b) => b.slug === FIXTURE_SLUGS.super1);
    expect(sup1).toBeDefined();
    expect(sup1?.children.length).toBeGreaterThanOrEqual(1);
  });
});
