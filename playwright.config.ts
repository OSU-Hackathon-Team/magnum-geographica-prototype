import { defineConfig, devices } from "@playwright/test";

const APP_PORT = 4173;
const MOCK_API_HOST = "localhost:9999";
const APP_DIST = "tests/e2e/.app";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  outputDir: "tests/e2e/.results",

  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: `bun run build:e2e && bun tests/e2e/serve.ts ${APP_DIST} ${APP_PORT} 127.0.0.1`,
    url: `http://localhost:${APP_PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    stdout: "ignore",
    stderr: "pipe",
    env: {
      EXPO_PUBLIC_API_URL: `http://${MOCK_API_HOST}`,
    },
  },
});
