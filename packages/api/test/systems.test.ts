import { describe, expect, test } from "bun:test";
import { mock } from "bun:test";
import { createMockDb } from "./helpers/mockDb.js";

const { db, state } = createMockDb();

mock.module("../src/db/index.js", () => ({
  db,
  pool: { end: () => Promise.resolve() },
  schema: {},
}));

const { Hono } = await import("hono");
const { systemsRoute } = await import("../src/routes/systems.js");

const buildApp = () => new Hono().route("/api/systems", systemsRoute);

describe("GET /api/systems", () => {
  test("returns paginated list", async () => {
    const res = await buildApp().request("/api/systems");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[]; total: number; page: number; pageSize: number };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(20);
  });

  test("clamps pageSize to 100 and page to min 1", async () => {
    const res = await buildApp().request("/api/systems?page=0&pageSize=999");
    const body = (await res.json()) as { page: number; pageSize: number };
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(100);
  });
});

describe("GET /api/systems/:id", () => {
  test("returns 404 when system is not found", async () => {
    const res = await buildApp().request("/api/systems/00000000-0000-0000-0000-000000000099");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("not_found");
  });
});

describe("POST /api/systems", () => {
  test("rejects invalid input with 400", async () => {
    state.insertCalls.length = 0;
    const res = await buildApp().request("/api/systems", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "", slug: "Invalid Slug With Spaces" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; details: { fieldErrors: Record<string, string[]> } };
    expect(body.error).toBe("invalid_input");
    expect(body.details.fieldErrors).toBeDefined();
    expect(state.insertCalls.length).toBe(0);
  });

  test("rejects non-JSON body with 400", async () => {
    const res = await buildApp().request("/api/systems", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });

  test("accepts a valid system and inserts it", async () => {
    state.insertCalls.length = 0;
    const res = await buildApp().request("/api/systems", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Hocking Hills", slug: "hocking-hills" }),
    });
    expect(res.status).toBe(201);
    expect(state.insertCalls.length).toBe(1);
    const values = state.insertCalls[0]?.values as { name: string; slug: string };
    expect(values.name).toBe("Hocking Hills");
    expect(values.slug).toBe("hocking-hills");
  });
});
