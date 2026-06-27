import { test, expect, type Page } from "@playwright/test";
import { installApi, resetApi } from "../helpers/api.js";
import { FIXTURE_IDS } from "../fixtures/ids.js";

const BASE = "http://localhost:4173";

test.beforeEach(async ({ page }) => {
  await installApi(page);
});

test.afterEach(() => {
  resetApi();
});

async function registerAndLogin(page: Page, username: string, email: string) {
  await page.goto(`${BASE}/auth/register`);
  await page.getByTestId("register-username").fill(username);
  await page.getByTestId("register-email").fill(email);
  await page.getByTestId("register-password").fill("testpass123");
  await page.getByTestId("register-confirm-password").fill("testpass123");
  await page.getByTestId("register-submit").click();
  await expect(page).toHaveURL(/\/explore$/);
}

async function getToken(page: Page): Promise<string> {
  return page.evaluate(() => {
    return (localStorage.getItem("magnum_auth_token") ?? "").replace(/"/g, "");
  });
}

async function loginAsAdmin(page: Page) {
  await page.goto(`${BASE}/auth/login`);
  await page.getByTestId("login-email").fill("admin@example.com");
  await page.getByTestId("login-password").fill("adminpass");
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/explore$/);
}

test.describe("System — Trails & Traces tab ($21.4)", () => {
  test("system detail renders the Trails & Traces tab", async ({ page }) => {
    await page.goto(`${BASE}/system/hocking-hills-state-park`);
    await page.getByTestId("system-tab-traces").click();
    await expect(page.getByTestId("system-traces-tab-content")).toBeVisible();
    await expect(page.getByTestId("traces-organize")).toBeVisible();
    await expect(page.getByTestId("traces-upload")).toBeVisible();
  });

  test("tab heading shows the count of seeded traces", async ({ page }) => {
    await page.goto(`${BASE}/system/hocking-hills-state-park`);
    await page.getByTestId("system-tab-traces").click();
    // The mock seeds 2 traces into FIXTURE_IDS.sys1 (FIXTURE_IDS.trace1, FIXTURE_IDS.trace2).
    await expect(page.getByTestId("traces-count")).toHaveText("2");
  });

  test("each seeded trace renders as a row with vote controls", async ({ page }) => {
    await page.goto(`${BASE}/system/hocking-hills-state-park`);
    await page.getByTestId("system-tab-traces").click();
    await expect(page.getByTestId(`traces-row-${FIXTURE_IDS.trace1}`)).toBeVisible();
    await expect(page.getByTestId(`traces-row-${FIXTURE_IDS.trace2}`)).toBeVisible();
    // Per-row vote controls ($21.7 vote control on trace rows).
    await expect(page.getByTestId(`traces-row-${FIXTURE_IDS.trace1}-up`)).toBeVisible();
    await expect(page.getByTestId(`traces-row-${FIXTURE_IDS.trace1}-score`)).toBeVisible();
    await expect(page.getByTestId(`traces-row-${FIXTURE_IDS.trace1}-down`)).toBeVisible();
  });

  test("organize button navigates to the organize page", async ({ page }) => {
    await page.goto(`${BASE}/system/hocking-hills-state-park`);
    await page.getByTestId("system-tab-traces").click();
    const button = page.getByTestId("traces-organize");
    await button.scrollIntoViewIfNeeded();
    await button.click();
    // The button uses the system id (FIXTURE_IDS.sys1), not the slug.
    await expect(page).toHaveURL(new RegExp(`/system/${FIXTURE_IDS.sys1}/organize`));
  });

  test("upload button navigates to the upload sheet", async ({ page }) => {
    await page.goto(`${BASE}/system/hocking-hills-state-park`);
    await page.getByTestId("system-tab-traces").click();
    const button = page.getByTestId("traces-upload");
    await button.scrollIntoViewIfNeeded();
    await button.click();
    await expect(page).toHaveURL(new RegExp(`/system/${FIXTURE_IDS.sys1}/traces/upload`));
    await expect(page.getByTestId("system-upload-trace-sheet")).toBeVisible();
  });

  test("upvote increments the trace score", async ({ page }) => {
    await registerAndLogin(page, "tracevoter", "tracevoter@example.com");
    await page.goto(`${BASE}/system/hocking-hills-state-park`);
    await page.getByTestId("system-tab-traces").click();
    const up = page.getByTestId(`traces-row-${FIXTURE_IDS.trace1}-up`);
    const score = page.getByTestId(`traces-row-${FIXTURE_IDS.trace1}-score`);
    // Read the initial numeric portion (text is "3score" or "3votes"
    // depending on TraceRow's labels).
    const beforeText = ((await score.textContent()) ?? "0").trim();
    const before = Number(beforeText.replace(/[^\d-]/g, "") || "0");
    await up.click();
    await page.waitForTimeout(500);
    const afterText = ((await score.textContent()) ?? "0").trim();
    const after = Number(afterText.replace(/[^\d-]/g, "") || "0");
    expect(after).toBe(before + 1);
  });

  test("moderator can remove a trace", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/system/hocking-hills-state-park`);
    await page.getByTestId("system-tab-traces").click();
    // The remove button is moderator-only ($21.6) and shows on every
    // row for users with role=admin. The mock's getAllDownloadedSystems
    // path may not surface it for unauthenticated visitors, so we
    // assert the button renders for admin only.
    await expect(page.getByTestId(`traces-row-${FIXTURE_IDS.trace1}-remove`)).toBeVisible();
  });

  test(`GET /api/traces?system_id=${FIXTURE_IDS.sys1} returns the seeded traces`, async ({ page }) => {
    await page.goto(`${BASE}/explore`);
    const res = await page.evaluate(async () => {
      const r = await fetch(`/api/traces?system_id=${FIXTURE_IDS.sys1}`);
      return r.json();
    });
    const body = res as { items: Array<{ id: string; source: string }>; total: number };
    expect(body.total).toBe(2);
    expect(body.items.map((t) => t.id).sort()).toEqual([`${FIXTURE_IDS.trace1}`, `${FIXTURE_IDS.trace2}`]);
    expect(body.items.some((t) => t.source === "recorded")).toBe(true);
    expect(body.items.some((t) => t.source === "import")).toBe(true);
  });

  test("POST /api/traces/:id/vote updates the trace's score", async ({ page }) => {
    await registerAndLogin(page, "tracevoter2", "tracevoter2@example.com");
    const token = await getToken(page);
    const res = await page.evaluate(
      async ({ token }) => {
        const r = await fetch(`/api/traces/${FIXTURE_IDS.trace1}/vote`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ value: -1 }),
        });
        return r.json();
      },
      { token },
    );
    const body = res as { upvotes: number; downvotes: number; net: number; my_vote: number };
    expect(body.my_vote).toBe(-1);
    // FIXTURE_IDS.trace1 starts at ups=3, downs=0. The new -1 flips net from 3 to 2.
    expect(body.net).toBe(2);
    expect(body.upvotes).toBe(3);
    expect(body.downvotes).toBe(1);
  });

  test("downvote weight below 0.3 flips status to 'ignored'", async ({ page }) => {
    // Build enough downvotes to push weight under 0.3.
    // We use the mock's trust-score-weighted logic: each distinct
    // voter adds a -1. FIXTURE_IDS.trace1 starts with weight 1.0, upvotes=3,
    // downvotes=0. Adding 4 distinct downvoters: up=3, down=4 ->
    // w = (3+1-4) / (3+4+2) = 0/9 = 0 (well under 0.3).
    const tokens: string[] = [];
    for (let i = 0; i < 4; i++) {
      const reg = await page.evaluate(
        async (i) => {
          const r = await fetch("/api/auth/register", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              username: `downvoter${i}`,
              email: `downvoter${i}@example.com`,
              password: "testpass123",
            }),
          });
          return r.json();
        },
        i,
      );
      const b = reg as { access_token: string };
      tokens.push(b.access_token);
    }
    for (const t of tokens) {
      await page.evaluate(
        async (t) => {
          await fetch(`/api/traces/${FIXTURE_IDS.trace1}/vote`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${t}`,
            },
            body: JSON.stringify({ value: -1 }),
          });
        },
        t,
      );
    }
    const res = await page.evaluate(async () => {
      const r = await fetch(`/api/traces/${FIXTURE_IDS.trace1}`);
      return r.json();
    });
    const t = res as { status: string; weight: number; downvotes: number };
    expect(t.downvotes).toBeGreaterThanOrEqual(4);
    expect(t.weight).toBeLessThan(0.3);
    expect(t.status).toBe("ignored");
  });
});
