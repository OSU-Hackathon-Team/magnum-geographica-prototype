/**
 * Playwright fixtures providing worker-scoped API server and
 * page-level API routing.
 *
 * The fixture creates the per-worker API server once when the
 * first test asks for it (Playwright runs each test in its own
 * process when `fullyParallel: true`; the fixture body still
 * runs at most once per test but the API server is cached
 * process-globally for the worker's lifetime).
 *
 * Specs should import the extended `test` from this file:
 *   import { test, expect } from "../../playwright/fixtures.js";
 */
import { test as base, expect, type Page } from "@playwright/test";
import {
  installApi,
  startWorkerApi,
  type WorkerApi,
} from "./helpers/api.js";

export { expect };

/**
 * Worker-scoped fixture that lazily starts the per-worker API
 * server. Tests use it via the `workerApi` parameter:
 *
 *   test("...", async ({ workerApi }) => { ... });
 */
export const test = base.extend<{ workerApi: WorkerApi }>({
  workerApi: [
    async ({ }, use) => {
      const api = await startWorkerApi();
      await use(api);
    },
    { scope: "worker" },
  ],
});

/**
 * Per-test fixture that installs the API route bridge and
 * seeds the worker database. Use this as the first action in
 * every test (or in `test.beforeEach`).
 */
export const seedTest = base.extend<{
  seedTest: void;
}>({
  seedTest: [
    async ({ page }, use) => {
      await installApi(page);
      await use();
    },
    { auto: true } as never,
  ],
});
