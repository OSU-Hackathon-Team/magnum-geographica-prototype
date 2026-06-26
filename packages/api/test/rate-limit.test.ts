/**
 * Tests for the rate-limit middleware.
 *
 * The rate limiter is in-memory and uses a global `store` Map that
 * survives across tests in the same process. Each test uses a unique
 * `keyFn` to avoid cross-test interference. The store does not reset
 * between tests — that's a known limitation, not a bug, since in
 * production the keys are derived from real client IPs and the window
 * expires in 60s.
 */
import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { rateLimit, strictRateLimit } from "../src/middleware/rate-limit.js";

describe("rateLimit middleware (custom config)", () => {
  test("passes through requests under the limit and sets headers", async () => {
    const app = new Hono();
    app.use("*", rateLimit({ max: 3, windowMs: 60_000, keyFn: () => "test:basic" }));
    app.get("/x", (c) => c.json({ ok: true }));

    const res = await app.request("/x");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-ratelimit-limit")).toBe("3");
    expect(res.headers.get("x-ratelimit-remaining")).toBe("2");
    expect(res.headers.get("x-ratelimit-reset")).toBeDefined();
  });

  test("returns 429 once the limit is exceeded", async () => {
    const app = new Hono();
    app.use("*", rateLimit({ max: 2, windowMs: 60_000, keyFn: () => "test:overlimit" }));
    app.get("/x", (c) => c.json({ ok: true }));

    await app.request("/x"); // 1
    await app.request("/x"); // 2
    const res = await app.request("/x"); // 3 — over the limit
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("rate_limited");
    expect(body.message).toMatch(/too many requests/i);
    expect(res.headers.get("x-ratelimit-remaining")).toBe("0");
  });

  test("uses x-forwarded-for for the key when no user is on the context", async () => {
    const app = new Hono();
    app.use(
      "*",
      rateLimit({
        max: 1,
        windowMs: 60_000,
        keyFn: (c) => `ip:${c.req.header("x-forwarded-for") ?? "anon"}`,
      }),
    );
    app.get("/x", (c) => c.json({ ok: true }));

    const a1 = await app.request("/x", { headers: { "x-forwarded-for": "10.0.0.1" } });
    const a2 = await app.request("/x", { headers: { "x-forwarded-for": "10.0.0.1" } });
    const b1 = await app.request("/x", { headers: { "x-forwarded-for": "10.0.0.2" } });
    expect(a1.status).toBe(200);
    expect(a2.status).toBe(429);
    expect(b1.status).toBe(200);
  });

  test("uses x-real-ip as a fallback when x-forwarded-for is absent", async () => {
    const app = new Hono();
    app.use(
      "*",
      rateLimit({
        max: 1,
        windowMs: 60_000,
        keyFn: (c) => `ip:${c.req.header("x-real-ip") ?? "127.0.0.1"}`,
      }),
    );
    app.get("/x", (c) => c.json({ ok: true }));

    const a1 = await app.request("/x", { headers: { "x-real-ip": "10.1.1.1" } });
    const a2 = await app.request("/x", { headers: { "x-real-ip": "10.1.1.1" } });
    const b1 = await app.request("/x", { headers: { "x-real-ip": "10.1.1.2" } });
    expect(a1.status).toBe(200);
    expect(a2.status).toBe(429);
    expect(b1.status).toBe(200);
  });

  test("uses user id from context when present", async () => {
    type Vars = { user?: { id: string } };
    const app = new Hono<{ Variables: Vars }>();
    app.use("*", async (c, next) => {
      c.set("user", { id: c.req.header("x-test-user") ?? "anon" });
      await next();
    });
    app.use(
      "*",
      rateLimit({
        max: 1,
        windowMs: 60_000,
        keyFn: (c) => `user:${c.get("user")?.id ?? "anon"}`,
      }),
    );
    app.get("/x", (c) => c.json({ ok: true }));

    const a1 = await app.request("/x", { headers: { "x-test-user": "u-1" } });
    const a2 = await app.request("/x", { headers: { "x-test-user": "u-1" } });
    const b1 = await app.request("/x", { headers: { "x-test-user": "u-2" } });
    expect(a1.status).toBe(200);
    expect(a2.status).toBe(429);
    expect(b1.status).toBe(200);
  });

  test("remaining count decreases monotonically", async () => {
    const app = new Hono();
    app.use("*", rateLimit({ max: 5, windowMs: 60_000, keyFn: () => "test:monotonic" }));
    app.get("/x", (c) => c.json({ ok: true }));

    const rems: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await app.request("/x");
      rems.push(Number(res.headers.get("x-ratelimit-remaining")));
    }
    expect(rems).toEqual([4, 3, 2, 1]);
  });
});

describe("strictRateLimit middleware", () => {
  test("uses a 10-per-minute budget by default", async () => {
    const app = new Hono();
    app.use("*", strictRateLimit());
    app.get("/x", (c) => c.json({ ok: true }));

    const res = await app.request("/x", {
      headers: { "x-forwarded-for": "192.168.99.99" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("x-ratelimit-limit")).toBe("10");
    expect(res.headers.get("x-ratelimit-remaining")).toBe("9");
  });
});

describe("rateLimit middleware (default config)", () => {
  test("uses a 30-per-minute budget by default", async () => {
    const app = new Hono();
    app.use("*", rateLimit());
    app.get("/x", (c) => c.json({ ok: true }));

    const res = await app.request("/x", {
      headers: { "x-forwarded-for": "192.168.99.100" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("x-ratelimit-limit")).toBe("30");
    expect(res.headers.get("x-ratelimit-remaining")).toBe("29");
  });
});
