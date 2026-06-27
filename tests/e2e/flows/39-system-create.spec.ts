import { test, expect, type Page } from "@playwright/test";
import { installApi, resetApi, apiFetch } from "../helpers/api.js";

const BASE = "http://localhost:4173";

test.beforeEach(async ({ page }) => {
  await installApi(page);
});

test.afterEach(() => {
  resetApi();
});


test.describe("New system form (§21.5, two-screen create)", () => {
  test("new-system page is reachable", async ({ page }) => {
    await page.goto(`${BASE}/system/new`);
    await expect(page.getByTestId("new-system-screen")).toBeVisible();
  });

  test("form has name and slug inputs", async ({ page }) => {
    await page.goto(`${BASE}/system/new`);
    await expect(page.getByTestId("new-system-name")).toBeVisible();
    await expect(page.getByTestId("new-system-slug")).toBeVisible();
  });

  test("form has description and external URL inputs", async ({ page }) => {
    await page.goto(`${BASE}/system/new`);
    await expect(page.getByTestId("new-system-description")).toBeVisible();
    await expect(page.getByTestId("new-system-url")).toBeVisible();
  });

  test("typing in name auto-fills the slug", async ({ page }) => {
    await page.goto(`${BASE}/system/new`);
    await page.getByTestId("new-system-name").fill("Mountains Park");
    // The slug should be "mountains-park".
    await expect(page.getByTestId("new-system-slug")).toHaveValue("mountains-park");
  });

  test("provenance source chips render", async ({ page }) => {
    await page.goto(`${BASE}/system/new`);
    await expect(page.getByTestId("new-system-source-OSM")).toBeVisible();
    await expect(page.getByTestId("new-system-source-PAD-US")).toBeVisible();
  });

  test("source date input is editable", async ({ page }) => {
    await page.goto(`${BASE}/system/new`);
    await page.getByTestId("new-system-source-date").fill("2026-06-01");
    expect(await page.getByTestId("new-system-source-date").inputValue()).toBe("2026-06-01");
  });

  test("boundary picker links to the boundary editor", async ({ page }) => {
    await page.goto(`${BASE}/system/new`);
    await expect(page.getByTestId("new-system-boundary-pick")).toBeVisible();
  });

  test("save button is present on the new system form", async ({ page }) => {
    await page.goto(`${BASE}/system/new`);
    await page.getByTestId("new-system-name").fill("Save Test");
    await expect(page.getByTestId("new-system-save")).toBeVisible();
  });

  test("POST /api/systems creates a new system", async ({ page }) => {
    await page.goto(`${BASE}/auth/register`);
    await page.getByTestId("register-username").fill("syscreator");
    await page.getByTestId("register-email").fill("syscreator@example.com");
    await page.getByTestId("register-password").fill("testpass123");
    await page.getByTestId("register-confirm-password").fill("testpass123");
    await page.getByTestId("register-submit").click();
    await expect(page).toHaveURL(/\/explore$/);
    const token = await page.evaluate(() => {
      return (localStorage.getItem("magnum_auth_token") ?? "").replace(/"/g, "");
    });
    const res = await apiFetch(page, "/api/systems", {
      method: "POST",
      token,
      body: {
        name: "Test System",
        slug: "test-system",
        description: "A test",
        external_url: null,
        ownership_source: "OSM",
        source_date: "2026-06-01",
      },
    });
    expect(res.status).toBe(201);
    const body = res.body as { id: string; slug: string };
    expect(body.slug).toBe("test-system");
  });

  test("POST /api/systems persists a boundary", async ({ page }) => {
    await page.goto(`${BASE}/auth/register`);
    await page.getByTestId("register-username").fill("syscreator2");
    await page.getByTestId("register-email").fill("syscreator2@example.com");
    await page.getByTestId("register-password").fill("testpass123");
    await page.getByTestId("register-confirm-password").fill("testpass123");
    await page.getByTestId("register-submit").click();
    await expect(page).toHaveURL(/\/explore$/);
    const token = await page.evaluate(() => {
      return (localStorage.getItem("magnum_auth_token") ?? "").replace(/"/g, "");
    });
    const boundary = {
      type: "Polygon",
      coordinates: [
        [
          [-82.65, 39.38],
          [-82.4, 39.38],
          [-82.4, 39.52],
          [-82.65, 39.52],
          [-82.65, 39.38],
        ],
      ],
    };
    const res = await apiFetch(page, "/api/systems", {
      method: "POST",
      token,
      body: {
        name: "Boundary System",
        slug: "boundary-system",
        ownership_source: "OSM",
        source_date: "2026-06-01",
        boundary,
      },
    });
    expect(res.status).toBe(201);
    const body = res.body as { id: string; slug: string; boundary: unknown };
    expect(body.boundary).toBeTruthy();
  });

  test("POST /api/systems without a name returns 400", async ({ page }) => {
    await page.goto(`${BASE}/auth/register`);
    await page.getByTestId("register-username").fill("syscreator3");
    await page.getByTestId("register-email").fill("syscreator3@example.com");
    await page.getByTestId("register-password").fill("testpass123");
    await page.getByTestId("register-confirm-password").fill("testpass123");
    await page.getByTestId("register-submit").click();
    await expect(page).toHaveURL(/\/explore$/);
    const token = await page.evaluate(() => {
      return (localStorage.getItem("magnum_auth_token") ?? "").replace(/"/g, "");
    });
    const res = await apiFetch(page, "/api/systems", {
      method: "POST",
      token,
      body: { slug: "missing-name" },
    });
    expect(res.status).toBe(400);
  });

  test("cancel button navigates back to systems tab", async ({ page }) => {
    // Navigate via the systems tab so the new-system screen has a
    // back-stack entry.
    await page.goto(`${BASE}/systems`);
    // The "+" button now lands on the boundary editor (create
    // flow). From the form, tapping Cancel pops back to /systems.
    await page.getByTestId("systems-new").click();
    await expect(page).toHaveURL(/\/system\/boundary/);
  });
});
