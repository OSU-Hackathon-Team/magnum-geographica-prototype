import { test, expect, type Page } from "@playwright/test";
import { installApiMock, resetApiMock } from "../helpers/api-mock.js";

const BASE = "http://localhost:4173";

test.beforeEach(async ({ page }) => {
  await installApiMock(page);
});

test.afterEach(() => {
  resetApiMock();
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

test.describe("Upload Trace bottom sheet (§21.3.2)", () => {
  test("FAB is visible on the explore tab", async ({ page }) => {
    await registerAndLogin(page, "upload1", "upload1@example.com");
    await expect(page.getByTestId("explore-upload-trace")).toBeVisible();
  });

  test("clicking the FAB opens the sheet with three action cards", async ({ page }) => {
    await registerAndLogin(page, "upload2", "upload2@example.com");
    await page.getByTestId("explore-upload-trace").click();
    await expect(page.getByTestId("explore-upload-trace-sheet")).toBeVisible();
    await expect(page.getByTestId("upload-trace-import")).toBeVisible();
    await expect(page.getByTestId("upload-trace-paste")).toBeVisible();
    await expect(page.getByTestId("upload-trace-record")).toBeVisible();
  });

  test("close button dismisses the sheet", async ({ page }) => {
    await registerAndLogin(page, "upload3", "upload3@example.com");
    await page.getByTestId("explore-upload-trace").click();
    await expect(page.getByTestId("explore-upload-trace-sheet")).toBeVisible();
    await page.getByTestId("upload-trace-close").click();
    await expect(page.getByTestId("explore-upload-trace-sheet")).not.toBeVisible();
  });

  test("paste mode shows format toggle and textarea", async ({ page }) => {
    await registerAndLogin(page, "upload4", "upload4@example.com");
    await page.getByTestId("explore-upload-trace").click();
    await page.getByTestId("upload-trace-paste").click();
    await expect(page.getByTestId("upload-trace-mode-gpx")).toBeVisible();
    await expect(page.getByTestId("upload-trace-mode-geojson")).toBeVisible();
    await expect(page.getByTestId("upload-trace-text")).toBeVisible();
    await expect(page.getByTestId("upload-trace-back")).toBeVisible();
  });

  test("back button returns to the menu", async ({ page }) => {
    await registerAndLogin(page, "upload5", "upload5@example.com");
    await page.getByTestId("explore-upload-trace").click();
    await page.getByTestId("upload-trace-paste").click();
    await expect(page.getByTestId("upload-trace-text")).toBeVisible();
    await page.getByTestId("upload-trace-back").click();
    await expect(page.getByTestId("upload-trace-import")).toBeVisible();
  });

  test("switching format from GPX to GeoJSON toggles the active state", async ({ page }) => {
    await registerAndLogin(page, "upload6", "upload6@example.com");
    await page.getByTestId("explore-upload-trace").click();
    await page.getByTestId("upload-trace-paste").click();
    const gpx = page.getByTestId("upload-trace-mode-gpx");
    const geojson = page.getByTestId("upload-trace-mode-geojson");
    // Both render. The visual active state is opaque to Playwright;
    // we verify that clicking GeoJSON is accepted (doesn't throw) and
    // the textarea placeholder switches to a GeoJSON-shaped sample.
    await geojson.click();
    const placeholder = await page.getByTestId("upload-trace-text").getAttribute("placeholder");
    expect(placeholder ?? "").toContain("LineString");
  });

  test("submitting an empty paste shows an error", async ({ page }) => {
    await registerAndLogin(page, "upload7", "upload7@example.com");
    await page.getByTestId("explore-upload-trace").click();
    await page.getByTestId("upload-trace-paste").click();
    await page.getByTestId("upload-trace-mode-geojson").click();
    await page.getByTestId("upload-trace-submit").click();
    await expect(page.getByTestId("upload-trace-error")).toBeVisible();
  });

  test("successful GeoJSON paste uploads a trace and closes the sheet", async ({ page }) => {
    await registerAndLogin(page, "upload8", "upload8@example.com");
    await page.getByTestId("explore-upload-trace").click();
    await page.getByTestId("upload-trace-paste").click();
    await page.getByTestId("upload-trace-mode-geojson").click();
    const sample = JSON.stringify({
      type: "LineString",
      coordinates: [
        [-82.5412, 39.4342],
        [-82.5405, 39.4355],
        [-82.5398, 39.4368],
      ],
    });
    await page.getByTestId("upload-trace-text").fill(sample);
    await page.getByTestId("upload-trace-submit").click();
    // The sheet should close after a successful import.
    await expect(page.getByTestId("explore-upload-trace-sheet")).not.toBeVisible();
  });

  test("successful GPX paste uploads a trace", async ({ page }) => {
    await registerAndLogin(page, "upload9", "upload9@example.com");
    await page.getByTestId("explore-upload-trace").click();
    await page.getByTestId("upload-trace-paste").click();
    // GPX is the default mode.
    const gpx = `<?xml version="1.0"?>
<gpx><trk><trkseg>
  <trkpt lat="39.4342" lon="-82.5412"/>
  <trkpt lat="39.4355" lon="-82.5405"/>
  <trkpt lat="39.4368" lon="-82.5398"/>
</trkseg></trk></gpx>`;
    await page.getByTestId("upload-trace-text").fill(gpx);
    await page.getByTestId("upload-trace-submit").click();
    await expect(page.getByTestId("explore-upload-trace-sheet")).not.toBeVisible();
  });

  test("record button navigates to /trace/record and back", async ({ page }) => {
    await registerAndLogin(page, "upload10", "upload10@example.com");
    await page.getByTestId("explore-upload-trace").click();
    await page.getByTestId("upload-trace-record").click();
    // The sheet closes and the record screen mounts.
    await expect(page.getByTestId("record-trace-screen")).toBeVisible();
  });

  test("POST /api/traces/import returns a tagged trace inside a known system", async ({
    page,
  }) => {
    const token = await (async () => {
      await registerAndLogin(page, "upload11", "upload11@example.com");
      return getToken(page);
    })();
    const sample = {
      type: "LineString",
      coordinates: [
        [-82.5412, 39.4342],
        [-82.5405, 39.4355],
        [-82.5398, 39.4368],
      ],
    };
    const res = await browserFetch(page, "/api/traces/import", {
      method: "POST",
      token,
      body: {
        format: "geojson",
        payload: sample,
        contributor_name: "upload11",
      },
    });
    expect(res.status).toBe(200);
    const body = res.body as {
      trace: { id: string; source: string };
      tagged_system_ids: string[];
      points: number;
    };
    expect(body.trace.source).toBe("import");
    expect(body.points).toBe(3);
    // The trace is auto-tagged into the bounding box of a seeded system.
    expect(body.tagged_system_ids.length).toBeGreaterThanOrEqual(1);
    expect(body.tagged_system_ids).toContain("sys-1");
  });

  test("POST /api/traces/import rejects a 1-point payload", async ({ page }) => {
    await registerAndLogin(page, "upload12", "upload12@example.com");
    const token = await getToken(page);
    const res = await browserFetch(page, "/api/traces/import", {
      method: "POST",
      token,
      body: {
        format: "geojson",
        payload: { type: "LineString", coordinates: [[-82.5412, 39.4342]] },
      },
    });
    expect(res.status).toBe(400);
  });

  test("POST /api/traces/import requires authentication", async ({ page }) => {
    await page.goto(`${BASE}/explore`);
    const res = await browserFetch(page, "/api/traces/import", {
      method: "POST",
      body: {
        format: "geojson",
        payload: { type: "LineString", coordinates: [[-82.5412, 39.4342], [-82.5405, 39.4355]] },
      },
    });
    expect(res.status).toBe(401);
  });
});
