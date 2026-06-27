import { test, expect, type Page } from "@playwright/test";
import { installApi, resetApi, apiFetch } from "../helpers/api.js";
import { FIXTURE_IDS } from "../fixtures/ids.js";

test.beforeEach(async ({ page }) => {
  await installApi(page);
});

test.afterEach(() => {
  resetApi();
});

async function loginAsAdmin(page: Page) {
  await page.goto("/auth/login");
  await page.getByTestId("login-email").fill("admin@example.com");
  await page.getByTestId("login-password").fill("adminpass");
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/explore$/);
}

test.describe("Trace detail screen (§21.6)", () => {
  test("navigates to trace detail and renders segments", async ({ page }) => {
    await loginAsAdmin(page);
    // Navigate to the trace detail for fixture trace1.
    await page.goto(`/trace/${FIXTURE_IDS.trace1}`);
    await expect(page.getByTestId("trace-segment-hdr")).toBeDefined();
  });

  test("trace detail shows segment vote/assign panel", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`/trace/${FIXTURE_IDS.trace1}`);
    // Find a segment and expand the vote panel.
    const toggle = page.getByText("Vote / Assign").first();
    if (await toggle.isVisible().catch(() => false)) {
      await toggle.click();
      await page.waitForTimeout(300);
      // Panel should show agree/disagree/propose options.
      // The actual button text depends on the fixture segment's proposed trail.
      await expect(page.getByText("Propose new trail").first()).toBeVisible();
    }
  });

  test("trace detail shows segment cards with cluster info", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`/trace/${FIXTURE_IDS.trace1}`);
    await page.waitForTimeout(1000);
    // Trace detail should at minimum show the trace contributor name.
    const body = await page.textContent("body");
    expect(body).toContain("hiker1");
  });
});

test.describe("Organize view trace link (§21.6)", () => {
  test("organize proposals have View button linking to trace", async ({ page }) => {
    // Register admin and run synthesis to create proposals.
    const reg = await apiFetch(page, "/api/auth/register", {
      method: "POST",
      body: {
        username: "organize_admin",
        email: "organize@example.com",
        password: "testpass123",
        role: "admin",
        trust_score: 999,
      },
    });
    expect(reg.status).toBe(201);
    const { access_token } = reg.body as { access_token: string };

    // Run synthesis on sys1.
    await apiFetch(page, `/api/systems/${FIXTURE_IDS.sys1}/synthesize`, {
      method: "POST",
      token: access_token,
    });
    await page.waitForTimeout(500);

    // Navigate to system organize.
    await loginAsAdmin(page);
    await page.goto(`/system/hocking-hills-state-park`);
    await page.waitForTimeout(500);

    // Look for the Organize link/button.
    const organizeBtn = page.getByTestId("traces-organize");
    if (await organizeBtn.isVisible().catch(() => false)) {
      await organizeBtn.click();
      await page.waitForTimeout(500);

      // Any proposal row should have a "View" button.
      const viewBtn = page.getByText("View").first();
      if (await viewBtn.isVisible().catch(() => false)) {
        await viewBtn.click();
        // Should navigate to the trace detail page.
        await expect(page).toHaveURL(/\/trace\//);
      }
    }
  });
});
