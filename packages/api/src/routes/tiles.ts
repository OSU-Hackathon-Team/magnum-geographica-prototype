import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { systems, features } from "../db/schema.js";
import { trails, trailSystems } from "../db/schema.js";
import { sql } from "drizzle-orm";

export const tilesRoute = new Hono();

tilesRoute.get("/system/:systemId/trails.geojson", async (c) => {
  const systemId = c.req.param("systemId");

  const rows = await db
    .select({
      id: trails.id,
      name: trails.name,
      slug: trails.slug,
      difficulty: trails.difficulty,
      surface_type: sql<
        string | null
      >`(SELECT ts.surface_type FROM trail_segments ts WHERE ts.trail_id = ${trails.id} ORDER BY ts.sort_order LIMIT 1)`,
      length_meters: trails.lengthMeters,
      geometry: sql<string>`ST_AsGeoJSON(COALESCE(${trails.geometry}, ST_GeomFromText('POINT EMPTY', 4326)))`,
    })
    .from(trails)
    .innerJoin(trailSystems, eq(trailSystems.trailId, trails.id))
    .where(eq(trailSystems.systemId, systemId));

  return c.json(toFeatureCollection(rows));
});

tilesRoute.get("/system/:systemId/features.geojson", async (c) => {
  const systemId = c.req.param("systemId");
  const rows = await db
    .select({
      id: features.id,
      name: features.name,
      type_tag: features.typeTag,
      description: features.description,
      geometry: sql<string>`ST_AsGeoJSON(COALESCE(${features.point}, ST_GeomFromText('POINT EMPTY', 4326)))`,
    })
    .from(features)
    .where(eq(features.systemId, systemId));

  return c.json(toFeatureCollection(rows));
});

tilesRoute.get("/system/:systemId/bbox.geojson", async (c) => {
  const systemId = c.req.param("systemId");
  const rows = await db
    .select({
      id: systems.id,
      name: systems.name,
      slug: systems.slug,
      geometry: sql<string>`ST_AsGeoJSON(COALESCE(${systems.boundary}, ST_GeomFromText('POLYGON EMPTY', 4326)))`,
    })
    .from(systems)
    .where(eq(systems.id, systemId))
    .limit(1);

  const sys = rows[0];
  if (!sys) return c.json({ error: "not_found" }, 404);
  return c.json(toFeatureCollection([sys]));
});

function toFeatureCollection(rows: Array<{ id: string; geometry: string; [k: string]: unknown }>) {
  return {
    type: "FeatureCollection" as const,
    features: rows.map((row) => {
      const { id, geometry, ...props } = row;
      return {
        type: "Feature" as const,
        id,
        geometry: JSON.parse(geometry) as unknown,
        properties: props,
      };
    }),
  };
}
