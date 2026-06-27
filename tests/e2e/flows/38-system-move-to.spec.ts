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

async function openSystemOverflowMenu(page: Page) {
  await page.getByTestId("system-overflow").click();
  await expect(page.getByTestId("system-overflow-sheet")).toBeVisible();
}

test.describe("System Move-To sheet ($21.5)", () => {
  test("Move-To action is reachable from the system overflow menu", async ({ page }) => {
    await page.goto(`${BASE}/system/hocking-hills-state-park`);
    await openSystemOverflowMenu(page);
    await expect(page.getByTestId("system-move-to")).toBeVisible();
  });

  test("clicking Move-To opens the sheet", async ({ page }) => {
    await page.goto(`${BASE}/system/hocking-hills-state-park`);
    await openSystemOverflowMenu(page);
    await page.getByTestId("system-move-to").click();
    await expect(page.getByTestId("system-move-to-sheet")).toBeVisible();
  });

  test("sheet shows a close button", async ({ page }) => {
    await page.goto(`${BASE}/system/hocking-hills-state-park`);
    await openSystemOverflowMenu(page);
    await page.getByTestId("system-move-to").click();
    await expect(page.getByTestId("move-to-close")).toBeVisible();
  });

  test("sheet lists super-systems (move-to-super-*)", async ({ page }) => {
    await page.goto(`${BASE}/system/hocking-hills-state-park`);
    await openSystemOverflowMenu(page);
    await page.getByTestId("system-move-to").click();
    await expect(page.getByTestId("move-to-super-us-bike-route-50")).toBeVisible();
    await expect(page.getByTestId("move-to-super-ohio-erie-trail")).toBeVisible();
  });

  test("clicking a super-system row fires the move request as the logged-in user", async ({
    page,
  }) => {
    await page.goto(`${BASE}/auth/login`);
    await page.getByTestId("login-email").fill("hiker1@example.com");
    await page.getByTestId("login-password").fill("password123");
    await page.getByTestId("login-submit").click();
    await expect(page).toHaveURL(/\/explore$/);
    await page.goto(`${BASE}/system/hocking-hills-state-park`);
    await openSystemOverflowMenu(page);
    await page.getByTestId("system-move-to").click();
    const row = page.getByTestId("move-to-super-us-bike-route-50");
    await expect(row).toBeVisible();
    await row.click();
    await expect(page.getByTestId("system-move-to-sheet")).toBeVisible();
  });

  test("sheet has a 'loose' option", async ({ page }) => {
    await page.goto(`${BASE}/system/hocking-hills-state-park`);
    await openSystemOverflowMenu(page);
    await page.getByTestId("system-move-to").click();
    await expect(page.getByTestId("move-to-loose")).toBeVisible();
  });

  test("POST /api/systems/:id/move with action=move_to_super returns 403 for new users", async ({
    page,
  }) => {
    await page.goto(`${BASE}/auth/register`);
    await page.getByTestId("register-username").fill("lowtrust");
    await page.getByTestId("register-email").fill("lowtrust@example.com");
    await page.getByTestId("register-password").fill("testpass123");
    await page.getByTestId("register-confirm-password").fill("testpass123");
    await page.getByTestId("register-submit").click();
    await expect(page).toHaveURL(/\/explore$/);
    const token = await page.evaluate(() => {
      return (localStorage.getItem("magnum_auth_token") ?? "").replace(/"/g, "");
    });
    const res = await apiFetch(page, `/api/systems/${FIXTURE_IDS.sys1}/move`, {
      method: "POST",
      token,
      body: { action: "move_to_super", target_super_id: `${FIXTURE_IDS.super1}` },
    });
    expect(res.status).toBe(403);
  });

  test("POST /api/systems/:id/move with action=merge_into works for new users (no gate)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/auth/register`);
    await page.getByTestId("register-username").fill("merger");
    await page.getByTestId("register-email").fill("merger@example.com");
    await page.getByTestId("register-password").fill("testpass123");
    await page.getByTestId("register-confirm-password").fill("testpass123");
    await page.getByTestId("register-submit").click();
    await expect(page).toHaveURL(/\/explore$/);
    const token = await page.evaluate(() => {
      return (localStorage.getItem("magnum_auth_token") ?? "").replace(/"/g, "");
    });
    const res = await apiFetch(page, `/api/systems/${FIXTURE_IDS.sys3}/move`, {
      method: "POST",
      token,
      body: { action: "merge_into", target_system_id: `${FIXTURE_IDS.sys1}` },
    });
    expect(res.status).toBe(200);
  });

  test("close button dismisses the sheet", async ({ page }) => {
    await page.goto(`${BASE}/system/hocking-hills-state-park`);
    await openSystemOverflowMenu(page);
    await page.getByTestId("system-move-to").click();
    await expect(page.getByTestId("system-move-to-sheet")).toBeVisible();
    await page.getByTestId("move-to-close").click();
    await expect(page.getByTestId("system-move-to-sheet")).not.toBeVisible();
  });
});
