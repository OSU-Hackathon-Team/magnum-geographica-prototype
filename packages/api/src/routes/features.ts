import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { features } from "../db/schema.js";
import { createFeatureInputSchema } from "@magnum/shared";

function toCoordinate(
  x: number | string | null | undefined,
): number | null {
  if (x === null || x === undefined) return null;
  const n = typeof x === "string" ? parseFloat(x) : x;
  return Number.isFinite(n) ? n : null;
}

export const featuresRoute = new Hono();

featuresRoute.get("/:id", async (c) => {
  const id = c.req.param("id");
  const rows = await db
    .select({
      id: features.id,
      name: features.name,
      type_tag: features.typeTag,
      description: features.description,
      trail_id: features.trailId,
      system_id: features.systemId,
      created_at: features.createdAt,
      updated_at: features.updatedAt,
      lon: sql<number | null>`ST_X(${features.point}::geometry)`,
      lat: sql<number | null>`ST_Y(${features.point}::geometry)`,
    })
    .from(features)
    .where(eq(features.id, id))
    .limit(1);
  const feat = rows[0];
  if (!feat) return c.json({ error: "not_found" }, 404);
  const center =
    feat.lon != null && feat.lat != null ? { lat: feat.lat, lon: feat.lon } : null;
  const { lon: _lon, lat: _lat, ...rest } = feat;
  return c.json({ ...rest, center });
});

featuresRoute.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createFeatureInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", message: "validation failed", details: parsed.error.flatten() },
      400,
    );
  }

  const { name, type_tag, point, trail_id, system_id, description } = parsed.data;

  const geojson = point as { type?: string; coordinates?: [number, number]; lat?: number; lon?: number };
  let lon: number | null = null;
  let lat: number | null = null;

  if (geojson?.type === "Point" && Array.isArray(geojson.coordinates) && geojson.coordinates.length >= 2) {
    lon = toCoordinate(geojson.coordinates[0]);
    lat = toCoordinate(geojson.coordinates[1]);
  } else if (typeof geojson?.lon === "number" || typeof geojson?.lat === "number") {
    lon = toCoordinate(geojson.lon);
    lat = toCoordinate(geojson.lat);
  } else if (Array.isArray(geojson) && geojson.length >= 2) {
    lon = toCoordinate(geojson[0]);
    lat = toCoordinate(geojson[1]);
  }

  if (lon === null || lat === null) {
    return c.json({ error: "invalid_input", message: "could not extract coordinates from point" }, 400);
  }

  const rows = await db
    .insert(features)
    .values({
      name,
      typeTag: type_tag,
      point: sql`ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)`,
      trailId: trail_id ?? null,
      systemId: system_id ?? null,
      description: description ?? null,
    })
    .returning();

  const feat = rows[0];
  if (!feat) {
    return c.json({ error: "internal", message: "failed to create feature" }, 500);
  }

  return c.json({
    id: feat.id,
    name: feat.name,
    type_tag: feat.typeTag,
    description: feat.description,
    trail_id: feat.trailId,
    system_id: feat.systemId,
    created_at: feat.createdAt,
    updated_at: feat.updatedAt,
    center: { lat, lon },
  }, 201);
});

featuresRoute.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return c.json({ error: "invalid_input", message: "body required" }, 400);
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.name === "string") updates.name = body.name;
  if (typeof body.type_tag === "string") updates.typeTag = body.type_tag;
  if (body.description !== undefined) updates.description = body.description || null;
  if (body.trail_id !== undefined) updates.trailId = body.trail_id || null;
  if (body.system_id !== undefined) updates.systemId = body.system_id || null;

  const pointData = body.point as { type?: string; coordinates?: [number, number]; lat?: number; lon?: number } | undefined;
  if (pointData) {
    let lon: number | null = null;
    let lat: number | null = null;
    if (pointData.type === "Point" && Array.isArray(pointData.coordinates) && pointData.coordinates.length >= 2) {
      lon = toCoordinate(pointData.coordinates[0]);
      lat = toCoordinate(pointData.coordinates[1]);
    } else if (typeof pointData.lon === "number" || typeof pointData.lat === "number") {
      lon = toCoordinate(pointData.lon);
      lat = toCoordinate(pointData.lat);
    }
    if (lon !== null && lat !== null) {
      (updates as Record<string, unknown>).point = sql`ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)`;
    }
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ error: "invalid_input", message: "no fields to update" }, 400);
  }
  (updates as Record<string, unknown>).updatedAt = sql`now()`;

  const rows = await db
    .update(features)
    .set(updates as Parameters<typeof db.update>[1])
    .where(eq(features.id, id))
    .returning();

  const feat = rows[0];
  if (!feat) return c.json({ error: "not_found" }, 404);

  return c.json({
    id: feat.id,
    name: feat.name,
    type_tag: feat.typeTag,
    description: feat.description,
    trail_id: feat.trailId,
    system_id: feat.systemId,
    created_at: feat.createdAt,
    updated_at: feat.updatedAt,
  });
});

featuresRoute.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const result = await db.delete(features).where(eq(features.id, id));
  return c.json({ ok: true });
});
