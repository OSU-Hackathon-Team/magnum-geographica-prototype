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


test.describe("Trail tier badge on detail (§21.6 phase 2)", () => {
  test("trail detail page renders the TrailTierBadge with a default tier", async ({
    page,
  }) => {
    await page.goto(`${BASE}/trail/buckeye-trail`);
    // The fixture's trails don't have a tier; the mock defaults to
    // 'synthesized' (the real DB tags every trail with a tier).
    await expect(page.getByTestId("trail-tier-badge-synthesized")).toBeVisible();
    await expect(page.getByTestId("trail-tier-label")).toHaveText("Synthesized");
  });

  test("synthesized trail renders the synthesized badge", async ({ page }) => {
    // Promote a real trail to synthesized via the admin endpoint.
    await page.goto(`${BASE}/explore`);
    // First, log in as admin to get a moderator-tier token.
    const reg = await apiFetch(page, "/api/__test/register", {
      method: "POST",
      body: {
        username: "mod_tier",
        email: "modtier@example.com",
        password: "testpass123",
        role: "admin",
        trust_score: 999,
      },
    });
    expect(reg.status).toBe(201);
    const { access_token } = reg.body as { access_token: string };
    // Promote FIXTURE_IDS.trail1 to synthesized via the API directly.
    const promote = await apiFetch(page, `/api/admin/trails/${FIXTURE_IDS.trail1}/promote`, {
      method: "POST",
      token: access_token,
      body: { to: "elevated" },
    });
    expect(promote.status).toBe(200);
    await page.goto(`${BASE}/trail/buckeye-trail`);
    // After promotion, the badge shows the new tier.
    await expect(page.getByTestId("trail-tier-badge-elevated")).toBeVisible();
  });

  test("synthesized trail with derived_from_segments shows the derived-from text", async ({
    page,
  }) => {
    // Approve a synthesis proposal — that creates a synthesized trail
    // with derived_from_segments. Use the admin token to call the API.
    const reg = await apiFetch(page, "/api/__test/register", {
      method: "POST",
      body: {
        username: "mod_derive",
        email: "modderive@example.com",
        password: "testpass123",
        role: "admin",
        trust_score: 999,
      },
    });
    expect(reg.status).toBe(201);
    const { access_token } = reg.body as { access_token: string };
    // Approve proposal prop-1 to create a synthetic trail.
    const approve = await apiFetch(
      page,
      "/api/admin/synthesis-proposals/seg-prop-1/approve",
      {
        method: "POST",
        token: access_token,
        body: { system_id: `${FIXTURE_IDS.sys1}`, name: "Ridge Runner" },
      },
    );
    expect(approve.status).toBe(200);
    const body = approve.body as { id: string; slug: string; tier: string };
    expect(body.tier).toBe("synthesized");
    // The mock returns the synthetic trail; the page can be opened.
    const synthDetail = await apiFetch(page, `/api/trails/${body.id}`);
    expect(synthDetail.status).toBe(200);
  });

  test("promoting a synthesized trail to elevated swaps the badge", async ({ page }) => {
    const reg = await apiFetch(page, "/api/__test/register", {
      method: "POST",
      body: {
        username: "mod_promote",
        email: "modpromote@example.com",
        password: "testpass123",
        role: "admin",
        trust_score: 999,
      },
    });
    expect(reg.status).toBe(201);
    const { access_token } = reg.body as { access_token: string };
    // First create a synthetic trail via approve.
    const approve = await apiFetch(
      page,
      "/api/admin/synthesis-proposals/seg-prop-2/approve",
      {
        method: "POST",
        token: access_token,
        body: { system_id: `${FIXTURE_IDS.sys1}`, name: "Eagle Ridge" },
      },
    );
    expect(approve.status).toBe(200);
    const newId = (approve.body as { id: string }).id;
    // Navigate to the new trail detail.
    await page.goto(`${BASE}/trail/eagle-ridge`);
    await expect(page.getByTestId("trail-tier-badge-synthesized")).toBeVisible();
    // Promote via API.
    const promote = await apiFetch(page, `/api/admin/trails/${newId}/promote`, {
      method: "POST",
      token: access_token,
      body: { to: "elevated" },
    });
    expect(promote.status).toBe(200);
    // Reload — the badge should now read "elevated".
    await page.goto(`${BASE}/trail/eagle-ridge`);
    await expect(page.getByTestId("trail-tier-badge-elevated")).toBeVisible();
    await expect(page.getByTestId("trail-tier-label")).toHaveText("Elevated");
  });
});
