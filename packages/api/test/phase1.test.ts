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
const { tilesRoute } = await import("../src/routes/tiles.js");

const buildApp = () => {
  const app = new Hono();
  app.route("/api/systems", systemsRoute);
  app.route("/api/tiles", tilesRoute);
  return app;
};

describe("GET /api/systems/by-slug/:slug", () => {
  test("returns 404 when system is not found", async () => {
    state.systems.length = 0;
    const res = await buildApp().request("/api/systems/by-slug/does-not-exist");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("not_found");
  });

  test("returns 200 when system is found", async () => {
    state.systems.length = 0;
    state.systems.push({ id: "sys-1", name: "X", slug: "x" });
    const res = await buildApp().request("/api/systems/by-slug/x");
    expect(res.status).toBe(200);
  });
});

describe("GET /api/systems/:id/trails", () => {
  test("returns 404 when system is not found", async () => {
    state.systems.length = 0;
    state.trails.length = 0;
    const res = await buildApp().request(
      "/api/systems/00000000-0000-0000-0000-000000000099/trails",
    );
    expect(res.status).toBe(404);
  });

  test("returns trails list when system exists", async () => {
    state.systems.length = 0;
    state.trails.length = 0;
    state.systems.push({ id: "sys-1" });
    state.trails.push({ id: "t-1", name: "Buckeye" });
    const res = await buildApp().request("/api/systems/sys-1/trails");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[]; total: number };
    expect(Array.isArray(body.items)).toBe(true);
  });
});

describe("GET /api/tiles/system/:id/trails.geojson", () => {
  test("returns a FeatureCollection", async () => {
    state.trails.length = 0;
    const res = await buildApp().request(
      "/api/tiles/system/00000000-0000-0000-0000-000000000001/trails.geojson",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { type: string; features: unknown[] };
    expect(body.type).toBe("FeatureCollection");
    expect(Array.isArray(body.features)).toBe(true);
  });
});

describe("GET /api/tiles/system/:id/features.geojson", () => {
  test("returns a FeatureCollection", async () => {
    const res = await buildApp().request(
      "/api/tiles/system/00000000-0000-0000-0000-000000000001/features.geojson",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { type: string };
    expect(body.type).toBe("FeatureCollection");
  });
});
