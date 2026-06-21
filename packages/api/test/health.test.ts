import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { healthRoute } from "../src/routes/health.js";

const buildApp = () => new Hono().route("/api/health", healthRoute);

describe("GET /api/health", () => {
  test("returns ok with version and time", async () => {
    const res = await buildApp().request("/api/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; version: string; time: string; database: string };
    expect(body.status).toBe("ok");
    expect(body.version).toBe("0.0.1");
    expect(typeof body.time).toBe("string");
    expect(["ok", "unreachable"]).toContain(body.database);
  });
});
