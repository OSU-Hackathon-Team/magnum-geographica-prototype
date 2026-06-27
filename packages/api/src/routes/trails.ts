import { Hono } from "hono";
import { eq, and, ilike, sql, asc } from "drizzle-orm";
import { db } from "../db/index.js";
import { trails, trailSystems, trailSegments, features } from "../db/schema.js";
import { createTrailInputSchema, updateTrailInputSchema } from "@magnum/shared";
import { authRequired, type AuthUser } from "../middleware/auth.js";
import { recordRevision } from "../services/revisions.js";
import { resolveContributorName } from "../services/identity.js";

type Variables = { user?: AuthUser };

export const trailsRoute = new Hono<{ Variables: Variables }>();

const baseTrailSelect = {
  id: trails.id,
  name: trails.name,
  slug: trails.slug,
  tier: trails.tier,
  description: trails.description,
  difficulty: trails.difficulty,
  length_meters: trails.lengthMeters,
  elevation_gain_meters: trails.elevationGainMeters,
  verified: trails.verified,
  source: trails.source,
  source_date: trails.sourceDate,
  external_url: trails.externalUrl,
  last_synthesized_at: trails.lastSynthesizedAt,
  created_at: trails.createdAt,
  updated_at: trails.updatedAt,
} as const;

trailsRoute.get("/", async (c) => {
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(c.req.query("pageSize") ?? 20)));
  const q = c.req.query("q")?.trim();
  const systemId = c.req.query("systemId");
  const difficulty = c.req.query("difficulty");
  const offset = (page - 1) * pageSize;

  const filters = [];
  if (q) filters.push(ilike(trails.name, `%${q}%`));
  if (difficulty) filters.push(eq(trails.difficulty, difficulty));
  const where = filters.length ? and(...filters) : undefined;

  if (systemId) {
    const items = await db
      .selectDistinct(baseTrailSelect)
      .from(trails)
      .innerJoin(trailSystems, eq(trailSystems.trailId, trails.id))
      .where(and(eq(trailSystems.systemId, systemId), where))
      .limit(pageSize)
      .offset(offset);

    const totalRow = await db
      .selectDistinct({ count: sql<number>`count(*)::int` })
      .from(trails)
      .innerJoin(trailSystems, eq(trailSystems.trailId, trails.id))
      .where(and(eq(trailSystems.systemId, systemId), where));

    return c.json({ items, total: totalRow[0]?.count ?? 0, page, pageSize });
  }

  const items = await db
    .select(baseTrailSelect)
    .from(trails)
    .where(where)
    .limit(pageSize)
    .offset(offset);

  const totalRow = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(trails)
    .where(where);

  return c.json({ items, total: totalRow[0]?.count ?? 0, page, pageSize });
});

const baseTrailSelectWithCenter = {
  ...baseTrailSelect,
  geometry: sql<unknown>`CASE WHEN ${trails.geometry} IS NULL THEN NULL ELSE ST_AsGeoJSON(${trails.geometry})::json END`,
  lon: sql<number | null>`ST_X(ST_StartPoint(ST_LineMerge(${trails.geometry})))`,
  lat: sql<number | null>`ST_Y(ST_StartPoint(ST_LineMerge(${trails.geometry})))`,
} as const;

function withCenter<T extends { geometry: unknown; lon: number | null; lat: number | null }>(row: T) {
  const { lon, lat, geometry, ...rest } = row;
  const center = lon != null && lat != null ? { lat, lon } : null;
  return { ...rest, geometry, center };
}

trailsRoute.get("/by-slug/:slug", async (c) => {
  const slug = c.req.param("slug");
  const rows = await db
    .select(baseTrailSelectWithCenter)
    .from(trails)
    .where(eq(trails.slug, slug))
    .limit(1);

  const trail = rows[0];
  if (!trail) {
    return c.json({ error: "not_found", message: `trail '${slug}' not found` }, 404);
  }
  return c.json(withCenter(trail));
});

trailsRoute.get("/:id", async (c) => {
  const id = c.req.param("id");
  const rows = await db
    .select(baseTrailSelectWithCenter)
    .from(trails)
    .where(eq(trails.id, id))
    .limit(1);

  const trail = rows[0];
  if (!trail) {
    return c.json({ error: "not_found", message: `trail ${id} not found` }, 404);
  }
  return c.json(withCenter(trail));
});

trailsRoute.get("/:id/segments", async (c) => {
  const id = c.req.param("id");
  const trailExists = await db
    .select({ id: trails.id })
    .from(trails)
    .where(eq(trails.id, id))
    .limit(1);
  if (trailExists.length === 0) {
    return c.json({ error: "not_found", message: `trail ${id} not found` }, 404);
  }

  const items = await db
    .select({
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
    })
    .from(trailSegments)
    .where(eq(trailSegments.trailId, id))
    .orderBy(asc(trailSegments.sortOrder));

  return c.json({ items, total: items.length });
});

trailsRoute.get("/:id/features", async (c) => {
  const id = c.req.param("id");
  const trailExists = await db
    .select({ id: trails.id })
    .from(trails)
    .where(eq(trails.id, id))
    .limit(1);
  if (trailExists.length === 0) {
    return c.json({ error: "not_found", message: `trail ${id} not found` }, 404);
  }

  const items = await db
    .select({
      id: features.id,
      name: features.name,
      type_tag: features.typeTag,
      description: features.description,
      trail_id: features.trailId,
      system_id: features.systemId,
      created_at: features.createdAt,
      updated_at: features.updatedAt,
    })
    .from(features)
    .where(eq(features.trailId, id));

  return c.json({ items, total: items.length });
});

trailsRoute.post("/", authRequired(), async (c) => {
  const authUser = c.get("user");
  if (!authUser) return c.json({ error: "unauthorized" }, 401);

  const body = await c.req.json().catch(() => null);
  const parsed = createTrailInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", message: "validation failed", details: parsed.error.flatten() },
      400,
    );
  }

  const rows = await db
    .insert(trails)
    .values({
      name: parsed.data.name,
      slug: parsed.data.slug,
      description: parsed.data.description ?? null,
      difficulty: parsed.data.difficulty ?? null,
      lengthMeters: parsed.data.length_meters ?? null,
      elevationGainMeters: parsed.data.elevation_gain_meters ?? null,
      createdByUserId: authUser.id,
    })
    .returning();

  const trail = rows[0];
  if (!trail) return c.json({ error: "internal" }, 500);

  await recordRevision({
    targetType: "trail",
    targetId: trail.id,
    action: "create",
    actorId: authUser.id,
    contributorName: resolveContributorName(c),
    editSummary: `Created trail "${trail.name}"`,
    payloadAfter: { name: trail.name, slug: trail.slug, difficulty: trail.difficulty },
  });

  return c.json(trail, 201);
});

trailsRoute.put("/:id", authRequired(), async (c) => {
  const authUser = c.get("user");
  if (!authUser) return c.json({ error: "unauthorized" }, 401);
  const id = c.req.param("id");

  const body = await c.req.json().catch(() => null);
  const parsed = updateTrailInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", message: "validation failed", details: parsed.error.flatten() },
      400,
    );
  }

  const [existing] = await db
    .select({ id: trails.id, tier: trails.tier })
    .from(trails)
    .where(eq(trails.id, id))
    .limit(1);
  if (!existing) return c.json({ error: "not_found", message: `trail ${id} not found` }, 404);

  const updates: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.difficulty !== undefined) updates.difficulty = parsed.data.difficulty;
  if (parsed.data.length_meters !== undefined) updates.lengthMeters = parsed.data.length_meters;
  if (parsed.data.elevation_gain_meters !== undefined)
    updates.elevationGainMeters = parsed.data.elevation_gain_meters;
  if (parsed.data.verified !== undefined) updates.verified = parsed.data.verified;
  if (parsed.data.source !== undefined) updates.source = parsed.data.source;
  if (parsed.data.source_date !== undefined) updates.sourceDate = parsed.data.source_date;
  if (parsed.data.external_url !== undefined) updates.externalUrl = parsed.data.external_url;

  if (Object.keys(updates).length === 0) {
    return c.json({ error: "invalid_input", message: "no fields to update" }, 400);
  }
  updates.updatedAt = sql`now()`;

  const updated = await db
    .update(trails)
    .set(updates as Partial<typeof trails.$inferInsert>)
    .where(eq(trails.id, id))
    .returning();

  if (updated.length === 0)
    return c.json({ error: "not_found", message: `trail ${id} not found` }, 404);

  await recordRevision({
    targetType: "trail",
    targetId: id,
    action: "update",
    actorId: authUser.id,
    contributorName: resolveContributorName(c),
    editSummary: `Updated trail metadata`,
    payloadAfter: updates,
  });

  const rows = await db
    .select(baseTrailSelectWithCenter)
    .from(trails)
    .where(eq(trails.id, id))
    .limit(1);
  return c.json(withCenter(rows[0]!));
});

trailsRoute.delete("/:id", authRequired(), async (c) => {
  const authUser = c.get("user");
  if (!authUser) return c.json({ error: "unauthorized" }, 401);
  const id = c.req.param("id");

  const [trail] = await db
    .select({ id: trails.id, name: trails.name, tier: trails.tier })
    .from(trails)
    .where(eq(trails.id, id))
    .limit(1);
  if (!trail) return c.json({ error: "not_found", message: `trail ${id} not found` }, 404);

  // Premium trails can only be deleted by moderators+.
  if (trail.tier === "premium" && authUser.tier !== "moderator") {
    return c.json({ error: "forbidden", message: "premium trails require moderator permission to delete" }, 403);
  }

  await db.delete(trails).where(eq(trails.id, id));
  await recordRevision({
    targetType: "trail",
    targetId: id,
    action: "delete",
    actorId: authUser.id,
    contributorName: resolveContributorName(c),
    editSummary: `Deleted trail "${trail.name}"`,
  });
  return c.json({ ok: true });
});
