/**
 * Tests for the tiles route (GeoJSON exports for trails, features,
 * and system bounding-box polygons).
 *
 * The `phase1.test.ts` file exercises trails.geojson and
 * features.geojson against the in-memory mockDb. This file uses the
 * real test database so ST_AsGeoJSON, the trail_systems join, and
 * real geometry columns are exercised. It adds coverage for
 * `bbox.geojson` (the system boundary polygon endpoint), which
 * previously had no tests at all.
 */
import { describe, expect, test, beforeEach } from "bun:test";
import { Hono } from "hono";
import { setupRealDb } from "./helpers/db.js";
import { tilesRoute } from "../src/routes/tiles.js";
import { systems, trails, trailSystems, features } from "../src/db/schema.js";

const { db, reset } = setupRealDb();

beforeEach(async () => {
  await reset();
});

const buildApp = () => new Hono().route("/api/tiles", tilesRoute);

async function seedSystem() {
  const [s] = await db
    .insert(systems)
    .values({
      name: "Hocking",
      slug: "hocking",
      boundary: "SRID=4326;MULTIPOLYGON(((-83 39, -82 39, -82 40, -83 40, -83 39)))",
    })
    .returning();
  return s;
}

async function seedTrailIn(systemId: string) {
  const [t] = await db
    .insert(trails)
    .values({
      name: "Buckeye",
      slug: "buckeye",
      geometry: "SRID=4326;MULTILINESTRING((-82.5 39.4, -82.6 39.5))",
    })
    .returning();
  await db.insert(trailSystems).values({ trailId: t.id, systemId });
  return t;
}

describe("GET /api/tiles/system/:systemId/bbox.geojson", () => {
  test("returns 404 for an unknown system", async () => {
    const res = await buildApp().request(
      "/api/tiles/system/00000000-0000-0000-0000-000000000099/bbox.geojson",
    );
    expect(res.status).toBe(404);
  });

  test("returns the system boundary as a real GeoJSON MultiPolygon", async () => {
    const sys = await seedSystem();
    const res = await buildApp().request(`/api/tiles/system/${sys.id}/bbox.geojson`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      type: string;
      features: Array<{
        type: string;
        id: string;
        geometry: { type: string; coordinates: number[][][][] };
        properties: { name: string; slug: string };
      }>;
    };
    expect(body.type).toBe("FeatureCollection");
    expect(body.features.length).toBe(1);
    expect(body.features[0]?.id).toBe(sys.id);
    // The system boundary column is MultiPolygon, so ST_AsGeoJSON
    // produces a MultiPolygon. Each polygon has its own ring; the
    // first ring is closed and has 5 points (4 vertices + closing).
    expect(body.features[0]?.geometry.type).toBe("MultiPolygon");
    expect(body.features[0]?.geometry.coordinates[0]?.[0]?.length).toBe(5);
    expect(body.features[0]?.properties.name).toBe("Hocking");
  });
});

describe("GET /api/tiles/system/:systemId/trails.geojson", () => {
  test("returns an empty FeatureCollection when the system has no trails", async () => {
    const sys = await seedSystem();
    const res = await buildApp().request(`/api/tiles/system/${sys.id}/trails.geojson`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { type: string; features: unknown[] };
    expect(body.type).toBe("FeatureCollection");
    expect(body.features).toEqual([]);
  });

  test("returns trails joined to the system as GeoJSON LineStrings", async () => {
    const sys = await seedSystem();
    await seedTrailIn(sys.id);
    const res = await buildApp().request(`/api/tiles/system/${sys.id}/trails.geojson`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      features: Array<{ geometry: { type: string; coordinates: number[][][] } }>;
    };
    expect(body.features.length).toBe(1);
    expect(body.features[0]?.geometry.type).toBe("MultiLineString");
    expect(body.features[0]?.geometry.coordinates[0]?.length).toBe(2);
  });

  test("does not include trails from a different system", async () => {
    const a = await seedSystem();
    const [b] = await db
      .insert(systems)
      .values({ name: "Other", slug: "other" })
      .returning();
    await seedTrailIn(b.id);
    const res = await buildApp().request(`/api/tiles/system/${a.id}/trails.geojson`);
    const body = (await res.json()) as { features: unknown[] };
    expect(body.features.length).toBe(0);
  });
});

describe("GET /api/tiles/system/:systemId/features.geojson", () => {
  test("returns features within the system as GeoJSON Points", async () => {
    const sys = await seedSystem();
    await db.insert(features).values({
      name: "Cedar Falls",
      typeTag: "scenic_point",
      point: "SRID=4326;POINT(-82.54 39.43)",
      systemId: sys.id,
    });
    const res = await buildApp().request(`/api/tiles/system/${sys.id}/features.geojson`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      features: Array<{ geometry: { type: string; coordinates: number[] } }>;
    };
    expect(body.features.length).toBe(1);
    expect(body.features[0]?.geometry.type).toBe("Point");
    expect(body.features[0]?.geometry.coordinates[0]).toBeCloseTo(-82.54, 4);
    expect(body.features[0]?.geometry.coordinates[1]).toBeCloseTo(39.43, 4);
  });
});
