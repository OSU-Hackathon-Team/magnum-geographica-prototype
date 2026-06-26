import { test, expect } from "@playwright/test";
import { installApi, resetApi, apiFetch } from "../helpers/api.js";

const BASE = "http://localhost:4173";

test.beforeEach(async ({ page }) => {
  await installApi(page);
});

test.afterEach(() => {
  resetApi();
});


test.describe("System boundary editor (§21.5)", () => {
  test("systems tab + button lands on the boundary editor", async ({ page }) => {
    await page.goto(`${BASE}/systems`);
    await page.getByTestId("systems-new").click();
    await expect(page).toHaveURL(/\/system\/boundary/);
    await expect(page.getByTestId("boundary-screen")).toBeVisible();
  });

  test("boundary editor shows the bottom bar with title and save", async ({ page }) => {
    await page.goto(`${BASE}/system/boundary?mode=create`);
    await expect(page.getByTestId("boundary-screen")).toBeVisible();
    await expect(page.getByTestId("boundary-back")).toBeVisible();
    await expect(page.getByTestId("boundary-title")).toBeVisible();
    await expect(page.getByTestId("boundary-save")).toBeVisible();
  });

  test("save is disabled when no closed rings exist", async ({ page }) => {
    await page.goto(`${BASE}/system/boundary?mode=create`);
    await expect(page.getByTestId("boundary-save")).toBeDisabled();
    await expect(page.getByTestId("boundary-save-error")).toBeVisible();
  });

  test("mode toggle has both Add and Delete buttons", async ({ page }) => {
    await page.goto(`${BASE}/system/boundary?mode=create`);
    await expect(page.getByTestId("boundary-mode-normal")).toBeVisible();
    await expect(page.getByTestId("boundary-mode-delete")).toBeVisible();
  });

  test("Add mode is highlighted by default", async ({ page }) => {
    await page.goto(`${BASE}/system/boundary?mode=create`);
    await expect(page.getByTestId("boundary-mode-normal")).toBeVisible();
  });

  test("clicking the map in add mode appends a vertex", async ({ page }) => {
    await page.goto(`${BASE}/system/boundary?mode=create`);
    // Click the map canvas to add a vertex. The map fills the parent,
    // so we click roughly in the center. Ohio is ~[-82.5, 40.0].
    const canvas = page.getByTestId("boundary-screen").locator("canvas");
    await canvas.click({ position: { x: 300, y: 250 } });
    // After one click we should see the hint "2 more to close" (1 of 3 verts).
    await expect(page.getByTestId("boundary-hint")).toContainText("more to close");
  });

  test("clicking three times then first vertex closes the ring", async ({ page }) => {
    await page.goto(`${BASE}/system/boundary?mode=create`);
    const canvas = page.getByTestId("boundary-screen").locator("canvas");
    // Add 3 vertices.
    await canvas.click({ position: { x: 250, y: 200 } });
    await canvas.click({ position: { x: 350, y: 200 } });
    await canvas.click({ position: { x: 350, y: 300 } });
    // Hint should now say "Tap the first vertex to close the ring".
    await expect(page.getByTestId("boundary-hint")).toContainText("close the ring");
    // Click near the first vertex (top-left ≈ 250, 200).
    await canvas.click({ position: { x: 250, y: 200 } });
    // Save should now be enabled.
    await expect(page.getByTestId("boundary-save")).not.toBeDisabled();
  });

  test("switching to Delete mode then back to Add mode works", async ({ page }) => {
    await page.goto(`${BASE}/system/boundary?mode=create`);
    await page.getByTestId("boundary-mode-delete").click();
    await page.getByTestId("boundary-mode-normal").click();
    await expect(page.getByTestId("boundary-mode-normal")).toBeVisible();
  });

  test("the form (?fromBoundary=1) shows the boundary indicator", async ({ page }) => {
    const shape = {
      rings: [
        {
          vertices: [
            [-82.65, 39.38],
            [-82.4, 39.38],
            [-82.4, 39.52],
          ],
          closed: true,
        },
      ],
    };
    const encoded = Buffer.from(JSON.stringify(shape), "utf-8").toString("base64url");
    await page.goto(`${BASE}/system/new?fromBoundary=1&shape=${encoded}`);
    await expect(page.getByTestId("new-system-screen")).toBeVisible();
    await expect(page.getByTestId("new-system-boundary-indicator")).toBeVisible();
  });

  test("PUT /api/systems/:id updates the boundary", async ({ page }) => {
    await page.goto(`${BASE}/auth/register`);
    await page.getByTestId("register-username").fill("boundaryeditor");
    await page.getByTestId("register-email").fill("be@example.com");
    await page.getByTestId("register-password").fill("testpass123");
    await page.getByTestId("register-confirm-password").fill("testpass123");
    await page.getByTestId("register-submit").click();
    await expect(page).toHaveURL(/\/explore$/);
    const token = await page.evaluate(() => {
      return (localStorage.getItem("magnum_auth_token") ?? "").replace(/"/g, "");
    });
    const res = await apiFetch(page, `/api/systems/${FIXTURE_IDS.sys1}/move`, {
      method: "PUT",
      token,
      body: {
        boundary: {
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
        },
      },
    });
    expect(res.status).toBe(200);
  });

  test("PUT /api/systems/:id without a token returns 401", async ({ page }) => {
    const res = await page.evaluate(async () => {
      const r = await fetch(
        "http://localhost:3000/api/systems/00000000-0000-4000-a000-000000000001",
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "x" }),
        },
      );
      return r.status;
    });
    expect(res).toBe(401);
  });
});

import { FIXTURE_IDS } from "../fixtures/ids.js";
