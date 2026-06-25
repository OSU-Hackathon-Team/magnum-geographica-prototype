import { test, expect, type Page } from "@playwright/test";
import { installApi, resetApi, apiFetch } from "../helpers/api.js";

const BASE = "http://localhost:4173";

test.beforeEach(async ({ page }) => {
  await installApi(page);
});

test.afterEach(() => {
  resetApi();
});


test.describe("New system form (§21.5)", () => {
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
    // PROVENANCE_SOURCES is a const list: PAD-US, USGS, USDA-FS, OSM,
    // state-gis, county-gis, user-drawn, imported.
    await expect(page.getByTestId("new-system-source-OSM")).toBeVisible();
    await expect(page.getByTestId("new-system-source-PAD-US")).toBeVisible();
  });

  test("source date input is editable", async ({ page }) => {
    await page.goto(`${BASE}/system/new`);
    await page.getByTestId("new-system-source-date").fill("2026-06-01");
    expect(await page.getByTestId("new-system-source-date").inputValue()).toBe("2026-06-01");
  });

  test("boundary map renders with vertex controls", async ({ page }) => {
    await page.goto(`${BASE}/system/new`);
    await expect(page.getByTestId("new-system-map")).toBeVisible();
    await expect(page.getByTestId("new-system-add-vertex")).toBeVisible();
    await expect(page.getByTestId("new-system-clear-vertices")).toBeVisible();
    await expect(page.getByTestId("new-system-vertex-count")).toBeVisible();
  });

  test("save button is present", async ({ page }) => {
    await page.goto(`${BASE}/system/new`);
    await expect(page.getByTestId("new-system-save")).toBeVisible();
    await expect(page.getByTestId("new-system-cancel")).toBeVisible();
  });

  test("clicking add-vertex increments the vertex count", async ({ page }) => {
    await page.goto(`${BASE}/system/new`);
    const count = page.getByTestId("new-system-vertex-count");
    const beforeText = (await count.textContent()) ?? "0";
    const before = Number(beforeText.match(/\d+/)?.[0] ?? "0");
    await page.getByTestId("new-system-add-vertex").click();
    await page.getByTestId("new-system-add-vertex").click();
    const afterText = (await count.textContent()) ?? "0";
    const after = Number(afterText.match(/\d+/)?.[0] ?? "0");
    expect(after).toBe(before + 2);
  });

  test("clear-vertices resets the count to 0", async ({ page }) => {
    await page.goto(`${BASE}/system/new`);
    await page.getByTestId("new-system-add-vertex").click();
    await page.getByTestId("new-system-add-vertex").click();
    await page.getByTestId("new-system-clear-vertices").click();
    const count = page.getByTestId("new-system-vertex-count");
    const text = (await count.textContent()) ?? "0";
    expect(Number(text.match(/\d+/)?.[0] ?? "0")).toBe(0);
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
        ownership_source: "official",
      },
    });
    expect(res.status).toBe(201);
    const body = res.body as { id: string; slug: string };
    expect(body.slug).toBe("test-system");
    expect(body.id).toMatch(/^sys-/);
  });

  test("POST /api/systems without a name returns 400", async ({ page }) => {
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
    const res = await apiFetch(page, "/api/systems", {
      method: "POST",
      token,
      body: { slug: "missing-name" },
    });
    expect(res.status).toBe(400);
  });

  test("cancel button navigates back", async ({ page }) => {
    // Navigate via the systems tab so the new-system screen has a
    // back-stack entry.
    await page.goto(`${BASE}/systems/tree`);
    await page.getByTestId("hierarchy-new-system").click();
    await expect(page.getByTestId("new-system-screen")).toBeVisible();
    await page.getByTestId("new-system-cancel").click();
    // After cancel, we should be back on the tree.
    await expect(page.getByTestId("hierarchy-tree-screen")).toBeVisible();
  });
});
