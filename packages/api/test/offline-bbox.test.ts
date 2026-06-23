import { describe, expect, test } from "bun:test";
import { mock } from "bun:test";
import { createMockDb } from "./helpers/mockDb.js";

const { db, state } = createMockDb();

mock.module("../src/db/index.js", () => ({
  db,
  pool: { end: () => Promise.resolve() },
  schema: {},
}));

mock.module("../src/services/offline-pack.js", () => ({
  estimateTileCount: (bbox: { minZoom: number; maxZoom: number }) => {
    let count = 0;
    for (let z = bbox.minZoom; z <= bbox.maxZoom; z++) {
      count += Math.pow(4, z);
    }
    return count;
  },
  generateBboxPack: async () => {
    throw new Error("Not implemented in test mock");
  },
  buildTar: () => Buffer.alloc(1024),
  enumerateTiles: () => [],
}));

const { Hono } = await import("hono");
const { offlineRoute } = await import("../src/routes/offline.js");

const buildApp = () => new Hono().route("/api/offline-bbox", offlineRoute);

describe("POST /api/offline-bbox/info", () => {
  test("rejects missing body with 400", async () => {
    const res = await buildApp().request("/api/offline-bbox/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_input");
  });

  test("rejects invalid bbox with min > max", async () => {
    const res = await buildApp().request("/api/offline-bbox/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        minLon: 10,
        minLat: 10,
        maxLon: -10,
        maxLat: -10,
        baseLayerId: "simplified",
        minZoom: 2,
        maxZoom: 8,
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_input");
  });

  test("returns tile estimate for valid bbox", async () => {
    const res = await buildApp().request("/api/offline-bbox/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        minLon: -83.5,
        minLat: 39.5,
        maxLon: -82.5,
        maxLat: 40.5,
        baseLayerId: "simplified",
        minZoom: 2,
        maxZoom: 8,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.tileCount).toBe("number");
    expect(body.tileCount).toBeGreaterThan(0);
    expect(typeof body.estimatedTileBytes).toBe("number");
    expect(body.estimatedTileBytes).toBeGreaterThan(0);
    expect(typeof body.totalEstimatedBytes).toBe("number");
    expect(body.totalEstimatedBytes).toBeGreaterThan(0);
  });

  test("satellite layer uses larger tile estimate", async () => {
    const mvtRes = await buildApp().request("/api/offline-bbox/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        minLon: -83.5,
        minLat: 39.5,
        maxLon: -82.5,
        maxLat: 40.5,
        baseLayerId: "simplified",
        minZoom: 2,
        maxZoom: 8,
      }),
    });
    const mvtBody = await mvtRes.json();

    const satRes = await buildApp().request("/api/offline-bbox/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        minLon: -83.5,
        minLat: 39.5,
        maxLon: -82.5,
        maxLat: 40.5,
        baseLayerId: "satellite",
        minZoom: 2,
        maxZoom: 8,
      }),
    });
    const satBody = await satRes.json();

    expect(satBody.tileCount).toBe(mvtBody.tileCount);
    expect(satBody.estimatedTileBytes).toBeGreaterThan(mvtBody.estimatedTileBytes);
  });

  test("rejects out-of-range coordinates", async () => {
    const res = await buildApp().request("/api/offline-bbox/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        minLon: -200,
        minLat: 0,
        maxLon: 0,
        maxLat: 0,
        baseLayerId: "simplified",
        minZoom: 2,
        maxZoom: 8,
      }),
    });
    expect(res.status).toBe(400);
  });

  test("rejects zoom values out of range", async () => {
    const res = await buildApp().request("/api/offline-bbox/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        minLon: -83,
        minLat: 39,
        maxLon: -82,
        maxLat: 40,
        baseLayerId: "simplified",
        minZoom: 20,
        maxZoom: 25,
      }),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/offline-bbox/generate", () => {
  test("rejects missing body", async () => {
    const res = await buildApp().request("/api/offline-bbox/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  test("rejects invalid bbox", async () => {
    const res = await buildApp().request("/api/offline-bbox/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        minLon: -83,
        minLat: 39,
        maxLon: -82,
        maxLat: 40,
        baseLayerId: "simplified",
        minZoom: 0,
        maxZoom: -1,
      }),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/offline-bbox/:packId/download", () => {
  test("returns 404 for non-existent pack", async () => {
    const res = await buildApp().request("/api/offline-bbox/nonexistent/download");
    expect(res.status).toBe(404);
  });
});

describe("GET /api/offline-bbox/:packId/data", () => {
  test("returns 404 for non-existent pack", async () => {
    const res = await buildApp().request("/api/offline-bbox/nonexistent/data");
    expect(res.status).toBe(404);
  });
});

describe("GET /api/offline-bbox/:packId/status", () => {
  test("returns 404 for non-existent pack", async () => {
    const res = await buildApp().request("/api/offline-bbox/nonexistent/status");
    expect(res.status).toBe(404);
  });
});
