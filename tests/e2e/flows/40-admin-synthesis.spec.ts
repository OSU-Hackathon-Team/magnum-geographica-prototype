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

test.describe("Admin — Synthesis proposals page (§21.6 phase 2)", () => {
  test("dashboard exposes the Synthesis Proposals link", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/dashboard`);
    await expect(page.getByTestId("admin-link-synthesis")).toBeVisible();
  });

  test("synthesis page renders the empty state when no system is set", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/synthesis`);
    await expect(page.getByTestId("synthesis-empty")).toBeVisible();
  });

  test("entering a system id and clicking Load shows seeded proposals", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/synthesis`);
    await page.getByTestId("synthesis-system-input").fill(`${FIXTURE_IDS.sys1}`);
    await page.getByTestId("synthesis-system-set").click();
    // Two seeded proposals (prop-1, prop-2) should appear.
    await expect(page.getByTestId("synthesis-row-prop-1")).toBeVisible();
    await expect(page.getByTestId("synthesis-row-prop-2")).toBeVisible();
  });

  test("tapping a proposal opens the approve/reject modal", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/synthesis`);
    await page.getByTestId("synthesis-system-input").fill(`${FIXTURE_IDS.sys1}`);
    await page.getByTestId("synthesis-system-set").click();
    await page.getByTestId("synthesis-row-prop-1").click();
    // The modal's name input and approve/reject buttons appear.
    await expect(page.getByTestId("synthesis-name")).toBeVisible();
    await expect(page.getByTestId("synthesis-approve")).toBeVisible();
    await expect(page.getByTestId("synthesis-reject")).toBeVisible();
  });

  test("approving a proposal removes it from the list", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/synthesis`);
    await page.getByTestId("synthesis-system-input").fill(`${FIXTURE_IDS.sys1}`);
    await page.getByTestId("synthesis-system-set").click();
    // Verify both seeded proposals are visible.
    await expect(page.getByTestId("synthesis-row-prop-1")).toBeVisible();
    await expect(page.getByTestId("synthesis-row-prop-2")).toBeVisible();
    // Open the approve/reject modal for prop-1.
    await page.getByTestId("synthesis-row-prop-1").click();
    await page.getByTestId("synthesis-name").fill("Approved Trail");
    await page.getByTestId("synthesis-approve").click();
    // prop-1 disappears; prop-2 remains.
    await expect(page.getByTestId("synthesis-row-prop-1")).not.toBeVisible();
    await expect(page.getByTestId("synthesis-row-prop-2")).toBeVisible();
  });

  test("rejecting a proposal removes it from the list", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/synthesis`);
    await page.getByTestId("synthesis-system-input").fill(`${FIXTURE_IDS.sys1}`);
    await page.getByTestId("synthesis-system-set").click();
    await expect(page.getByTestId("synthesis-row-prop-1")).toBeVisible();
    await page.getByTestId("synthesis-row-prop-1").click();
    await page.getByTestId("synthesis-reject").click();
    await expect(page.getByTestId("synthesis-row-prop-1")).not.toBeVisible();
  });

  test("non-admin (low-trust user) gets 403 on the synthesis-proposals endpoint", async ({
    page,
  }) => {
    // Register a regular user (trust_score 0 < 500 moderator gate).
    await page.goto(`${BASE}/auth/register`);
    await page.getByTestId("register-username").fill("lowtr1");
    await page.getByTestId("register-email").fill("lowtr1@example.com");
    await page.getByTestId("register-password").fill("testpass123");
    await page.getByTestId("register-confirm-password").fill("testpass123");
    await page.getByTestId("register-submit").click();
    await expect(page).toHaveURL(/\/explore$/);
    const token = await page.evaluate(() => {
      return (localStorage.getItem("magnum_auth_token") ?? "").replace(/"/g, "");
    });
    const res = await apiFetch(page, `/api/admin/synthesis-proposals?system_id=${FIXTURE_IDS.sys1}`, {
      token,
    });
    expect(res.status).toBe(403);
  });

  test("moderator (high trust) can list synthesis proposals", async ({ page }) => {
    // Register with high trust_score to bypass the moderator gate.
    const reg = await apiFetch(page, "/api/auth/register", {
      method: "POST",
      body: {
        username: "highmod",
        email: "highmod@example.com",
        password: "testpass123",
        trust_score: 600,
      },
    });
    expect(reg.status).toBe(201);
    const { access_token } = reg.body as { access_token: string };
    const res = await apiFetch(page, `/api/admin/synthesis-proposals?system_id=${FIXTURE_IDS.sys1}`, {
      token: access_token,
    });
    expect(res.status).toBe(200);
    const body = res.body as { proposals: Array<{ id: string }> };
    expect(body.proposals.length).toBeGreaterThanOrEqual(2);
  });
});
