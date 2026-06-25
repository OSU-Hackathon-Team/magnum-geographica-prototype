import { test, expect, type Page } from "@playwright/test";
import { installApiMock, resetApiMock } from "../helpers/api-mock.js";

const BASE = "http://localhost:4173";

test.beforeEach(async ({ page }) => {
  await installApiMock(page);
});

test.afterEach(() => {
  resetApiMock();
});

async function browserFetch(
  page: Page,
  path: string,
  init: { method?: string; body?: unknown; token?: string } = {},
): Promise<{ status: number; body: unknown }> {
  return page.evaluate(
    async ({ path, method, body, token }) => {
      const res = await fetch(`http://localhost:9999${path}`, {
        method: method ?? "GET",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      let json: unknown = null;
      try {
        json = await res.json();
      } catch {
        // ignore
      }
      return { status: res.status, body: json };
    },
    { path, method: init.method, body: init.body, token: init.token },
  );
}

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
    // super-1 = "ohio-erie-trail" → slug "ohio-erie-trail".
    await expect(page.getByTestId("tree-super-ohio-erie-trail")).toBeVisible();
    await expect(page.getByTestId("tree-super-us-bike-route-50")).toBeVisible();
  });

  test("clicking a super-system expands/collapses it", async ({ page }) => {
    await page.goto(`${BASE}/systems/tree`);
    const sup = page.getByTestId("tree-super-ohio-erie-trail");
    await sup.click();
    // After expanding, the children (sys-1, sys-2) should be visible.
    await expect(page.getByTestId("tree-system-hocking-hills-state-park")).toBeVisible();
  });

  test("system rows have a toggle button when they have sub-systems", async ({ page }) => {
    await page.goto(`${BASE}/systems/tree`);
    const sup = page.getByTestId("tree-super-ohio-erie-trail");
    await sup.click();
    // sys-1 (hocking-hills-state-park) has sub-1 and sub-2 — toggle should appear.
    await expect(page.getByTestId("tree-system-toggle-hocking-hills-state-park")).toBeVisible();
  });

  test("clicking the toggle shows sub-systems", async ({ page }) => {
    await page.goto(`${BASE}/systems/tree`);
    await page.getByTestId("tree-super-ohio-erie-trail").click();
    await page.getByTestId("tree-system-toggle-hocking-hills-state-park").click();
    // sub-1 = "old-mans-cave-area", sub-2 = "ash-cave-area".
    await expect(page.getByTestId("tree-sub-old-mans-cave-area")).toBeVisible();
  });

  test("tree endpoint returns the expected shape", async ({ page }) => {
    await page.goto(`${BASE}/explore`);
    const res = await browserFetch(page, "/api/systems/tree");
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
