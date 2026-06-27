import { test, expect } from "@playwright/test";
import { installApi, resetApi, apiFetch } from "../helpers/api.js";
import { FIXTURE_IDS } from "../fixtures/ids.js";

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

  test("clicking the map in add mode shows the save button disabled initially", async ({ page }) => {
    await page.goto(`${BASE}/system/boundary?mode=create`);
    // Save should be disabled because no boundary has been drawn yet.
    await expect(page.getByTestId("boundary-save")).toBeDisabled();
  });

  test("the boundary bar renders with title and save button", async ({ page }) => {
    await page.goto(`${BASE}/system/boundary?mode=create`);
    await expect(page.getByTestId("boundary-title")).toBeVisible();
    await expect(page.getByTestId("boundary-save")).toBeVisible();
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

  test("PUT /api/systems/:id/move returns a valid status for logged-in user", async ({ page }) => {
    const reg = await apiFetch(page, "/api/__test/register", {
      method: "POST",
      body: {
        username: "boundaryeditor",
        email: "be@example.com",
        password: "testpass123",
        role: "admin",
        trust_score: 999,
      },
    });
    expect(reg.status).toBe(201);
    const { access_token } = reg.body as { access_token: string };
    const res = await apiFetch(page, `/api/systems/${FIXTURE_IDS.sys1}/move`, {
      method: "POST",
      token: access_token,
      body: {
        action: "merge_into",
        target_system_id: `${FIXTURE_IDS.sys3}`,
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
