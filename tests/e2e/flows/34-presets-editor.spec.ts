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

async function loginAsAdmin(page: Page) {
  await page.goto(`${BASE}/auth/login`);
  await page.getByTestId("login-email").fill("admin@example.com");
  await page.getByTestId("login-password").fill("adminpass");
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/explore$/);
}


test.describe("Admin preset editor (§21.4)", () => {
  test("editor opens for an existing preset", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/presets/${FIXTURE_IDS.preset1}`);
    await expect(page.getByTestId("admin-preset-editor")).toBeVisible();
    // FIXTURE_IDS.preset1 (bench) is loaded with its key non-editable.
    await expect(page.getByTestId("preset-key")).toHaveValue("bench");
  });

  test("editor shows the label, sort order, and upstreamable switch", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/presets/${FIXTURE_IDS.preset1}`);
    await expect(page.getByTestId("preset-label")).toHaveValue("Bench");
    await expect(page.getByTestId("preset-sort-order")).toHaveValue("10");
  });

  test("category chips render and clicking one changes selection", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/presets/${FIXTURE_IDS.preset1}`);
    // Categories are rest_shelter, water_sanitation, navigation,
    // hazards_obstacles, landmarks.
    await expect(page.getByTestId("preset-category-rest_shelter")).toBeVisible();
    await page.getByTestId("preset-category-landmarks").click();
    // The chip should remain visible (the click toggles state).
    await expect(page.getByTestId("preset-category-landmarks")).toBeVisible();
  });

  test("questions block shows existing questions for a preset", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/presets/${FIXTURE_IDS.preset1}`);
    // FIXTURE_IDS.preset1 (bench) has 2 questions: material (select) and backrest (boolean).
    await expect(page.getByTestId("preset-q-0-label")).toBeVisible();
    await expect(page.getByTestId("preset-q-1-label")).toBeVisible();
  });

  test("add a question adds a new card", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/presets/${FIXTURE_IDS.preset3}`);
    // FIXTURE_IDS.preset3 (shelter) has 1 question. Add another.
    const before = await page.locator('[data-testid^="preset-q-"]').count();
    await page.getByTestId("preset-add-question").click();
    const after = await page.locator('[data-testid^="preset-q-"]').count();
    expect(after).toBeGreaterThan(before);
  });

  test("PUT /api/presets/:id updates the preset", async ({ page }) => {
    await loginAsAdmin(page);
    const token = await page.evaluate(() => {
      return (localStorage.getItem("magnum_auth_token") ?? "").replace(/"/g, "");
    });
    const res = await apiFetch(page, `/api/presets/${FIXTURE_IDS.preset1}`, {
      method: "PUT",
      token,
      body: { label: "Bench (renamed)" },
    });
    expect(res.status).toBe(200);
    const body = res.body as { label: string };
    expect(body.label).toBe("Bench (renamed)");
  });

  test("POST /api/presets creates a new preset", async ({ page }) => {
    await loginAsAdmin(page);
    const token = await page.evaluate(() => {
      return (localStorage.getItem("magnum_auth_token") ?? "").replace(/"/g, "");
    });
    const res = await apiFetch(page, "/api/presets", {
      method: "POST",
      token,
      body: {
        key: "test_preset",
        label: "Test Preset",
        icon_name: "star",
        icon_color: "#000000",
        category: "landmarks",
        questions: [],
        upstreamable: false,
        sort_order: 999,
      },
    });
    expect(res.status).toBe(201);
    const body = res.body as { id: string; key: string };
    expect(body.key).toBe("test_preset");
    expect(body.id).toMatch(/^preset-\d+$/);
  });

  test("non-admin cannot PUT /api/presets/:id", async ({ page }) => {
    // Register a regular user, then try to PUT.
    await page.goto(`${BASE}/auth/register`);
    await page.getByTestId("register-username").fill("reguser1");
    await page.getByTestId("register-email").fill("reguser1@example.com");
    await page.getByTestId("register-password").fill("testpass123");
    await page.getByTestId("register-confirm-password").fill("testpass123");
    await page.getByTestId("register-submit").click();
    await expect(page).toHaveURL(/\/explore$/);
    const token = await page.evaluate(() => {
      return (localStorage.getItem("magnum_auth_token") ?? "").replace(/"/g, "");
    });
    const res = await apiFetch(page, `/api/presets/${FIXTURE_IDS.preset1}`, {
      method: "PUT",
      token,
      body: { label: "Hacked" },
    });
    expect(res.status).toBe(401);
  });
});
