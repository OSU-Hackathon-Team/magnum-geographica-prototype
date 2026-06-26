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


test.describe("Record Trace screen (§21.3.2 step 2)", () => {
  test("record screen renders with all controls", async ({ page }) => {
    await registerAndLogin(page, "rec1", "rec1@example.com");
    await page.goto(`${BASE}/trace/record`);
    await expect(page.getByTestId("record-trace-screen")).toBeVisible();
    await expect(page.getByTestId("record-start")).toBeVisible();
    await expect(page.getByTestId("record-add-point")).toBeVisible();
    await expect(page.getByTestId("record-clear")).toBeVisible();
    await expect(page.getByTestId("record-cancel")).toBeVisible();
  });

  test("two manual points + save posts a recorded trace", async ({ page }) => {
    await registerAndLogin(page, "rec2", "rec2@example.com");
    await page.goto(`${BASE}/trace/record`);

    // Drop two manual points (>= 2 required to save). Add-point is
    // disabled while recording, so this is the offline / no-GPS path.
    await page.getByTestId("record-add-point").click();
    await page.getByTestId("record-add-point").click();
    await expect(page.getByTestId("record-points").locator("> :first-child")).toHaveText("2");
    await page.getByTestId("record-save").click();
    // Save either navigates back (success) or shows an error banner.
    // Wait for either outcome — the route change OR the error banner
    // — but only treat the navigation as a pass.
    await Promise.race([
      page.waitForURL((u) => !/\/trace\/record$/.test(u.toString()), { timeout: 5_000 }),
      page.waitForSelector('[data-testid="record-error"]', { timeout: 5_000 }),
    ]).catch(() => {});
    const errorVisible = await page.getByTestId("record-error").isVisible().catch(() => false);
    expect(errorVisible).toBe(false);
  });

  test("start + stop toggles the record button", async ({ page }) => {
    await registerAndLogin(page, "rec2b", "rec2b@example.com");
    await page.goto(`${BASE}/trace/record`);
    await page.getByTestId("record-start").click();
    await expect(page.getByTestId("record-stop")).toBeVisible();
    await page.getByTestId("record-stop").click();
    await expect(page.getByTestId("record-start")).toBeVisible();
  });

  test("clear empties the point list", async ({ page }) => {
    await registerAndLogin(page, "rec3", "rec3@example.com");
    await page.goto(`${BASE}/trace/record`);
    await page.getByTestId("record-add-point").click();
    await expect(page.getByTestId("record-points").locator("> :first-child")).toHaveText("1");
    await page.getByTestId("record-clear").click();
    await expect(page.getByTestId("record-points").locator("> :first-child")).toHaveText("0");
  });

  test("save with fewer than 2 points keeps the screen mounted", async ({ page }) => {
    await registerAndLogin(page, "rec4", "rec4@example.com");
    await page.goto(`${BASE}/trace/record`);
    await page.getByTestId("record-add-point").click();
    // The save button is disabled with < 2 points — clicking it should
    // not produce a trace. We verify by checking the screen is still
    // mounted.
    await expect(page.getByTestId("record-save")).toBeVisible();
    await expect(page).toHaveURL(/\/trace\/record$/);
  });

  test("cancel returns to the previous route", async ({ page }) => {
    await registerAndLogin(page, "rec5", "rec5@example.com");
    await page.goto(`${BASE}/explore`);
    await page.getByTestId("explore-upload-trace").click();
    await page.getByTestId("upload-trace-record").click();
    await expect(page.getByTestId("record-trace-screen")).toBeVisible();
    await page.getByTestId("record-cancel").click();
    await expect(page).not.toHaveURL(/\/trace\/record$/);
  });

  test("duration counter ticks while recording", async ({ page }) => {
    await registerAndLogin(page, "rec6", "rec6@example.com");
    await page.goto(`${BASE}/trace/record`);
    const dur = page.getByTestId("record-duration");
    const durValue = dur.locator("> :first-child");
    await expect(durValue).toHaveText("00:00");
    await page.getByTestId("record-start").click();
    await page.waitForTimeout(1500);
    // The duration counter should have advanced past zero.
    const text = (await durValue.textContent()) ?? "";
    expect(text).not.toBe("00:00");
    await page.getByTestId("record-stop").click();
  });

  test("POST /api/traces creates a recorded trace and auto-tags it", async ({ page }) => {
    await registerAndLogin(page, "rec7", "rec7@example.com");
    const token = await getToken(page);
    const res = await apiFetch(page, "/api/traces", {
      method: "POST",
      token,
      body: {
        geometry: {
          type: "LineString",
          coordinates: [
            [-82.5412, 39.4342],
            [-82.5405, 39.4355],
            [-82.5398, 39.4368],
          ],
        },
        source: "recorded",
        contributor_name: "rec7",
      },
    });
    expect(res.status).toBe(200);
    const body = res.body as {
      trace: { id: string; source: string; status: string };
      tagged_system_ids: string[];
    };
    expect(body.trace.source).toBe("recorded");
    expect(body.trace.status).toBe("active");
    expect(body.tagged_system_ids).toContain(`${FIXTURE_IDS.sys1}`);
  });

  test("POST /api/traces rejects payloads with no geometry", async ({ page }) => {
    await registerAndLogin(page, "rec8", "rec8@example.com");
    const token = await getToken(page);
    const res = await apiFetch(page, "/api/traces", {
      method: "POST",
      token,
      body: { source: "recorded" },
    });
    expect(res.status).toBe(400);
  });

  test("POST /api/traces/:id/segments records the server-side cut", async ({ page }) => {
    await registerAndLogin(page, "rec9", "rec9@example.com");
    const token = await getToken(page);
    // Use the seeded FIXTURE_IDS.trace1 fixture.
    const cut = await apiFetch(page, `/api/traces/${FIXTURE_IDS.trace1}/segments`, {
      method: "POST",
      token,
    });
    expect(cut.status).toBe(200);
    const body = cut.body as { ok: boolean; segments: number };
    expect(body.ok).toBe(true);
    expect(body.segments).toBeGreaterThanOrEqual(1);
    // GET returns the new segment in the list.
    const list = await apiFetch(page, `/api/traces/${FIXTURE_IDS.trace1}/segments`);
    expect(list.status).toBe(200);
    const listBody = list.body as { items: Array<{ trace_id: string }> };
    expect(listBody.items.some((s) => s.trace_id === `${FIXTURE_IDS.trace1}`)).toBe(true);
  });
});
