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


test.describe("Moderator tier gating (§21.6 phase 2)", () => {
  test("POST /api/systems/:id/synthesize rejects unauthenticated callers with 401", async ({
    page,
  }) => {
    await page.goto(`${BASE}/explore`);
    const res = await apiFetch(page, `/api/systems/${FIXTURE_IDS.sys1}/synthesize`, {
      method: "POST",
    });
    expect(res.status).toBe(401);
  });

  test("POST /api/systems/:id/synthesize rejects a New-tier user with 403", async ({
    page,
  }) => {
    // Register a user with default trust_score=0 (New tier).
    await page.goto(`${BASE}/auth/register`);
    await page.getByTestId("register-username").fill("newmod");
    await page.getByTestId("register-email").fill("newmod@example.com");
    await page.getByTestId("register-password").fill("testpass123");
    await page.getByTestId("register-confirm-password").fill("testpass123");
    await page.getByTestId("register-submit").click();
    await expect(page).toHaveURL(/\/explore$/);
    const token = await page.evaluate(() => {
      return (localStorage.getItem("magnum_auth_token") ?? "").replace(/"/g, "");
    });
    const res = await apiFetch(page, `/api/systems/${FIXTURE_IDS.sys1}/synthesize`, {
      method: "POST",
      token,
    });
    expect(res.status).toBe(403);
  });

  test("POST /api/systems/:id/synthesize accepts a moderator-tier user (role=admin)", async ({
    page,
  }) => {
    // Register with role=admin which the mock treats as moderator-tier.
    const reg = await apiFetch(page, "/api/auth/register", {
      method: "POST",
      body: {
        username: "modadmin",
        email: "modadmin@example.com",
        password: "testpass123",
        role: "admin",
        trust_score: 999,
      },
    });
    expect(reg.status).toBe(201);
    const { access_token } = reg.body as { access_token: string };
    const res = await apiFetch(page, `/api/systems/${FIXTURE_IDS.sys1}/synthesize`, {
      method: "POST",
      token: access_token,
    });
    expect(res.status).toBe(200);
    const body = res.body as { run: { id: string; status: string }; proposed: number };
    expect(body.run.status).toBe("completed");
  });

  test("POST /api/systems/:id/synthesize accepts a high-trust non-admin user (>= 500)", async ({
    page,
  }) => {
    // Register with role=contributor but trust_score=600 — the mock
    // grants moderator access based on trust_score.
    const reg = await apiFetch(page, "/api/auth/register", {
      method: "POST",
      body: {
        username: "trustymod",
        email: "trustymod@example.com",
        password: "testpass123",
        role: "contributor",
        trust_score: 600,
      },
    });
    expect(reg.status).toBe(201);
    const { access_token } = reg.body as { access_token: string };
    const res = await apiFetch(page, `/api/systems/${FIXTURE_IDS.sys1}/synthesize`, {
      method: "POST",
      token: access_token,
    });
    expect(res.status).toBe(200);
  });

  test("POST /api/admin/trails/:id/promote rejects a New-tier user with 403", async ({
    page,
  }) => {
    // Register as a New user.
    await page.goto(`${BASE}/auth/register`);
    await page.getByTestId("register-username").fill("promote0");
    await page.getByTestId("register-email").fill("promote0@example.com");
    await page.getByTestId("register-password").fill("testpass123");
    await page.getByTestId("register-confirm-password").fill("testpass123");
    await page.getByTestId("register-submit").click();
    await expect(page).toHaveURL(/\/explore$/);
    const token = await page.evaluate(() => {
      return (localStorage.getItem("magnum_auth_token") ?? "").replace(/"/g, "");
    });
    const res = await apiFetch(page, `/api/admin/trails/${FIXTURE_IDS.trail1}/promote`, {
      method: "POST",
      token,
      body: { to: "elevated" },
    });
    expect(res.status).toBe(403);
  });
});
