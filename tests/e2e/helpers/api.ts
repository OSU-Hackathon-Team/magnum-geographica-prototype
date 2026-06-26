/**
 * Replaces the old in-process `api-mock.ts`. With the real API
 * server running per worker and a per-worker test Postgres, the
 * web app talks to a real backend.
 *
 * Per-worker architecture (Playwright 1.61):
 *
 *   1. `globalSetup` (`packages/api/src/e2e-global-setup.ts`) creates
 *      N databases (magnum_test_0..magnum_test_N-1) in the test
 *      Postgres and applies the Drizzle migrations to each.
 *   2. `playwright/fixtures.ts` provides a worker-scoped
 *      `workerApi` fixture. When the first test in a worker asks
 *      for it, the fixture starts an API server as a child
 *      process, listening on a unique port, pointing at the
 *      worker's database. The fixture is reused by every test
 *      in the worker and torn down when the worker exits.
 *   3. The web app's API client always uses the baked-in
 *      `EXPO_PUBLIC_API_URL` (default `http://localhost:3000`);
 *      a Playwright `page.route` rewrites requests to the
 *      worker's actual host/port.
 */
import type { Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";

const WEB_APP_API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://127.0.0.1:3000";
const BASE_API_PORT = Number(process.env.E2E_BASE_API_PORT ?? 3000);
const TEST_DB_BASE = process.env.E2E_TEST_DB_BASE ?? "magnum_test";
const TEST_USER = "magnum_test";
const TEST_PASSWORD = "magnum_test";
const TEST_HOST = "127.0.0.1";
const TEST_PORT = "54329";

function workerIndex(): number {
  const raw = process.env.TEST_PARALLEL_INDEX;
  if (raw === undefined || raw === "") return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Stable per-worker port. Each Playwright worker gets a
 * unique port derived from `TEST_PARALLEL_INDEX`. Reusing the
 * same index across test files keeps the API server alive
 * (no port churn), but only workers in the same Playwright
 * run share an index — different runs on the same machine
 * would still get fresh ports via the offset.
 */
function workerPort(): number {
  return BASE_API_PORT + workerIndex() + 1;
}

export interface WorkerApi {
  apiUrl: string;
  reset: () => Promise<void>;
  fetch: (
    path: string,
    init?: { method?: string; body?: unknown; token?: string },
  ) => Promise<{ status: number; body: unknown }>;
}

let cached: { api: WorkerApi; child: ChildProcess } | null = null;

export async function startWorkerApi(): Promise<WorkerApi> {
  // The cached module-scoped `cached` is lost on module reload
  // (Bun re-evaluates this file per test file). Check the
  // expected API URL first: if it's already responding, we're
  // reusing an existing server (e.g. from a previous file in
  // the same worker process). This avoids the port-in-use error
  // when the API server is already running.
  const expectedUrl = `http://127.0.0.1:${workerPort()}`;
  try {
    const res = await fetch(`${expectedUrl}/api/health`);
    if (res.ok) {
      const api = buildApi(expectedUrl);
      cached = { api, child: { pid: 0 } as ChildProcess };
      return api;
    }
  } catch {
    // not running, fall through
  }

  if (cached) return cached.api;

  const i = workerIndex();
  const port = workerPort();
  const dbName = `${TEST_DB_BASE}_${i}`;
  const host = "127.0.0.1";
  const url = `http://${host}:${port}`;
  const prefix = `[worker-${i} api]`;

  console.log(`[worker ${i}] starting API server on ${url} (db=${dbName})`);
  const child = spawn("bun", ["run", "packages/api/src/e2e-server.ts"], {
    env: {
      ...process.env,
      MAGNUM_E2E: "1",
      DATABASE_URL: `postgres://${TEST_USER}:${TEST_PASSWORD}@${TEST_HOST}:${TEST_PORT}/${dbName}`,
      E2E_API_PORT: String(port),
      E2E_API_HOST: host,
      JWT_SECRET: "e2e-secret",
      ADMIN_SECRET: "e2e-secret",
      CORS_ORIGINS: "*",
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (d) =>
    process.stdout.write(d.toString().replace(/^/gm, `${prefix} `)),
  );
  child.stderr?.on("data", (d) =>
    process.stderr.write(d.toString().replace(/^/gm, `${prefix} `)),
  );

  // Wait for the API to be ready.
  const start = Date.now();
  while (Date.now() - start < 30_000) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) {
        console.log(`[worker ${i}] API ready at ${url}`);
        break;
      }
    } catch {
      // not ready yet
    }
    await wait(200);
  }
  // Final readiness check.
  const finalRes = await fetch(`${url}/api/health`);
  if (!finalRes.ok) {
    child.kill("SIGKILL");
    throw new Error(`[worker ${i}] API did not become ready in 30s`);
  }

  const api = buildApi(url);
  cached = { api, child };
  return api;
}

export async function stopWorkerApi(): Promise<void> {
  if (!cached) return;
  cached.child.kill("SIGTERM");
  // Give it a moment to shut down gracefully.
  await wait(250);
  if (cached.child.exitCode === null) {
    cached.child.kill("SIGKILL");
  }
  cached = null;
}

function buildApi(url: string): WorkerApi {
  return {
    apiUrl: url,
    async reset() {
      const res = await fetch(`${url}/api/__test/seed`, { method: "POST" });
      if (!res.ok) {
        throw new Error(
          `test endpoint /api/__test/seed failed: ${res.status} ${await res.text()}`,
        );
      }
    },
    async fetch(path, init = {}) {
      const res = await fetch(`${url}${path}`, {
        method: init.method ?? "GET",
        headers: {
          "content-type": "application/json",
          ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
        },
        body: init.body ? JSON.stringify(init.body) : undefined,
      });
      const text = await res.text();
      return {
        status: res.status,
        body: text ? JSON.parse(text) : null,
      };
    },
  };
}

export async function installApi(page?: Page): Promise<void> {
  const api = await startWorkerApi();
  if (page) {
    // Match any request to the web app's API base, regardless of
    // host (localhost vs 127.0.0.1) or port. We use a regex so
    // the match is exact on the host:port prefix.
    const base = new URL(WEB_APP_API_BASE);
    const pattern = new RegExp(
      `^${base.protocol}//${base.host.replace(/\./g, "\\.")}(:\\d+)?/api/`,
    );
    await page.route(pattern, async (route) => {
      const request = route.request();
      const originalUrl = new URL(request.url());
      const targetUrl = `${api.apiUrl}${originalUrl.pathname}${originalUrl.search}`;
      try {
        const response = await fetch(targetUrl, {
          method: request.method(),
          headers: request.headers(),
          body: request.postDataBuffer() ?? undefined,
        });
        const headers: Record<string, string> = {};
        response.headers.forEach((v, k) => {
          headers[k] = v;
        });
        await route.fulfill({
          status: response.status,
          headers,
          body: Buffer.from(await response.arrayBuffer()),
        });
      } catch (err) {
        console.error(`[route error] ${targetUrl}: ${(err as Error).message}`);
        await route.fulfill({
          status: 502,
          contentType: "application/json",
          body: JSON.stringify({ error: "proxy_error", message: (err as Error).message }),
        });
      }
    });
  }
  await api.reset();
}

export async function resetApi(): Promise<void> {
  const api = await startWorkerApi();
  await api.reset();
}

export async function loginSeededUser(
  username: "hiker1" | "admin",
): Promise<string> {
  const api = await startWorkerApi();
  const creds =
    username === "admin"
      ? { email: "admin@example.com", password: "adminpass" }
      : { email: "hiker1@example.com", password: "password123" };
  const r = await api.fetch("/api/auth/login", {
    method: "POST",
    body: creds,
  });
  if (r.status !== 200) {
    throw new Error(`login failed: ${r.status}`);
  }
  return (r.body as { access_token: string }).access_token;
}

export async function apiFetch(
  page: Page,
  path: string,
  init: { method?: string; body?: unknown; token?: string } = {},
): Promise<{ status: number; body: unknown }> {
  const api = await startWorkerApi();
  return page.evaluate(
    async ({ apiBase, path, method, body, token }) => {
      const res = await fetch(`${apiBase}${path}`, {
        method: method ?? "GET",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      return {
        status: res.status,
        body: text ? JSON.parse(text) : null,
      };
    },
    {
      apiBase: api.apiUrl,
      path,
      method: init.method,
      body: init.body,
      token: init.token,
    },
  );
}
