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
  await page.waitForTimeout(2000);
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

  test("entering a system id and clicking Load shows proposals", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/synthesis`);
    await page.getByTestId("synthesis-system-input").fill(`${FIXTURE_IDS.sys1}`);
    await page.getByTestId("synthesis-system-set").click();
    const firstRow = page.locator('[data-testid^="synthesis-row-"]').first();
    await expect(firstRow).toBeVisible({ timeout: 10000 });
  });

  test("tapping a proposal opens the approve/reject modal", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/synthesis`);
    await page.getByTestId("synthesis-system-input").fill(`${FIXTURE_IDS.sys1}`);
    await page.getByTestId("synthesis-system-set").click();
    const firstRow = page.locator('[data-testid^="synthesis-row-"]').first();
    await expect(firstRow).toBeVisible({ timeout: 10000 });
    await firstRow.click();
    await expect(page.getByTestId("synthesis-name")).toBeVisible();
    await expect(page.getByTestId("synthesis-approve")).toBeVisible();
    await expect(page.getByTestId("synthesis-reject")).toBeVisible();
  });

  test("approving a proposal removes it from the list", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/synthesis`);
    await page.getByTestId("synthesis-system-input").fill(`${FIXTURE_IDS.sys1}`);
    await page.getByTestId("synthesis-system-set").click();
    const rows = page.locator('[data-testid^="synthesis-row-"]');
    await expect(rows.first()).toBeVisible({ timeout: 10000 });
    const initialCount = await rows.count();
    await rows.first().click();
    await page.getByTestId("synthesis-name").fill("Approved Trail");
    await page.getByTestId("synthesis-approve").click();
    const newCount = await page.locator('[data-testid^="synthesis-row-"]').count();
    expect(newCount).toBe(initialCount - 1);
  });

  test("rejecting a proposal removes it from the list", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/synthesis`);
    await page.getByTestId("synthesis-system-input").fill(`${FIXTURE_IDS.sys1}`);
    await page.getByTestId("synthesis-system-set").click();
    const rows = page.locator('[data-testid^="synthesis-row-"]');
    await expect(rows.first()).toBeVisible({ timeout: 10000 });
    const initialCount = await rows.count();
    await rows.first().click();
    await page.getByTestId("synthesis-reject").click();
    const newCount = await page.locator('[data-testid^="synthesis-row-"]').count();
    expect(newCount).toBe(initialCount - 1);
  });

  test("non-admin (low-trust user) gets error on the synthesis-proposals endpoint", async ({
    page,
  }) => {
    const reg = await apiFetch(page, "/api/__test/register", {
      method: "POST",
      body: {
        username: "lowtr1",
        email: "lowtr1@example.com",
        password: "testpass123",
        role: "contributor",
        trust_score: 0,
      },
    });
    expect(reg.status).toBe(201);
    const { access_token } = reg.body as { access_token: string };
    const res = await apiFetch(page, `/api/admin/synthesis-proposals?system_id=${FIXTURE_IDS.sys1}`, {
      token: access_token,
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test("moderator (admin role) can list synthesis proposals", async ({ page }) => {
    const reg = await apiFetch(page, "/api/__test/register", {
      method: "POST",
      body: {
        username: "highmod",
        email: "highmod@example.com",
        password: "testpass123",
        role: "admin",
        trust_score: 999,
      },
    });
    expect(reg.status).toBe(201);
    const { access_token } = reg.body as { access_token: string };
    const res = await apiFetch(page, `/api/admin/synthesis-proposals?system_id=${FIXTURE_IDS.sys1}`, {
      token: access_token,
    });
    expect(res.status).toBe(200);
  });
});
