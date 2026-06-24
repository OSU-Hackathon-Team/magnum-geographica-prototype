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
const { searchRoute } = await import("../src/routes/search.js");

const buildApp = () => new Hono().route("/api/search", searchRoute);

describe("GET /api/search", () => {
  test("rejects missing q with 400", async () => {
    const res = await buildApp().request("/api/search");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_input");
  });

  test("returns grouped results for a valid query", async () => {
    const res = await buildApp().request("/api/search?q=hocking&limit=10");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      systems: unknown[];
      trails: unknown[];
      features: unknown[];
    };
    expect(Array.isArray(body.systems)).toBe(true);
    expect(Array.isArray(body.trails)).toBe(true);
    expect(Array.isArray(body.features)).toBe(true);
  });

  test("accepts type=all explicitly", async () => {
    const res = await buildApp().request("/api/search?q=hocking&type=all");
    expect(res.status).toBe(200);
  });

  test("rejects invalid type with 400", async () => {
    const res = await buildApp().request("/api/search?q=hocking&type=banana");
    expect(res.status).toBe(400);
  });

  test("rejects limit above 50", async () => {
    const res = await buildApp().request("/api/search?q=hocking&limit=999");
    expect(res.status).toBe(400);
  });

  test("rejects limit below 1", async () => {
    const res = await buildApp().request("/api/search?q=hocking&limit=0");
    expect(res.status).toBe(400);
  });
});
