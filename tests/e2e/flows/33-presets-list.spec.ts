import { test, expect, type Page } from "@playwright/test";
import { installApi, resetApi, apiFetch } from "../helpers/api.js";

const BASE = "http://localhost:4173";

test.beforeEach(async ({ page }) => {
  await installApi(page);
});

test.afterEach(() => {
  resetApi();
});

/** Login as the seeded admin. */
async function loginAsAdmin(page: Page) {
  await page.goto(`${BASE}/auth/login`);
  await page.getByTestId("login-email").fill("admin@example.com");
  await page.getByTestId("login-password").fill("adminpass");
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/explore$/);
}


test.describe("Admin presets list (§21.4)", () => {
  test("admin can open the presets index", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/presets`);
    await expect(page.getByTestId("admin-presets")).toBeVisible();
    // 23 seeded presets render as admin-preset-<key> cards.
    await expect(page.getByTestId("admin-preset-bench")).toBeVisible();
    await expect(page.getByTestId("admin-preset-viewpoint")).toBeVisible();
  });

  test("presets list shows the count in the heading", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/presets`);
    await expect(page.getByText(/Presets \(23\)/)).toBeVisible();
  });

  test("presets list has a New button", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/presets`);
    await expect(page.getByTestId("admin-preset-new")).toBeVisible();
  });

  test("each preset card has Edit and Delete controls", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/presets`);
    await expect(page.getByTestId("admin-preset-edit-bench")).toBeVisible();
    await expect(page.getByTestId("admin-preset-delete-bench")).toBeVisible();
  });

  test("category filter via query param", async ({ page }) => {
    // Verify the unfiltered list has the expected count first.
    const all = await apiFetch(page, "/api/presets");
    expect(all.status).toBe(200);
    const allBody = all.body as { items: unknown[]; total: number };
    expect(allBody.total).toBe(23);

    const res = await apiFetch(page, "/api/presets?category=landmarks");
    expect(res.status).toBe(200);
    const body = res.body as { items: Array<{ key: string; category: string }>; total: number };
    // The fixture seeds 6 landmark presets (viewpoint, notable_tree,
    // waterfall, cave_entrance, bridge, tunnel). Filtering must return
    // a non-empty subset and every item must have the requested
    // category.
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.total).toBe(body.items.length);
    expect(body.items.every((p) => p.category === "landmarks")).toBe(true);
    // Total is strictly less than the unfiltered list (the filter
    // actually narrows the result).
    expect(body.total).toBeLessThan(allBody.total);
  });

  test("non-admin user redirected from /admin/presets", async ({ page }) => {
    await page.goto(`${BASE}/auth/register`);
    await page.getByTestId("register-username").fill("reguser");
    await page.getByTestId("register-email").fill("reguser@example.com");
    await page.getByTestId("register-password").fill("testpass123");
    await page.getByTestId("register-confirm-password").fill("testpass123");
    await page.getByTestId("register-submit").click();
    await expect(page).toHaveURL(/\/explore$/);
    await page.goto(`${BASE}/admin/presets`);
    await expect(page).toHaveURL(/\/explore$/);
  });
});
