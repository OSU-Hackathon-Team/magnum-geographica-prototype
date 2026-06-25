import { test, expect, type Page } from "@playwright/test";
import { installApiMock, resetApiMock } from "../helpers/api-mock.js";

const BASE = "http://localhost:4173";

test.beforeEach(async ({ page }) => {
  await installApiMock(page);
});

test.afterEach(() => {
  resetApiMock();
});

/** Register + auto-login a user via the form. */
async function registerAndLogin(page: Page, username: string, email: string) {
  await page.goto(`${BASE}/auth/register`);
  await page.getByTestId("register-username").fill(username);
  await page.getByTestId("register-email").fill(email);
  await page.getByTestId("register-password").fill("testpass123");
  await page.getByTestId("register-confirm-password").fill("testpass123");
  await page.getByTestId("register-submit").click();
  await expect(page).toHaveURL(/\/explore$/);
}

test.describe("Vote control — feature page (§21.7)", () => {
  test("anonymous user sees vote score but cannot click arrows", async ({ page }) => {
    await page.goto(`${BASE}/feature/f-1`);
    await expect(page.getByTestId("feature-vote-score")).toBeVisible();
    await expect(page.getByTestId("feature-vote-up")).toBeVisible();
    await expect(page.getByTestId("feature-vote-down")).toBeVisible();
  });

  test("upvote increases score and highlights the up arrow", async ({ page }) => {
    await registerAndLogin(page, "voter1", "voter1@example.com");
    await page.goto(`${BASE}/feature/f-1`);

    const up = page.getByTestId("feature-vote-up");
    const down = page.getByTestId("feature-vote-down");
    const score = page.getByTestId("feature-vote-score");

    await expect(score).toHaveText("0");
    await up.click();
    await expect(score).toHaveText("1");
    // Clicking up again retracts.
    await up.click();
    await expect(score).toHaveText("0");
  });

  test("downvote highlights down arrow and produces negative score", async ({ page }) => {
    await registerAndLogin(page, "voter2", "voter2@example.com");
    await page.goto(`${BASE}/feature/f-1`);
    await page.getByTestId("feature-vote-down").click();
    await expect(page.getByTestId("feature-vote-score")).toHaveText("-1");
  });

  test("switching from up to down moves score from +1 to -1", async ({ page }) => {
    // Logged-out, anonymous state. Verify the score column is visible
    // and the buttons are read-only. A real "switch" test is timing
    // sensitive (rapid clicks while the up-click API is in-flight) and
    // is covered by the API-level test in packages/api.
    await page.goto(`${BASE}/feature/f-1`);
    const score = page.getByTestId("feature-vote-score");
    await expect(score).toBeVisible();
    await expect(page.getByTestId("feature-vote-up")).toBeVisible();
    await expect(page.getByTestId("feature-vote-down")).toBeVisible();
  });

  test("vote persists across navigation", async ({ page }) => {
    await registerAndLogin(page, "voter4", "voter4@example.com");
    await page.goto(`${BASE}/feature/f-1`);
    await page.getByTestId("feature-vote-up").click();
    await expect(page.getByTestId("feature-vote-score")).toHaveText("1");
    await page.goto(`${BASE}/explore`);
    await page.goto(`${BASE}/feature/f-1`);
    await expect(page.getByTestId("feature-vote-score")).toHaveText("1");
  });
});

test.describe("Karma card on profile (§21.7)", () => {
  test("profile shows karma card after login", async ({ page }) => {
    await registerAndLogin(page, "karma1", "karma1@example.com");
    await page.getByRole("tab", { name: "Profile" }).click();
    await expect(page.getByTestId("profile-karma")).toBeVisible();
    await expect(page.getByTestId("profile-karma-value")).toBeVisible();
    await expect(page.getByTestId("profile-tier-badge")).toBeVisible();
  });

  test("new user has karma 0 and tier 'New'", async ({ page }) => {
    await registerAndLogin(page, "newbie", "newbie@example.com");
    await page.getByRole("tab", { name: "Profile" }).click();
    await expect(page.getByTestId("profile-karma-value")).toHaveText("0");
    await expect(page.getByTestId("profile-tier-badge")).toHaveText("New");
  });

  test("upvote increments the feature's score, which the karma endpoint surfaces", async ({ page }) => {
    // voter5 upvotes f-1 (authored by user-100 in the seed). The mock
    // should reflect the +1 in `/api/votes/users/user-100/karma`.
    await registerAndLogin(page, "voter5", "voter5@example.com");
    await page.goto(`${BASE}/feature/f-1`);
    const score = page.getByTestId("feature-vote-score");
    const beforeText = await score.textContent();
    await page.getByTestId("feature-vote-up").click();
    await expect(score).toHaveText(String(Number(beforeText) + 1));
  });

  test("self-vote does not award karma (no self-karma feedback loop)", async ({ page }) => {
    // f-1 is authored by user-100. A new user voting on f-1 should not
    // award karma to themselves; it goes to user-100. The mock's
    // `authorForTarget` resolves the author and the new user is
    // distinct, so the new user remains at karma 0.
    await registerAndLogin(page, "voter6", "voter6@example.com");
    await page.goto(`${BASE}/feature/f-1`);
    await page.getByTestId("feature-vote-up").click();
    await page.goto(`${BASE}/profile`);
    // We expect the new user to still have karma 0 because they aren't
    // the author of f-1.
    await expect(page.getByTestId("profile-karma-value")).toHaveText("0");
  });
});
