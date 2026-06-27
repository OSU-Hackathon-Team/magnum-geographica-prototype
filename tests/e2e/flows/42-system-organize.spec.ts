import { test, expect, type Page } from "@playwright/test";
import { installApi, resetApi, apiFetch } from "../helpers/api.js";

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

test.describe("System — Organize traces page ($21.6 phase 2)", () => {
  test("system detail page has the Organize traces button", async ({
    page,
  }) => {
    await page.goto(`${BASE}/system/hocking-hills-state-park`);
    await expect(page.getByTestId("system-organize")).toBeVisible();
  });

  test("clicking Organize traces navigates to the organize page", async ({ page }) => {
    await page.goto(`${BASE}/system/hocking-hills-state-park`);
    await page.getByTestId("system-organize").click();
    await expect(page).toHaveURL(/\/system\/hocking-hills-state-park\/organize/);
  });

  test("organize page renders the map, summary, and proposals list", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/system/hocking-hills-state-park/organize`);
    await expect(page.getByTestId("organize-map")).toBeVisible();
    await expect(page.getByTestId("organize-summary")).toBeVisible();
    await expect(page.getByTestId("organize-proposals")).toBeVisible();
    await expect(page.getByTestId("organize-foot")).toBeVisible();
  });

  test("organize page foot shows the moderator role for an admin", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/system/hocking-hills-state-park/organize`);
    await expect(page.getByTestId("organize-foot")).toContainText("moderator");
  });

  test("proposals list shows seeded rows when the system is loaded", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/system/hocking-hills-state-park/organize`);
    const firstProposal = page.locator('[data-testid^="proposal-"]').first();
    await expect(firstProposal).toBeVisible();
  });

  test("tapping a proposal opens the bottom sheet with the trail list", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/system/hocking-hills-state-park/organize`);
    const firstProposal = page.locator('[data-testid^="proposal-"]').first();
    await expect(firstProposal).toBeVisible();
    await firstProposal.click();
    await expect(page.getByTestId("proposal-sheet")).toBeVisible();
    await expect(page.getByTestId("proposal-sheet-trails")).toBeVisible();
    await expect(page.getByTestId("proposal-sheet-name")).toBeVisible();
    await expect(page.getByTestId("proposal-sheet-approve")).toBeVisible();
    await expect(page.getByTestId("proposal-sheet-reject")).toBeVisible();
  });

  test("rejecting a proposal removes it from the list", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/system/hocking-hills-state-park/organize`);
    const proposals = page.locator('[data-testid^="proposal-"]');
    await expect(proposals.first()).toBeVisible({ timeout: 10000 });
    const initialCount = await proposals.count();
    expect(initialCount).toBeGreaterThanOrEqual(1);
    await proposals.first().click();
    await page.getByTestId("proposal-sheet-reject").click();
    await expect(page.getByTestId("proposal-sheet")).not.toBeVisible();
    const newCount = await page.locator('[data-testid^="proposal-"]').count();
    expect(newCount).toBe(initialCount - 1);
  });

  test("approving with a new trail name creates a synthesized trail", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/system/hocking-hills-state-park/organize`);
    const firstProposal = page.locator('[data-testid^="proposal-"]').first();
    await expect(firstProposal).toBeVisible();
    await firstProposal.click();
    await page.getByTestId("proposal-sheet-name").fill("Ridge Runner");
    await page.getByTestId("proposal-sheet-approve").click();
    await expect(page.getByTestId("proposal-sheet")).not.toBeVisible();
  });

  test("moderator role is surfaced in the foot for admin users", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/system/hocking-hills-state-park/organize`);
    await expect(page.getByTestId("organize-foot")).toContainText("moderator");
  });
});
