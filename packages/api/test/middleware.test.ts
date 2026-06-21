import { describe, expect, test } from "bun:test";
import { mock } from "bun:test";
import { createMockDb } from "./helpers/mockDb.js";

const { db } = createMockDb();

mock.module("../src/db/index.js", () => ({
  db,
  pool: { end: () => Promise.resolve() },
  schema: {},
}));

const { Hono } = await import("hono");
const { corsMiddleware } = await import("../src/middleware/cors.js");
const { adminOnly } = await import("../src/middleware/auth.js");

describe("corsMiddleware", () => {
  test("adds CORS headers for allowed origin", async () => {
    const app = new Hono();
    app.use("*", corsMiddleware({ origins: ["http://allowed.example"] }));
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test", {
      headers: { origin: "http://allowed.example" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBe("http://allowed.example");
    expect(res.headers.get("access-control-allow-methods")).toContain("GET");
  });

  test("does not add CORS headers for disallowed origin", async () => {
    const app = new Hono();
    app.use("*", corsMiddleware({ origins: ["http://allowed.example"] }));
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test", {
      headers: { origin: "http://evil.example" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("OPTIONS request returns 204", async () => {
    const app = new Hono();
    app.use("*", corsMiddleware({ origins: ["*"] }));
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test", { method: "OPTIONS" });
    expect(res.status).toBe(204);
  });
});

describe("adminOnly middleware", () => {
  test("returns 401 without the admin secret", async () => {
    const app = new Hono();
    app.use("/admin/*", adminOnly());
    app.get("/admin/secret", (c) => c.json({ ok: true }));

    const res = await app.request("/admin/secret");
    expect(res.status).toBe(401);
  });

  test("returns 401 with the wrong secret", async () => {
    const app = new Hono();
    app.use("/admin/*", adminOnly());
    app.get("/admin/secret", (c) => c.json({ ok: true }));

    const res = await app.request("/admin/secret", {
      headers: { "x-admin-secret": "wrong" },
    });
    expect(res.status).toBe(401);
  });

  test("passes through with the correct secret", async () => {
    const app = new Hono();
    app.use("/admin/*", adminOnly());
    app.get("/admin/secret", (c) => c.json({ ok: true }));

    const res = await app.request("/admin/secret", {
      headers: { "x-admin-secret": "dev-secret-change-me" },
    });
    expect(res.status).toBe(200);
  });
});
