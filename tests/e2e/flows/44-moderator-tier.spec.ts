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
    const reg = await apiFetch(page, "/api/__test/register", {
      method: "POST",
      body: {
        username: "newmod",
        email: "newmod@example.com",
        password: "testpass123",
        role: "contributor",
        trust_score: 0,
      },
    });
    expect(reg.status).toBe(201);
    const { access_token } = reg.body as { access_token: string };
    const res = await apiFetch(page, `/api/systems/${FIXTURE_IDS.sys1}/synthesize`, {
      method: "POST",
      token: access_token,
    });
    expect(res.status).toBe(403);
  });

  test("POST /api/systems/:id/synthesize accepts a moderator-tier user (role=admin)", async ({
    page,
  }) => {
    // Register with role=admin which the mock treats as moderator-tier.
    const reg = await apiFetch(page, "/api/__test/register", {
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
    expect(body.run.status).toBe("complete");
  });

  test("POST /api/systems/:id/synthesize rejects a high-trust non-admin user (403)", async ({
    page,
  }) => {
    const reg = await apiFetch(page, "/api/__test/register", {
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
    expect(res.status).toBe(403);
  });

  test("POST /api/admin/trails/:id/promote rejects a New-tier user with 403", async ({
    page,
  }) => {
    const reg = await apiFetch(page, "/api/__test/register", {
      method: "POST",
      body: {
        username: "promote0",
        email: "promote0@example.com",
        password: "testpass123",
        role: "contributor",
        trust_score: 0,
      },
    });
    expect(reg.status).toBe(201);
    const { access_token } = reg.body as { access_token: string };
    const res = await apiFetch(page, `/api/admin/trails/${FIXTURE_IDS.trail1}/promote`, {
      method: "POST",
      token: access_token,
      body: { to: "elevated" },
    });
    expect(res.status).toBe(401);
  });
});
