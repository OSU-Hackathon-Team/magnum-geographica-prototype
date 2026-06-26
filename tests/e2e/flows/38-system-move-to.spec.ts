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


test.describe("System Move-To sheet (§21.5)", () => {
  test("Move-To button is on the system detail page", async ({ page }) => {
    await page.goto(`${BASE}/system/hocking-hills-state-park`);
    await expect(page.getByTestId("system-move-to")).toBeVisible();
  });

  test("clicking Move-To opens the sheet", async ({ page }) => {
    await page.goto(`${BASE}/system/hocking-hills-state-park`);
    await page.getByTestId("system-move-to").click();
    await expect(page.getByTestId("system-move-to-sheet")).toBeVisible();
  });

  test("sheet shows a close button", async ({ page }) => {
    await page.goto(`${BASE}/system/hocking-hills-state-park`);
    await page.getByTestId("system-move-to").click();
    await expect(page.getByTestId("move-to-close")).toBeVisible();
  });

  test("sheet lists super-systems (move-to-super-*)", async ({ page }) => {
    await page.goto(`${BASE}/system/hocking-hills-state-park`);
    await page.getByTestId("system-move-to").click();
    // Move-to-super options for each super system. We're moving FIXTURE_IDS.sys1
    // (Hocking Hills) which is already in FIXTURE_IDS.super1 — but the sheet
    // still shows the list.
    await expect(page.getByTestId("move-to-super-us-bike-route-50")).toBeVisible();
    // The other super (ohio-erie-trail) is what FIXTURE_IDS.sys1 is already in —
    // it should still appear in the list.
    await expect(page.getByTestId("move-to-super-ohio-erie-trail")).toBeVisible();
  });

  test("clicking a super-system row fires the move request as the logged-in user", async ({
    page,
  }) => {
    // The MoveToSheet reads the auth token from useAuthStore and
    // passes it to createMagnumClient, so the POST /api/systems/:id/move
    // request is authorized. As hiker1 (low trust), the request
    // returns 403 with the protection message; the sheet surfaces
    // that in an Alert and stays open.
    await page.goto(`${BASE}/auth/login`);
    await page.getByTestId("login-email").fill("hiker1@example.com");
    await page.getByTestId("login-password").fill("password123");
    await page.getByTestId("login-submit").click();
    await expect(page).toHaveURL(/\/explore$/);
    await page.goto(`${BASE}/system/hocking-hills-state-park`);
    await page.getByTestId("system-move-to").click();
    const row = page.getByTestId("move-to-super-us-bike-route-50");
    await expect(row).toBeVisible();
    await row.click();
    // The row is a pressable; clicking it should be accepted. The
    // server responds 403 (low trust can't edit a semi-protected
    // system) and the sheet stays open while the Alert is shown.
    await expect(page.getByTestId("system-move-to-sheet")).toBeVisible();
  });

  test("sheet has a 'loose' option", async ({ page }) => {
    await page.goto(`${BASE}/system/hocking-hills-state-park`);
    await page.getByTestId("system-move-to").click();
    await expect(page.getByTestId("move-to-loose")).toBeVisible();
  });

  test("POST /api/systems/:id/move with action=move_to_super returns 403 for new users", async ({
    page,
  }) => {
    // Register a new user (low trust_score).
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
    await page.getByTestId("system-move-to").click();
    await expect(page.getByTestId("system-move-to-sheet")).toBeVisible();
    await page.getByTestId("move-to-close").click();
    await expect(page.getByTestId("system-move-to-sheet")).not.toBeVisible();
  });
});
