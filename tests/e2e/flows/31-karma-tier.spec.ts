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

/** Register a user via the form. */
async function registerUser(page: Page, username: string, email: string) {
  await page.goto(`${BASE}/auth/register`);
  await page.getByTestId("register-username").fill(username);
  await page.getByTestId("register-email").fill(email);
  await page.getByTestId("register-password").fill("testpass123");
  await page.getByTestId("register-confirm-password").fill("testpass123");
  await page.getByTestId("register-submit").click();
  await expect(page).toHaveURL(/\/explore$/);
}


test.describe("Trust tier thresholds (§21.7)", () => {
  test("karma 0 → tier 'New'", async ({ page }) => {
    await registerUser(page, "tierNew", "tierNew@example.com");
    await page.goto(`${BASE}/profile`);
    await expect(page.getByTestId("profile-tier-badge")).toHaveText("New");
  });

  test("karma endpoint reflects tier based on trust_score", async ({ page }) => {
    const adminKarma = await apiFetch(page, "/api/votes/users/FIXTURE_IDS.userAdmin/karma");
    expect(adminKarma.status).toBe(200);
    const body = adminKarma.body as { tier: string; karma: number };
    expect(body.tier).toBe("trusted");
    expect(body.karma).toBe(999);

    const missing = await apiFetch(page, "/api/votes/users/does-not-exist/karma");
    expect(missing.status).toBe(404);
  });

  test("New tier → move_to_super returns 403 (protection gate)", async ({ page }) => {
    await registerUser(page, "gated1", "gated1@example.com");
    // The browser fetch runs in the same origin as the page, so the
    // auth store's token is automatically attached. But the mock's
    // bearerUser parses "Bearer mock-access-<id>", and the auth store
    // has set that exact header on its API client. Using fetch directly
    // bypasses the API client. So we manually pass the token.
    const auth = await page.evaluate(() => {
      const raw = localStorage.getItem("magnum_auth_token") ?? "";
      return raw;
    });
    const token = auth.replace(/"/g, "");

    const moveRes = await apiFetch(page, "/api/systems/FIXTURE_IDS.sys1/move", {
      method: "POST",
      token,
      body: { action: "move_to_super", target_super_id: `${FIXTURE_IDS.super1}` },
    });
    expect(moveRes.status).toBe(403);
  });

  test("Established tier (karma 50) → move_to_super succeeds", async ({ page }) => {
    // Register a high-trust user via the API directly, then move.
    const reg = await apiFetch(page, "/api/auth/register", {
      method: "POST",
      body: {
        username: "high_trust_user",
        email: "high_trust_user@example.com",
        password: "testpass123",
        trust_score: 60,
      },
    });
    expect(reg.status).toBe(201);
    const { access_token } = reg.body as { access_token: string };

    const moveRes = await apiFetch(page, "/api/systems/FIXTURE_IDS.sys1/move", {
      method: "POST",
      token: access_token,
      body: { action: "move_to_super", target_super_id: `${FIXTURE_IDS.super1}` },
    });
    expect(moveRes.status).toBe(200);
  });
});
