/**
 * Tests for the Metro proxy middleware.
 *
 * The proxy passes non-production traffic through to the Metro dev
 * server (so the React Native bundle and assets work in dev). In
 * production it must always 404. The proxy is hard to test in
 * isolation because it forwards the request to a real upstream — we
 * stub `globalThis.fetch` to verify the request is shaped correctly.
 *
 * Note: `METRO_URL` is captured at module load time, so we cannot
 * override it from inside a test. Tests that need a non-default
 * upstream URL rely on the actual default (`http://localhost:8081`).
 */
import { describe, expect, test, afterEach } from "bun:test";
import { Hono } from "hono";
import { metroProxy } from "../src/middleware/metro-proxy.js";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

describe("metroProxy middleware", () => {
  test("returns 404 in production regardless of upstream", async () => {
    process.env.NODE_ENV = "production";
    let fetchCalled = false;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      return new Response("upstream", { status: 200 });
    }) as typeof fetch;

    const app = new Hono();
    app.all("*", metroProxy());
    const res = await app.request("/some/path");
    expect(res.status).toBe(404);
    expect(fetchCalled).toBe(false);
  });

  test("forwards GET requests to the configured Metro URL", async () => {
    process.env.NODE_ENV = "development";

    let capturedUrl: string | null = null;
    let capturedInit: RequestInit | null = null;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      capturedUrl = typeof input === "string" ? input : input.toString();
      capturedInit = init ?? null;
      return new Response("proxied", { status: 200, headers: { "x-metro": "yes" } });
    }) as typeof fetch;

    const app = new Hono();
    app.all("*", metroProxy());
    const res = await app.request("/index.bundle?platform=ios", {
      headers: { "x-custom": "value" },
    });
    expect(capturedUrl).toBe("http://localhost:8081/index.bundle?platform=ios");
    expect(capturedInit?.method).toBe("GET");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-metro")).toBe("yes");
  });

  test("forwards POST body to upstream (as ArrayBuffer)", async () => {
    process.env.NODE_ENV = "development";

    let capturedBody: ArrayBuffer | null = null;
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      // The middleware reads the body via `arrayBuffer()`, so the
      // upstream receives an ArrayBuffer — pin that contract.
      capturedBody = (init?.body ?? null) as ArrayBuffer | null;
      return new Response("ok", { status: 200 });
    }) as typeof fetch;

    const app = new Hono();
    app.all("*", metroProxy());
    await app.request("/symbolicate", {
      method: "POST",
      body: "stack-trace-payload",
      headers: { "content-type": "text/plain" },
    });
    expect(capturedBody).toBeInstanceOf(ArrayBuffer);
    expect(new TextDecoder().decode(capturedBody!)).toBe("stack-trace-payload");
  });

  test("returns 502 when Metro is unreachable", async () => {
    process.env.NODE_ENV = "development";

    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;

    const app = new Hono();
    app.all("*", metroProxy());
    const res = await app.request("/x");
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("metro_unreachable");
    expect(body.message).toContain("localhost:8081");
  });
});
