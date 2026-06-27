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

const SAMPLE_LINE = JSON.stringify({
  type: "LineString",
  coordinates: [
    [-82.99, 39.96],
    [-82.98, 39.97],
    [-82.97, 39.98],
  ],
});

test.describe("Admin — Premium import page (§21.6 phase 2)", () => {
  test("dashboard exposes the Premium Import link", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/dashboard`);
    await expect(page.getByTestId("admin-link-import")).toBeVisible();
  });

  test("import form has all required fields", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/import`);
    await expect(page.getByTestId("import-name")).toBeVisible();
    await expect(page.getByTestId("import-slug")).toBeVisible();
    await expect(page.getByTestId("import-system")).toBeVisible();
    await expect(page.getByTestId("import-geojson")).toBeVisible();
    await expect(page.getByTestId("import-submit")).toBeVisible();
  });

  test("difficulty chips render with the 4 levels", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/import`);
    await expect(page.getByTestId("import-difficulty-easy")).toBeVisible();
    await expect(page.getByTestId("import-difficulty-moderate")).toBeVisible();
    await expect(page.getByTestId("import-difficulty-hard")).toBeVisible();
    await expect(page.getByTestId("import-difficulty-expert")).toBeVisible();
  });

  test("submitting valid form shows success banner with the created trail", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/import`);
    await page.getByTestId("import-name").fill("Bear Creek");
    await page.getByTestId("import-slug").fill("bear-creek");
    await page.getByTestId("import-system").fill(`${FIXTURE_IDS.sys1}`);
    await page.getByTestId("import-geojson").fill(SAMPLE_LINE);
    await page.getByTestId("import-submit").click();
    // Success banner shows the trail name + tier.
    await expect(page.getByTestId("import-success")).toBeVisible();
    await expect(page.getByTestId("import-success")).toContainText("Bear Creek");
  });

  test("POST /api/admin/trails/import returns 201 with the new trail (admin)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/explore`);
    const reg = await apiFetch(page, "/api/__test/register", {
      method: "POST",
      body: {
        username: "adminimp",
        email: "adminimp@example.com",
        password: "testpass123",
        role: "admin",
        trust_score: 999,
      },
    });
    expect(reg.status).toBe(201);
    const { access_token } = reg.body as { access_token: string };
    const res = await apiFetch(page, "/api/admin/trails/import", {
      method: "POST",
      token: access_token,
      body: {
        name: "Eagle Ridge",
        slug: "eagle-ridge",
        system_id: `${FIXTURE_IDS.sys2}`,
        difficulty: "hard",
        geometry: JSON.parse(SAMPLE_LINE),
      },
    });
    expect([200, 201]).toContain(res.status);
    const body = res.body as { id: string; tier: string; slug: string };
    expect(body.tier).toBe("premium");
    expect(body.slug).toBe("eagle-ridge");
  });

  test("POST /api/admin/trails/import rejects non-admin callers with 403", async ({ page }) => {
    // Register a regular user (low trust).
    await page.goto(`${BASE}/auth/register`);
    await page.getByTestId("register-username").fill("lowimp");
    await page.getByTestId("register-email").fill("lowimp@example.com");
    await page.getByTestId("register-password").fill("testpass123");
    await page.getByTestId("register-confirm-password").fill("testpass123");
    await page.getByTestId("register-submit").click();
    await expect(page).toHaveURL(/\/explore$/);
    const token = await page.evaluate(() => {
      return (localStorage.getItem("magnum_auth_token") ?? "").replace(/"/g, "");
    });
    const res = await apiFetch(page, "/api/admin/trails/import", {
      method: "POST",
      token,
      body: {
        name: "Bad",
        slug: "bad-trail",
        system_id: `${FIXTURE_IDS.sys1}`,
        geometry: JSON.parse(SAMPLE_LINE),
      },
    });
    expect([401, 403]).toContain(res.status);
  });
});
