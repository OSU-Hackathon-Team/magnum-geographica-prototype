import { Hono } from "hono";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { trailSegments, trails } from "../db/schema.js";
import {
  createSegmentInputSchema,
  updateSegmentInputSchema,
  reorderSegmentsInputSchema,
  splitSegmentInputSchema,
  mergeSegmentsInputSchema,
} from "@magnum/shared";

const baseSegmentSelect = {
  id: trailSegments.id,
  trail_id: trailSegments.trailId,
  name: trailSegments.name,
  sort_order: trailSegments.sortOrder,
  surface_type: trailSegments.surfaceType,
  hazards: trailSegments.hazards,
  is_road_connector: trailSegments.isRoadConnector,
  steep_grade: trailSegments.steepGrade,
  one_way: trailSegments.oneWay,
  description: trailSegments.description,
  length_meters: sql<number>`ST_Length(${trailSegments.geometry}::geography)`,
  created_at: trailSegments.createdAt,
  updated_at: trailSegments.updatedAt,
} as const;

function toMultiLineStringWkt(geometry: unknown): string | null {
  if (!geometry || typeof geometry !== "object") return null;
  const g = geometry as { type?: string; coordinates?: unknown };

  if (g.type === "MultiLineString" && Array.isArray(g.coordinates)) {
    const lines = (g.coordinates as number[][][])
      .map((line) =>
        line.length >= 2 ? `(${line.map((p) => `${p[0]} ${p[1]}`).join(", ")})` : null,
      )
      .filter((s): s is string => s !== null);
    if (lines.length === 0) return null;
    return `MULTILINESTRING(${lines.join(", ")})`;
  }

  if (g.type === "LineString" && Array.isArray(g.coordinates)) {
    const pts = (g.coordinates as number[][])
      .map((p) => `${p[0]} ${p[1]}`)
      .join(", ");
    if (!pts) return null;
    return `MULTILINESTRING((${pts}))`;
  }

  if (Array.isArray(g.coordinates) && g.coordinates.length > 0) {
    const first = (g.coordinates as unknown[])[0];
    if (Array.isArray(first) && Array.isArray((first as unknown[])[0])) {
      const lines = ((g.coordinates as number[][][])
        .map((line) =>
          line.length >= 2 ? `(${line.map((p) => `${p[0]} ${p[1]}`).join(", ")})` : null,
        )
        .filter((s): s is string => s !== null));
      if (lines.length === 0) return null;
      return `MULTILINESTRING(${lines.join(", ")})`;
    }
  }

  return null;
}

export const segmentDetailRoute = new Hono();
export const trailSegmentsRoute = new Hono();

segmentDetailRoute.get("/:id", async (c) => {
  const id = c.req.param("id");
  const rows = await db
    .select(baseSegmentSelect)
    .from(trailSegments)
    .where(eq(trailSegments.id, id))
    .limit(1);
  const seg = rows[0];
  if (!seg) return c.json({ error: "not_found", message: `segment ${id} not found` }, 404);
  return c.json(seg);
});

segmentDetailRoute.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = updateSegmentInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", message: "validation failed", details: parsed.error.flatten() },
      400,
    );
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.sort_order !== undefined) updates.sortOrder = parsed.data.sort_order;
  if (parsed.data.surface_type !== undefined) updates.surfaceType = parsed.data.surface_type;
  if (parsed.data.hazards !== undefined) updates.hazards = parsed.data.hazards;
  if (parsed.data.is_road_connector !== undefined) updates.isRoadConnector = parsed.data.is_road_connector;
  if (parsed.data.steep_grade !== undefined) updates.steepGrade = parsed.data.steep_grade;
  if (parsed.data.one_way !== undefined) updates.oneWay = parsed.data.one_way;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;

  if (Object.keys(updates).length === 0) {
    return c.json({ error: "invalid_input", message: "no fields to update" }, 400);
  }
  updates.updatedAt = sql`now()`;

  const rows = await db
    .update(trailSegments)
    .set(updates as Partial<typeof trailSegments.$inferInsert>)
    .where(eq(trailSegments.id, id))
    .returning();

  if (rows.length === 0) {
    return c.json({ error: "not_found", message: `segment ${id} not found` }, 404);
  }

  const out = await db
    .select(baseSegmentSelect)
    .from(trailSegments)
    .where(eq(trailSegments.id, id))
    .limit(1);

  return c.json(out[0] ?? rows[0]);
});

segmentDetailRoute.delete("/:id", async (c) => {
  const id = c.req.param("id");
  await db.delete(trailSegments).where(eq(trailSegments.id, id));
  return c.json({ ok: true });
});

trailSegmentsRoute.post("/:id/segments", async (c) => {
  const trailId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = createSegmentInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", message: "validation failed", details: parsed.error.flatten() },
      400,
    );
  }

  const trailExists = await db
    .select({ id: trails.id })
    .from(trails)
    .where(eq(trails.id, trailId))
    .limit(1);
  if (trailExists.length === 0) {
    return c.json({ error: "not_found", message: `trail ${trailId} not found` }, 404);
  }

  const wkt = toMultiLineStringWkt(parsed.data.geometry);
  if (!wkt) {
    return c.json(
      { error: "invalid_input", message: "geometry must be LineString or MultiLineString" },
      400,
    );
  }

  const insertValues: {
    trailId: string;
    geometry: ReturnType<typeof sql>;
    name?: string | null;
    sortOrder?: number;
    surfaceType?: string | null;
    hazards?: string[];
    isRoadConnector?: boolean;
    steepGrade?: boolean;
    oneWay?: boolean;
    description?: string | null;
  } = {
    trailId,
    geometry: sql`ST_SetSRID(ST_GeomFromText(${wkt}, 4326), 4326)`,
  };
  if (parsed.data.name !== undefined) insertValues.name = parsed.data.name;
  if (parsed.data.sort_order !== undefined) insertValues.sortOrder = parsed.data.sort_order;
  if (parsed.data.surface_type !== undefined) insertValues.surfaceType = parsed.data.surface_type;
  if (parsed.data.hazards !== undefined) insertValues.hazards = parsed.data.hazards;
  if (parsed.data.is_road_connector !== undefined) insertValues.isRoadConnector = parsed.data.is_road_connector;
  if (parsed.data.steep_grade !== undefined) insertValues.steepGrade = parsed.data.steep_grade;
  if (parsed.data.one_way !== undefined) insertValues.oneWay = parsed.data.one_way;
  if (parsed.data.description !== undefined) insertValues.description = parsed.data.description;

  const rows = await db.insert(trailSegments).values(insertValues).returning();
  const seg = rows[0];
  if (!seg) {
    return c.json({ error: "internal", message: "failed to create segment" }, 500);
  }

  const out = await db
    .select(baseSegmentSelect)
    .from(trailSegments)
    .where(eq(trailSegments.id, seg.id))
    .limit(1);

  return c.json(out[0] ?? seg, 201);
});

trailSegmentsRoute.post("/:id/segments/reorder", async (c) => {
  const trailId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = reorderSegmentsInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", message: "validation failed", details: parsed.error.flatten() },
      400,
    );
  }

  const { ordered_ids } = parsed.data;

  const existing = await db
    .select({ id: trailSegments.id })
    .from(trailSegments)
    .where(eq(trailSegments.trailId, trailId));
  const existingIds = new Set(existing.map((r) => r.id));

  if (
    ordered_ids.length !== existingIds.size ||
    !ordered_ids.every((id) => existingIds.has(id))
  ) {
    return c.json(
      {
        error: "invalid_input",
        message: "ordered_ids must include all segments of the trail",
      },
      400,
    );
  }

  for (let i = 0; i < ordered_ids.length; i++) {
    const sid = ordered_ids[i]!;
    await db
      .update(trailSegments)
      .set({ sortOrder: i, updatedAt: sql`now()` })
      .where(eq(trailSegments.id, sid));
  }

  const items = await db
    .select(baseSegmentSelect)
    .from(trailSegments)
    .where(eq(trailSegments.trailId, trailId))
    .orderBy(asc(trailSegments.sortOrder));

  return c.json({ items, total: items.length });
});

trailSegmentsRoute.post("/:id/segments/split", async (c) => {
  const trailId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = splitSegmentInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", message: "validation failed", details: parsed.error.flatten() },
      400,
    );
  }

  const { segment_id, split_at, name_a, name_b } = parsed.data;

  const segRows = await db
    .select({
      id: trailSegments.id,
      sortOrder: trailSegments.sortOrder,
      hazards: trailSegments.hazards,
    })
    .from(trailSegments)
    .where(eq(trailSegments.id, segment_id))
    .limit(1);

  const seg = segRows[0];
  if (!seg) {
    return c.json({ error: "not_found", message: `segment ${segment_id} not found` }, 404);
  }

  const wktA = sql<string>`ST_AsText(ST_LineSubstring(${trailSegments.geometry}, 0, ${split_at}))`;
  const wktB = sql<string>`ST_AsText(ST_LineSubstring(${trailSegments.geometry}, ${split_at}, 1))`;

  const partialA = await db
    .select({ wkt: wktA })
    .from(trailSegments)
    .where(eq(trailSegments.id, segment_id))
    .limit(1);
  const partialB = await db
    .select({ wkt: wktB })
    .from(trailSegments)
    .where(eq(trailSegments.id, segment_id))
    .limit(1);

  const textA = partialA[0]?.wkt;
  const textB = partialB[0]?.wkt;
  if (!textA || !textB) {
    return c.json({ error: "internal", message: "failed to compute split geometry" }, 500);
  }

  await db
    .update(trailSegments)
    .set({
      geometry: sql`ST_Multi(ST_GeomFromText(${textA}, 4326))`,
      name: name_a ?? null,
      sortOrder: seg.sortOrder,
      updatedAt: sql`now()`,
    })
    .where(eq(trailSegments.id, segment_id));

  const newSeg = await db
    .insert(trailSegments)
    .values({
      trailId,
      geometry: sql`ST_Multi(ST_GeomFromText(${textB}, 4326))`,
      name: name_b ?? null,
      sortOrder: seg.sortOrder + 1,
      hazards: seg.hazards,
    })
    .returning();

  const newId = newSeg[0]?.id;
  if (!newId) {
    return c.json({ error: "internal", message: "failed to create split segment" }, 500);
  }

  await db
    .update(trailSegments)
    .set({ sortOrder: sql`${trailSegments.sortOrder} + 1`, updatedAt: sql`now()` })
    .where(
      sql`${trailSegments.trailId} = ${trailId} AND ${trailSegments.sortOrder} > ${seg.sortOrder} AND ${trailSegments.id} != ${segment_id} AND ${trailSegments.id} != ${newId}`,
    );

  const items = await db
    .select(baseSegmentSelect)
    .from(trailSegments)
    .where(eq(trailSegments.trailId, trailId))
    .orderBy(asc(trailSegments.sortOrder));

  return c.json({ items, total: items.length });
});

trailSegmentsRoute.post("/:id/segments/merge", async (c) => {
  const trailId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = mergeSegmentsInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", message: "validation failed", details: parsed.error.flatten() },
      400,
    );
  }

  const { segment_id_a, segment_id_b, name } = parsed.data;

  if (segment_id_a === segment_id_b) {
    return c.json({ error: "invalid_input", message: "segments must be distinct" }, 400);
  }

  const aRows = await db
    .select({
      id: trailSegments.id,
      sortOrder: trailSegments.sortOrder,
      surfaceType: trailSegments.surfaceType,
      isRoadConnector: trailSegments.isRoadConnector,
      steepGrade: trailSegments.steepGrade,
      oneWay: trailSegments.oneWay,
      hazards: trailSegments.hazards,
    })
    .from(trailSegments)
    .where(eq(trailSegments.id, segment_id_a))
    .limit(1);

  const bRows = await db
    .select({
      id: trailSegments.id,
      sortOrder: trailSegments.sortOrder,
      surfaceType: trailSegments.surfaceType,
      isRoadConnector: trailSegments.isRoadConnector,
      steepGrade: trailSegments.steepGrade,
      oneWay: trailSegments.oneWay,
      hazards: trailSegments.hazards,
    })
    .from(trailSegments)
    .where(eq(trailSegments.id, segment_id_b))
    .limit(1);

  const a = aRows[0];
  const b = bRows[0];
  if (!a || !b) {
    return c.json({ error: "not_found", message: "segment not found" }, 404);
  }

  if (a.isRoadConnector || b.isRoadConnector) {
    return c.json(
      { error: "invalid_input", message: "cannot merge road connectors" },
      400,
    );
  }

  const [lo, hi] = a.sortOrder < b.sortOrder ? [a, b] : [b, a];

  await db
    .update(trailSegments)
    .set({
      geometry: sql`ST_Multi(ST_LineMerge(ST_Union(${trailSegments.geometry}, (SELECT geometry FROM trail_segments WHERE id = ${hi.id}))))`,
      sortOrder: lo.sortOrder,
      steepGrade: a.steepGrade || b.steepGrade,
      oneWay: a.oneWay && b.oneWay,
      hazards: sql`(SELECT ARRAY(SELECT DISTINCT UNNEST(${a.hazards}::text[] || ${b.hazards}::text[])))`,
      name: name ?? null,
      updatedAt: sql`now()`,
    })
    .where(eq(trailSegments.id, lo.id));

  await db.delete(trailSegments).where(eq(trailSegments.id, hi.id));

  await db
    .update(trailSegments)
    .set({ sortOrder: sql`${trailSegments.sortOrder} - 1`, updatedAt: sql`now()` })
    .where(
      sql`${trailSegments.trailId} = ${trailId} AND ${trailSegments.sortOrder} > ${lo.sortOrder}`,
    );

  const out = await db
    .select(baseSegmentSelect)
    .from(trailSegments)
    .where(eq(trailSegments.id, lo.id))
    .limit(1);

  return c.json(out[0]);
});
