import { test, expect } from "@playwright/test";
import { installApi, resetApi } from "../helpers/api.js";

test.beforeEach(async ({ page }) => {
  await installApi(page);
});

test.afterEach(() => {
  resetApi();
});

test.describe("Auth flow — navigation and UI", () => {
  test("profile shows login and register buttons when not authenticated", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.getByTestId("profile-screen")).toBeVisible();
    // Unauthenticated users are attributed to their public IP, Wikipedia-style.
    await expect(page.getByTestId("profile-contributor")).toHaveText(/^IP:[\d.:a-fA-F]+$/);
    await expect(page.getByTestId("profile-ip-note")).toBeVisible();
    await expect(page.getByTestId("profile-login")).toBeVisible();
    await expect(page.getByTestId("profile-register")).toBeVisible();
  });

  test("click login navigates to login screen", async ({ page }) => {
    await page.goto("/profile");
    await page.getByTestId("profile-login").click();
    await expect(page).toHaveURL(/\/auth\/login$/);
    await expect(page.getByTestId("login-screen")).toBeVisible();
    await expect(page.getByTestId("login-email")).toBeVisible();
    await expect(page.getByTestId("login-password")).toBeVisible();
    await expect(page.getByTestId("login-submit")).toBeVisible();
  });

  test("click register navigates to register screen", async ({ page }) => {
    await page.goto("/profile");
    await page.getByTestId("profile-register").click();
    await expect(page).toHaveURL(/\/auth\/register$/);
    await expect(page.getByTestId("register-screen")).toBeVisible();
    await expect(page.getByTestId("register-username")).toBeVisible();
    await expect(page.getByTestId("register-email")).toBeVisible();
    await expect(page.getByTestId("register-password")).toBeVisible();
    await expect(page.getByTestId("register-confirm-password")).toBeVisible();
    await expect(page.getByTestId("register-submit")).toBeVisible();
  });

  test("login ↔ register links navigate both ways", async ({ page }) => {
    await page.goto("/auth/login");
    await page.getByTestId("login-to-register").click();
    await expect(page).toHaveURL(/\/auth\/register$/);

    await page.getByTestId("register-to-login").click();
    await expect(page).toHaveURL(/\/auth\/login$/);
  });
});

test.describe("Auth flow — login validation", () => {
  test("shows error with empty fields", async ({ page }) => {
    await page.goto("/auth/login");
    await page.getByTestId("login-submit").click();
    await expect(page.getByText("Email and password are required")).toBeVisible();
  });

  test("shows error with missing password", async ({ page }) => {
    await page.goto("/auth/login");
    await page.getByTestId("login-email").fill("test@example.com");
    await page.getByTestId("login-submit").click();
    await expect(page.getByText("Email and password are required")).toBeVisible();
  });

  test("shows error with missing email", async ({ page }) => {
    await page.goto("/auth/login");
    await page.getByTestId("login-password").fill("password123");
    await page.getByTestId("login-submit").click();
    await expect(page.getByText("Email and password are required")).toBeVisible();
  });
});

test.describe("Auth flow — register validation", () => {
  test("shows error with empty fields", async ({ page }) => {
    await page.goto("/auth/register");
    await page.getByTestId("register-submit").click();
    await expect(page.getByText("All fields are required")).toBeVisible();
  });

  test("validates password minimum length", async ({ page }) => {
    await page.goto("/auth/register");
    await page.getByTestId("register-username").fill("testuser");
    await page.getByTestId("register-email").fill("test@example.com");
    await page.getByTestId("register-password").fill("short");
    await page.getByTestId("register-confirm-password").fill("short");
    await page.getByTestId("register-submit").click();
    await expect(page.getByText("Password must be at least 8 characters")).toBeVisible();
  });

  test("validates passwords must match", async ({ page }) => {
    await page.goto("/auth/register");
    await page.getByTestId("register-username").fill("testuser");
    await page.getByTestId("register-email").fill("test@example.com");
    await page.getByTestId("register-password").fill("password123");
    await page.getByTestId("register-confirm-password").fill("different");
    await page.getByTestId("register-submit").click();
    await expect(page.getByText("Passwords do not match")).toBeVisible();
  });
});

test.describe("Auth flow — password manager form attributes", () => {
  test("login form renders as HTML <form> element on web", async ({ page }) => {
    await page.goto("/auth/login");
    const form = page.locator("form");
    await expect(form).toBeAttached();
  });

  test("register form renders as HTML <form> element on web", async ({ page }) => {
    await page.goto("/auth/register");
    const form = page.locator("form");
    await expect(form).toBeAttached();
  });

  test("login email has correct autocomplete", async ({ page }) => {
    await page.goto("/auth/login");
    await expect(page.getByTestId("login-email")).toHaveAttribute("autocomplete", "email");
  });

  test("login password has correct autocomplete", async ({ page }) => {
    await page.goto("/auth/login");
    await expect(page.getByTestId("login-password")).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
  });

  test("register username has correct autocomplete", async ({ page }) => {
    await page.goto("/auth/register");
    await expect(page.getByTestId("register-username")).toHaveAttribute("autocomplete", "username");
  });

  test("register email has correct autocomplete", async ({ page }) => {
    await page.goto("/auth/register");
    await expect(page.getByTestId("register-email")).toHaveAttribute("autocomplete", "email");
  });

  test("register password fields have correct autocomplete", async ({ page }) => {
    await page.goto("/auth/register");
    await expect(page.getByTestId("register-password")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
    await expect(page.getByTestId("register-confirm-password")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
  });

  test("password fields are type=password", async ({ page }) => {
    await page.goto("/auth/login");
    await expect(page.getByTestId("login-password")).toHaveAttribute("type", "password");

    await page.goto("/auth/register");
    await expect(page.getByTestId("register-password")).toHaveAttribute("type", "password");
    await expect(page.getByTestId("register-confirm-password")).toHaveAttribute("type", "password");
  });
});

test.describe("Auth flow — successful login", () => {
  test("registers and logs in through the full flow", async ({ page }) => {
    // Navigate to register
    await page.goto("/auth/register");
    await page.getByTestId("register-username").fill("trailhiker42");
    await page.getByTestId("register-email").fill("trailhiker42@example.com");
    await page.getByTestId("register-password").fill("securepass123");
    await page.getByTestId("register-confirm-password").fill("securepass123");

    // Submit registration
    await page.getByTestId("register-submit").click();

    // Should redirect to tabs after successful registration
    await expect(page).toHaveURL(/\/explore$/);

    // Profile should show authenticated user
    await page.getByRole("tab", { name: "Profile" }).click();
    await expect(page.getByTestId("profile-username")).toHaveText("trailhiker42");
    await expect(page.getByTestId("profile-logout")).toBeVisible();
    await expect(page.getByTestId("profile-login")).not.toBeAttached();
  });

  test("login form submits successfully with valid credentials", async ({ page }) => {
    // First register via the form
    await page.goto("/auth/register");
    await page.getByTestId("register-username").fill("hiker99");
    await page.getByTestId("register-email").fill("hiker99@example.com");
    await page.getByTestId("register-password").fill("mypassword123");
    await page.getByTestId("register-confirm-password").fill("mypassword123");
    await page.getByTestId("register-submit").click();

    // Should redirect to tabs after successful registration
    await expect(page).toHaveURL(/\/explore$/);

    // Then log out
    await page.goto("/profile");
    await page.getByTestId("profile-logout").click();

    // Should be back to the IP-based contributor name
    await expect(page.getByTestId("profile-contributor")).toHaveText(/^IP:[\d.:a-fA-F]+$/);
    await expect(page.getByTestId("profile-ip-note")).toBeVisible();
    await expect(page.getByTestId("profile-login")).toBeVisible();

    // Log back in
    await page.getByTestId("profile-login").click();
    await expect(page).toHaveURL(/\/auth\/login$/);
    await page.getByTestId("login-email").fill("hiker99@example.com");
    await page.getByTestId("login-password").fill("mypassword123");
    await page.getByTestId("login-submit").click();

    // Should redirect to tabs
    await expect(page).toHaveURL(/\/explore$/);
    await page.getByRole("tab", { name: "Profile" }).click();
    await expect(page.getByTestId("profile-username").first()).toHaveText("hiker99");
  });
});
