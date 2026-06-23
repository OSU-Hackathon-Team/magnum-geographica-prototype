import { Hono } from "hono";
import { eq, ilike, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { systems, trailSystems, trails, features } from "../db/schema.js";
import { createSystemInputSchema } from "@magnum/shared";

export const systemsRoute = new Hono();

const baseSystemSelect = {
  id: systems.id,
  name: systems.name,
  slug: systems.slug,
  color: systems.color,
  ownership_source: systems.ownershipSource,
  source_date: systems.sourceDate,
  description: systems.description,
  external_url: systems.externalUrl,
  created_at: systems.createdAt,
  updated_at: systems.updatedAt,
} as const;

const baseSystemSelectWithCenter = {
  ...baseSystemSelect,
  lon: sql<number | null>`ST_X(ST_Centroid(${systems.boundary}))`,
  lat: sql<number | null>`ST_Y(ST_Centroid(${systems.boundary}))`,
} as const;

const baseTrailSelect = {
  id: trails.id,
  name: trails.name,
  slug: trails.slug,
  description: trails.description,
  difficulty: trails.difficulty,
  length_meters: trails.lengthMeters,
  elevation_gain_meters: trails.elevationGainMeters,
  verified: trails.verified,
  created_at: trails.createdAt,
  updated_at: trails.updatedAt,
} as const;

systemsRoute.get("/", async (c) => {
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(c.req.query("pageSize") ?? 20)));
  const q = c.req.query("q")?.trim();
  const offset = (page - 1) * pageSize;

  const where = q ? ilike(systems.name, `%${q}%`) : undefined;

  const [items, totalRow] = await Promise.all([
    db.select(baseSystemSelect).from(systems).where(where).limit(pageSize).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(systems).where(where),
  ]);

  return c.json({ items, total: totalRow[0]?.count ?? 0, page, pageSize });
});

systemsRoute.get("/by-slug/:slug", async (c) => {
  const slug = c.req.param("slug");
  const rows = await db
    .select(baseSystemSelectWithCenter)
    .from(systems)
    .where(eq(systems.slug, slug))
    .limit(1);

  const system = rows[0];
  if (!system) {
    return c.json({ error: "not_found", message: `system '${slug}' not found` }, 404);
  }
  const { lon, lat, ...rest } = system;
  const center = lon != null && lat != null ? { lat, lon } : null;
  return c.json({ ...rest, center });
});

systemsRoute.get("/:id", async (c) => {
  const id = c.req.param("id");
  const rows = await db
    .select(baseSystemSelectWithCenter)
    .from(systems)
    .where(eq(systems.id, id))
    .limit(1);

  const system = rows[0];
  if (!system) {
    return c.json({ error: "not_found", message: `system ${id} not found` }, 404);
  }
  const { lon, lat, ...rest } = system;
  const center = lon != null && lat != null ? { lat, lon } : null;
  return c.json({ ...rest, center });
});

systemsRoute.get("/:id/trails", async (c) => {
  const id = c.req.param("id");
  const systemExists = await db
    .select({ id: systems.id })
    .from(systems)
    .where(eq(systems.id, id))
    .limit(1);
  if (systemExists.length === 0) {
    return c.json({ error: "not_found", message: `system ${id} not found` }, 404);
  }

  const items = await db
    .selectDistinct(baseTrailSelect)
    .from(trails)
    .innerJoin(trailSystems, eq(trailSystems.trailId, trails.id))
    .where(eq(trailSystems.systemId, id));

  return c.json({ items, total: items.length });
});

systemsRoute.get("/:id/features", async (c) => {
  const id = c.req.param("id");
  const systemExists = await db
    .select({ id: systems.id })
    .from(systems)
    .where(eq(systems.id, id))
    .limit(1);
  if (systemExists.length === 0) {
    return c.json({ error: "not_found", message: `system ${id} not found` }, 404);
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
    .where(eq(features.systemId, id));

  return c.json({ items, total: items.length });
});

systemsRoute.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createSystemInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", message: "validation failed", details: parsed.error.flatten() },
      400,
    );
  }

  const rows = await db
    .insert(systems)
    .values({
      name: parsed.data.name,
      slug: parsed.data.slug,
      description: parsed.data.description ?? null,
      externalUrl: parsed.data.external_url ?? null,
      ownershipSource: parsed.data.ownership_source ?? null,
      sourceDate: parsed.data.source_date ?? null,
    })
    .returning();

  return c.json(rows[0], 201);
});
