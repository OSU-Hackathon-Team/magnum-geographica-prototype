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
const { segmentDetailRoute, trailSegmentsRoute } = await import("../src/routes/segments.js");

const buildApp = () =>
  new Hono().route("/api/segments", segmentDetailRoute).route("/api/trails", trailSegmentsRoute);

describe("GET /api/segments/:id", () => {
  test("returns 404 when segment not found", async () => {
    const res = await buildApp().request("/api/segments/00000000-0000-0000-0000-000000000099");
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/segments/:id", () => {
  test("rejects empty body with 400", async () => {
    const res = await buildApp().request("/api/segments/00000000-0000-0000-0000-000000000001", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  test("rejects unknown surface_type", async () => {
    const res = await buildApp().request("/api/segments/00000000-0000-0000-0000-000000000001", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ surface_type: "moon-dust" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/segments/:id", () => {
  test("deletes a segment successfully", async () => {
    const res = await buildApp().request("/api/segments/00000000-0000-0000-0000-000000000001", {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});

describe("POST /api/trails/:id/segments", () => {
  test("returns 404 when trail not found", async () => {
    const res = await buildApp().request(
      "/api/trails/00000000-0000-0000-0000-000000000001/segments",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          geometry: {
            type: "LineString",
            coordinates: [
              [-82.5, 39.4],
              [-82.4, 39.5],
            ],
          },
        }),
      },
    );
    expect(res.status).toBe(404);
  });

  test("rejects unknown surface_type", async () => {
    const res = await buildApp().request(
      "/api/trails/00000000-0000-0000-0000-000000000001/segments",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          surface_type: "lava",
          geometry: {
            type: "LineString",
            coordinates: [
              [-82.5, 39.4],
              [-82.4, 39.5],
            ],
          },
        }),
      },
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/trails/:id/segments/reorder", () => {
  test("rejects when ordered_ids is missing", async () => {
    const res = await buildApp().request(
      "/api/trails/00000000-0000-0000-0000-000000000001/segments/reorder",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/trails/:id/segments/split", () => {
  test("rejects when segment_id is missing", async () => {
    const res = await buildApp().request(
      "/api/trails/00000000-0000-0000-0000-000000000001/segments/split",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ split_at: 0.5 }),
      },
    );
    expect(res.status).toBe(400);
  });

  test("rejects when split_at is out of range", async () => {
    const res = await buildApp().request(
      "/api/trails/00000000-0000-0000-0000-000000000001/segments/split",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          segment_id: "00000000-0000-0000-0000-000000000001",
          split_at: 1.5,
        }),
      },
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/trails/:id/segments/merge", () => {
  test("rejects when one of the segment ids is missing", async () => {
    const res = await buildApp().request(
      "/api/trails/00000000-0000-0000-0000-000000000001/segments/merge",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ segment_id_a: "00000000-0000-0000-0000-000000000001" }),
      },
    );
    expect(res.status).toBe(400);
  });

  test("rejects when both segment ids are the same", async () => {
    const res = await buildApp().request(
      "/api/trails/00000000-0000-0000-0000-000000000001/segments/merge",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          segment_id_a: "00000000-0000-0000-0000-000000000001",
          segment_id_b: "00000000-0000-0000-0000-000000000001",
        }),
      },
    );
    expect(res.status).toBe(400);
  });
});
