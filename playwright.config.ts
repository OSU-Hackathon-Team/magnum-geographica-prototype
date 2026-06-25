import { defineConfig, devices } from "@playwright/test";

const APP_PORT = 4173;
const BASE_API_PORT = Number(process.env.E2E_BASE_API_PORT ?? 3000);
const WORKER_COUNT = Number(process.env.TEST_WORKERS ?? 4);
const APP_DIST = "tests/e2e/.app";

/**
 * Per-worker architecture:
 *   1. `globalSetup` (`packages/api/src/e2e-global-setup.ts`) creates
 *      N databases (magnum_test_0..magnum_test_N-1) in the test
 *      Postgres and applies the Drizzle migrations to each.
 *   2. Each worker process, on its first test, lazily starts its
 *      own API server (see `helpers/api.ts`). The server listens
 *      on `BASE_API_PORT + parallelIndex + 1` and points at
 *      `magnum_test_<parallelIndex>`.
 *   3. The web app's API client uses the baked-in
 *      `EXPO_PUBLIC_API_URL=http://localhost:3000`; per-test
 *      routes installed by `installApi(page)` rewrite that to
 *      the worker's actual host.
 *
 * The web app is built once with the fixed URL; we don't
 * rebuild per worker.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  // Tests within a file run sequentially in the same worker
  // process — this lets the worker-scoped API server fixture
  // be reused across all tests in a file. Different files
  // run in parallel in different worker processes (each with
  // its own API server and database).
  fullyParallel: false,
  workers: WORKER_COUNT,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  outputDir: "tests/e2e/.results",

  timeout: 30_000,
  expect: { timeout: 5_000 },

  globalSetup: "./packages/api/src/e2e-global-setup.ts",

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
      EXPO_PUBLIC_API_URL: `http://127.0.0.1:${BASE_API_PORT}`,
    },
  },
});
