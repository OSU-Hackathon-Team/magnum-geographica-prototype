import { describe, expect, test, mock } from "bun:test";
import { createMockDb } from "./helpers/mockDb.js";

const { db, state } = createMockDb();

mock.module("../src/db/index.js", () => ({
  db,
  pool: { end: () => Promise.resolve() },
  schema: {},
}));

// Mock auth middleware to pass through (the mock test doesn't test auth).
mock.module("../src/middleware/auth.js", () => ({
  authRequired: () => async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", { id: "00000000-0000-4000-a000-000000000099", username: "tester", email: "test@test.com", role: "contributor", karma: 100, tier: "established" });
    await next();
  },
  moderatorRequired: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

const { Hono } = await import("hono");
const { trailsRoute } = await import("../src/routes/trails.js");

const buildApp = () => new Hono().route("/api/trails", trailsRoute);

describe("GET /api/trails", () => {
  test("returns paginated trails", async () => {
    const res = await buildApp().request("/api/trails");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[]; page: number; pageSize: number };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.page).toBe(1);
  });
});

describe("GET /api/trails/:id", () => {
  test("returns 404 when trail is not found", async () => {
    const res = await buildApp().request("/api/trails/00000000-0000-0000-0000-000000000099");
    expect(res.status).toBe(404);
  });
});

describe("POST /api/trails", () => {
  test("rejects unknown difficulty", async () => {
    state.insertCalls.length = 0;
    const res = await buildApp().request("/api/trails", {
      method: "POST",
      headers: { "x-forwarded-for": "127.0.0.1", "content-type": "application/json" },
      body: JSON.stringify({
        name: "X",
        slug: "x",
        difficulty: "absurd",
      }),
    });
    expect(res.status).toBe(400);
    expect(state.insertCalls.length).toBe(0);
  });

  test("accepts a valid trail and inserts it", async () => {
    state.insertCalls.length = 0;
    const res = await buildApp().request("/api/trails", {
      method: "POST",
      headers: { "x-forwarded-for": "127.0.0.1", "content-type": "application/json" },
      body: JSON.stringify({
        name: "Buckeye",
        slug: "buckeye",
        difficulty: "moderate",
        length_meters: 2324200,
      }),
    });
    expect(res.status).toBe(201);
    expect(state.insertCalls.length).toBeGreaterThanOrEqual(1);
    const trailInsert = state.insertCalls.find((c) => c.table === "trails");
    expect(trailInsert).toBeDefined();
    const values = trailInsert!.values as { name: string; difficulty: string };
    expect(values.name).toBe("Buckeye");
    expect(values.difficulty).toBe("moderate");
  });
});
