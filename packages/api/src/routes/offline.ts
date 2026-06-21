import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { systems, trails, trailSystems, trailSegments, features, wikiPages, revisions, citations, offlinePacks } from "../db/schema.js";

export const offlineRoute = new Hono();

offlineRoute.get("/:system_id/info", async (c) => {
  const systemId = c.req.param("system_id");

  const systemExists = await db
    .select({ id: systems.id })
    .from(systems)
    .where(eq(systems.id, systemId))
    .limit(1);

  if (systemExists.length === 0) {
    return c.json({ error: "not_found", message: `system ${systemId} not found` }, 404);
  }

  const existing = await db
    .select({
      tileSizeBytes: offlinePacks.tileSizeBytes,
      geojsonSizeBytes: offlinePacks.geojsonSizeBytes,
      wikiSizeBytes: sql<number>`COALESCE(length(${offlinePacks.wikiData}::text), 0)`,
      generatedAt: offlinePacks.generatedAt,
    })
    .from(offlinePacks)
    .where(eq(offlinePacks.systemId, systemId))
    .limit(1);

  if (existing.length > 0 && existing[0]) {
    const pack = existing[0];
    return c.json({
      system_id: systemId,
      tile_size_bytes: pack.tileSizeBytes ?? 0,
      geojson_size_bytes: pack.geojsonSizeBytes ?? 0,
      wiki_size_bytes: Number(pack.wikiSizeBytes ?? 0),
      total_size_bytes: (pack.tileSizeBytes ?? 0) + (pack.geojsonSizeBytes ?? 0) + Number(pack.wikiSizeBytes ?? 0),
      generated_at: pack.generatedAt?.toISOString() ?? null,
    });
  }

  const trailCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(trailSystems)
    .where(eq(trailSystems.systemId, systemId));

  const count = trailCount[0]?.count ?? 0;

  return c.json({
    system_id: systemId,
    tile_size_bytes: count * 50000,
    geojson_size_bytes: count * 30000,
    wiki_size_bytes: count * 10000,
    total_size_bytes: count * 90000,
    generated_at: null,
  });
});

offlineRoute.post("/generate/:system_id", async (c) => {
  const systemId = c.req.param("system_id");

  const systemRows = await db
    .select({ id: systems.id, name: systems.name })
    .from(systems)
    .where(eq(systems.id, systemId))
    .limit(1);

  if (systemRows.length === 0) {
    return c.json({ error: "not_found", message: `system ${systemId} not found` }, 404);
  }

  const trailItems = await db
    .select({
      id: trails.id,
      name: trails.name,
      slug: trails.slug,
      description: trails.description,
      difficulty: trails.difficulty,
      length_meters: trails.lengthMeters,
      elevation_gain_meters: trails.elevationGainMeters,
      geometry: sql<string>`ST_AsGeoJSON(${trails.geometry})`,
    })
    .from(trails)
    .innerJoin(trailSystems, eq(trailSystems.trailId, trails.id))
    .where(eq(trailSystems.systemId, systemId));

  const featureItems = await db
    .select({
      id: features.id,
      name: features.name,
      type_tag: features.typeTag,
      description: features.description,
      point: sql<string>`ST_AsGeoJSON(${features.point})`,
      trail_id: features.trailId,
      system_id: features.systemId,
    })
    .from(features)
    .where(eq(features.systemId, systemId));

  const geojsonData = Buffer.from(JSON.stringify({ trails: trailItems, features: featureItems }));

  const wikiItems = await db
    .select({
      id: wikiPages.id,
      target_type: wikiPages.targetType,
      target_id: wikiPages.targetId,
      title: wikiPages.title,
      content_md: wikiPages.contentMd,
    })
    .from(wikiPages)
    .where(
      sql`(${wikiPages.targetType} = 'system' AND ${wikiPages.targetId} = ${systemId})
           OR (${wikiPages.targetType} = 'trail' AND ${wikiPages.targetId} IN (SELECT trail_id FROM trail_systems WHERE system_id = ${systemId}))
           OR (${wikiPages.targetType} = 'feature' AND ${wikiPages.targetId} IN (SELECT id FROM features WHERE system_id = ${systemId}))`,
    );

  const wikiDataString = JSON.stringify(wikiItems);

  await db
    .insert(offlinePacks)
    .values({
      systemId,
      geojsonData: geojsonData,
      wikiData: wikiDataString,
      geojsonSizeBytes: geojsonData.length,
      tileSizeBytes: 0,
    })
    .onConflictDoNothing();

  return c.json({
    system_id: systemId,
    tile_size_bytes: 0,
    geojson_size_bytes: geojsonData.length,
    wiki_size_bytes: Buffer.byteLength(wikiDataString),
    total_size_bytes: geojsonData.length + Buffer.byteLength(wikiDataString),
    generated_at: new Date().toISOString(),
  });
});

offlineRoute.get("/:system_id/download", async (c) => {
  const systemId = c.req.param("system_id");

  const rows = await db
    .select({
      geojson: offlinePacks.geojsonData,
      wiki: offlinePacks.wikiData,
      generatedAt: offlinePacks.generatedAt,
    })
    .from(offlinePacks)
    .where(eq(offlinePacks.systemId, systemId))
    .limit(1);

  if (rows.length === 0 || !rows[0]?.geojson) {
    return c.json({ error: "not_found", message: `no pack for system ${systemId}` }, 404);
  }

  const pack = rows[0]!;
  return c.json({
    geojson: pack.geojson ? JSON.parse(pack.geojson.toString("utf-8")) : null,
    wiki: pack.wiki ? JSON.parse(pack.wiki) : null,
    generated_at: pack.generatedAt?.toISOString() ?? null,
  });
});
