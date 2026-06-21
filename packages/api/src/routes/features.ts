import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { features } from "../db/schema.js";

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
