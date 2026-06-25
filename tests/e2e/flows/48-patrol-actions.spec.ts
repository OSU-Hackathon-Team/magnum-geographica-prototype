import { test, expect, type Page } from "@playwright/test";
import { installApiMock, resetApiMock } from "../helpers/api-mock.js";

const BASE = "http://localhost:4173";

test.beforeEach(async ({ page }) => {
  await installApiMock(page);
});

test.afterEach(() => {
  resetApiMock();
});

async function loginAsAdmin(page: Page) {
  await page.goto(`${BASE}/auth/login`);
  await page.getByTestId("login-email").fill("admin@example.com");
  await page.getByTestId("login-password").fill("adminpass");
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/explore$/);
}

async function getToken(page: Page): Promise<string> {
  return page.evaluate(() => {
    return (localStorage.getItem("magnum_auth_token") ?? "").replace(/"/g, "");
  });
}

async function browserFetch(
  page: Page,
  path: string,
  init: { method?: string; body?: unknown; token?: string } = {},
): Promise<{ status: number; body: unknown }> {
  return page.evaluate(
    async ({ path, method, body, token }) => {
      const res = await fetch(`http://localhost:9999${path}`, {
        method: method ?? "GET",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      let json: unknown = null;
      try {
        json = await res.json();
      } catch {
        // ignore
      }
      return { status: res.status, body: json };
    },
    { path, method: init.method, body: init.body, token: init.token },
  );
}

/** Seed one patrol flag via the mock's test-only seed action. */
async function seedFlag(
  page: Page,
  token: string,
  reason: string,
  summary: string,
): Promise<string> {
  const res = await browserFetch(page, "/api/admin/patrol/act", {
    method: "POST",
    token,
    body: {
      action: "seed",
      reason,
      revision_target_type: "system",
      revision_target_id: "sys-1",
      revision_action: "edit",
      revision_author_id: "user-100",
      revision_summary: summary,
    },
  });
  expect(res.status).toBe(200);
  const body = res.body as { id: string };
  return body.id;
}

test.describe("Admin patrol actions (§21.8)", () => {
  test("non-admin gets 401 on /api/admin/patrol", async ({ page }) => {
    await page.goto(`${BASE}/auth/register`);
    await page.getByTestId("register-username").fill("nonadmin2");
    await page.getByTestId("register-email").fill("nonadmin2@example.com");
    await page.getByTestId("register-password").fill("testpass123");
    await page.getByTestId("register-confirm-password").fill("testpass123");
    await page.getByTestId("register-submit").click();
    await expect(page).toHaveURL(/\/explore$/);
    const token = await getToken(page);
    const res = await browserFetch(page, "/api/admin/patrol", { token });
    expect(res.status).toBe(401);
  });

  test("admin can list seeded flags", async ({ page }) => {
    await loginAsAdmin(page);
    const token = await getToken(page);
    await seedFlag(page, token, "new_tier_semi_edit", "low-trust edit on a protected system");
    await page.goto(`${BASE}/admin/patrol`);
    await expect(page.getByTestId("admin-patrol")).toBeVisible();
    // Heading shows the count.
    await expect(page.locator('[data-testid="admin-patrol"]')).toContainText("Patrol (1)");
  });

  test("seeded flag renders as a card with reason + target", async ({ page }) => {
    await loginAsAdmin(page);
    const token = await getToken(page);
    const id = await seedFlag(page, token, "new_tier_semi_edit", "low-trust edit on a protected system");
    await page.goto(`${BASE}/admin/patrol`);
    await expect(page.getByTestId(`patrol-entry-${id}`)).toBeVisible();
    await expect(page.getByTestId(`patrol-entry-${id}`)).toContainText("New-tier edit on protected entity");
    await expect(page.getByTestId(`patrol-entry-${id}`)).toContainText("system/sys-1");
    await expect(page.getByTestId(`patrol-entry-${id}`)).toContainText("low-trust edit on a protected system");
  });

  test("resolve button is rendered for each open flag", async ({ page }) => {
    await loginAsAdmin(page);
    const token = await getToken(page);
    const id = await seedFlag(page, token, "new_tier_revert_burst", "burst of reverts by new-tier user");
    await page.goto(`${BASE}/admin/patrol`);
    await expect(page.getByTestId(`patrol-entry-${id}`)).toBeVisible();
    await expect(page.getByTestId(`patrol-resolve-${id}`)).toBeVisible();
  });

  test("resolve button is hidden once the flag is resolved", async ({ page }) => {
    await loginAsAdmin(page);
    const token = await getToken(page);
    const id = await seedFlag(page, token, "new_tier_revert_burst", "burst of reverts by new-tier user");
    // Resolve the flag via the API (the UI wraps this in a custom
    // RNW modal that Playwright can't auto-accept, so we go through
    // the same handler the modal would invoke).
    const act = await browserFetch(page, "/api/admin/patrol/act", {
      method: "POST",
      token,
      body: { action: "resolve", flag_id: id },
    });
    expect(act.status).toBe(200);
    // View the patrol page with the "all" filter so the resolved flag
    // is still visible.
    await page.goto(`${BASE}/admin/patrol`);
    await page.getByTestId("patrol-filter-all").click();
    await expect(page.getByTestId(`patrol-entry-${id}`)).toBeVisible();
    // The entry now shows "✓ Resolved" and the Resolve button is gone.
    await expect(page.getByTestId(`patrol-entry-${id}`)).toContainText("Resolved");
    await expect(page.getByTestId(`patrol-resolve-${id}`)).not.toBeVisible();
  });

  test("filter: 'all' shows resolved flags; 'unresolved' hides them", async ({ page }) => {
    await loginAsAdmin(page);
    const token = await getToken(page);
    const id1 = await seedFlag(page, token, "new_tier_semi_edit", "open flag");
    const id2 = await seedFlag(page, token, "new_tier_revert_burst", "will be resolved");
    // Resolve id2 via the API.
    const act = await browserFetch(page, "/api/admin/patrol/act", {
      method: "POST",
      token,
      body: { action: "resolve", flag_id: id2 },
    });
    expect(act.status).toBe(200);

    await page.goto(`${BASE}/admin/patrol`);
    // Default is "unresolved" — id2 (resolved) is hidden, id1 visible.
    await expect(page.getByTestId(`patrol-entry-${id1}`)).toBeVisible();
    await expect(page.getByTestId(`patrol-entry-${id2}`)).not.toBeVisible();
    await expect(page.locator('[data-testid="admin-patrol"]')).toContainText("Patrol (1)");

    // Toggle to "all" — id2 reappears.
    await page.getByTestId("patrol-filter-all").click();
    await expect(page.getByTestId(`patrol-entry-${id1}`)).toBeVisible();
    await expect(page.getByTestId(`patrol-entry-${id2}`)).toBeVisible();
    await expect(page.locator('[data-testid="admin-patrol"]')).toContainText("Patrol (2)");

    // Toggle back to "unresolved" — id2 gone.
    await page.getByTestId("patrol-filter-unresolved").click();
    await expect(page.getByTestId(`patrol-entry-${id2}`)).not.toBeVisible();
    await expect(page.getByTestId(`patrol-entry-${id1}`)).toBeVisible();
    await expect(page.locator('[data-testid="admin-patrol"]')).toContainText("Patrol (1)");
  });

  test("POST /api/admin/patrol/act action=resolve marks a flag resolved", async ({ page }) => {
    await loginAsAdmin(page);
    const token = await getToken(page);
    const id = await seedFlag(page, token, "negative_karma_delete_revert", "neg-karma delete");
    // Direct API: resolve.
    const act = await browserFetch(page, "/api/admin/patrol/act", {
      method: "POST",
      token,
      body: { action: "resolve", flag_id: id },
    });
    expect(act.status).toBe(200);
    // GET unresolved list excludes the resolved flag.
    const list = await browserFetch(page, "/api/admin/patrol?resolved=false", { token });
    const body = list.body as { items: Array<{ id: string }>; total: number };
    expect(body.items.find((f) => f.id === id)).toBeUndefined();
    // GET all includes the resolved flag.
    const all = await browserFetch(page, "/api/admin/patrol?resolved=true", { token });
    const allBody = all.body as { items: Array<{ id: string; resolved: boolean }>; total: number };
    const found = allBody.items.find((f) => f.id === id);
    expect(found).toBeDefined();
    expect(found?.resolved).toBe(true);
  });

  test("non-admin gets 401 on /api/admin/patrol/act action=seed", async ({ page }) => {
    await page.goto(`${BASE}/auth/register`);
    await page.getByTestId("register-username").fill("regseed");
    await page.getByTestId("register-email").fill("regseed@example.com");
    await page.getByTestId("register-password").fill("testpass123");
    await page.getByTestId("register-confirm-password").fill("testpass123");
    await page.getByTestId("register-submit").click();
    await expect(page).toHaveURL(/\/explore$/);
    const token = await getToken(page);
    const res = await browserFetch(page, "/api/admin/patrol/act", {
      method: "POST",
      token,
      body: { action: "seed", reason: "new_tier_semi_edit" },
    });
    expect(res.status).toBe(401);
  });
});
