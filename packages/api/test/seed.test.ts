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
const { seedRoute } = await import("../src/routes/seed.js");

const buildApp = () => new Hono().route("/api/seed", seedRoute);

describe("POST /api/seed", () => {
  test("runs with admin secret in any environment", async () => {
    const res = await buildApp().request("/api/seed", {
      method: "POST",
      headers: { "x-admin-secret": "dev-secret-change-me" },
    });
    expect([200, 500]).toContain(res.status);
  });

  test("returns 401 in production without admin secret", async () => {
    const prevEnv = process.env.NODE_ENV;
    const prevSecret = process.env.ADMIN_SECRET;
    process.env.NODE_ENV = "production";
    process.env.ADMIN_SECRET = "prod-secret";
    try {
      const res = await buildApp().request("/api/seed", { method: "POST" });
      expect(res.status).toBe(401);
    } finally {
      process.env.NODE_ENV = prevEnv;
      if (prevSecret === undefined) delete process.env.ADMIN_SECRET;
      else process.env.ADMIN_SECRET = prevSecret;
    }
  });

  test("runs in production with the correct admin secret", async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    process.env.ADMIN_SECRET = "prod-secret";
    try {
      const res = await buildApp().request("/api/seed", {
        method: "POST",
        headers: { "x-admin-secret": "prod-secret" },
      });
      expect([200, 500]).toContain(res.status);
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });
});
