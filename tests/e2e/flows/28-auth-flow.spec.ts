import { test, expect } from "@playwright/test";
import { installApiMock } from "../helpers/api-mock.js";

test.beforeEach(async ({ page }) => {
  await installApiMock(page);
});

test.describe("Auth flow", () => {
  test("profile shows login and register buttons when not authenticated", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.getByTestId("profile-screen")).toBeVisible();
    await expect(page.getByTestId("profile-contributor")).toHaveText("anonymous");
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

  test("login screen shows error with empty fields", async ({ page }) => {
    await page.goto("/auth/login");
    await page.getByTestId("login-submit").click();
    await expect(page.getByText("Email and password are required")).toBeVisible();
  });

  test("login screen shows navigation link to register", async ({ page }) => {
    await page.goto("/auth/login");
    await page.getByTestId("login-to-register").click();
    await expect(page).toHaveURL(/\/auth\/register$/);
  });

  test("register screen shows navigation link to login", async ({ page }) => {
    await page.goto("/auth/register");
    await page.getByTestId("register-to-login").click();
    await expect(page).toHaveURL(/\/auth\/login$/);
  });

  test("register screen validates password length", async ({ page }) => {
    await page.goto("/auth/register");
    await page.getByTestId("register-username").fill("testuser");
    await page.getByTestId("register-email").fill("test@example.com");
    await page.getByTestId("register-password").fill("short");
    await page.getByTestId("register-confirm-password").fill("short");
    await page.getByTestId("register-submit").click();
    await expect(page.getByText("Password must be at least 8 characters")).toBeVisible();
  });

  test("register screen validates password match", async ({ page }) => {
    await page.goto("/auth/register");
    await page.getByTestId("register-username").fill("testuser");
    await page.getByTestId("register-email").fill("test@example.com");
    await page.getByTestId("register-password").fill("password123");
    await page.getByTestId("register-confirm-password").fill("different");
    await page.getByTestId("register-submit").click();
    await expect(page.getByText("Passwords do not match")).toBeVisible();
  });
});
