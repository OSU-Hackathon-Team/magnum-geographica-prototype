import { Hono } from "hono";
import { eq, ilike, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { systems, trailSystems, trails, features, users } from "../db/schema.js";
import {
  createSystemInputSchema,
  updateSystemInputSchema,
} from "@magnum/shared";
import { authRequired, type AuthUser } from "../middleware/auth.js";
import { recordRevision } from "../services/revisions.js";
import { resolveContributorName } from "../services/identity.js";
import { canWrite, getProtection, refreshProtection } from "../services/protection.js";
import { evaluateAction } from "../services/patrol.js";
import { updateSystem } from "../services/hierarchy.js";

type Variables = { user?: AuthUser };

export const systemsRoute = new Hono<{ Variables: Variables }>();

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

const baseSystemSelectWithBoundary = {
  ...baseSystemSelect,
  // Boundary as a parsed JSON object (or null). We round-trip
  // through ST_AsGeoJSON to get a canonical GeoJSON
  // representation regardless of whether the stored geometry is a
  // Polygon or a MultiPolygon.
  boundary: sql<unknown>`CASE WHEN ${systems.boundary} IS NULL THEN NULL ELSE ST_AsGeoJSON(${systems.boundary})::json END`,
} as const;

const baseSystemSelectWithCenter = {
  ...baseSystemSelectWithBoundary,
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
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(systems)
      .where(where),
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

/**
 * Boundary inserted as GeoJSON. We round-trip through PostGIS's
 * `ST_GeomFromGeoJSON` so the column type stays `geometry(MultiPolygon, 4326)`
 * — that's what the GIST index and the Martin tile server expect.
 */
function boundarySql(geojson: unknown) {
  if (!geojson) return null;
  return sql`ST_Multi(ST_GeomFromGeoJSON(${JSON.stringify(geojson)}))`;
}

systemsRoute.post("/", authRequired(), async (c) => {
  const authUser = c.get("user");
  if (!authUser) return c.json({ error: "unauthorized" }, 401);
  const body = await c.req.json().catch(() => null);
  const parsed = createSystemInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", message: "validation failed", details: parsed.error.flatten() },
      400,
    );
  }

  const insertValues = {
    name: parsed.data.name,
    slug: parsed.data.slug,
    description: parsed.data.description ?? null,
    externalUrl: parsed.data.external_url ?? null,
    ownershipSource: parsed.data.ownership_source ?? null,
    sourceDate: parsed.data.source_date ?? null,
    boundary: boundarySql(parsed.data.boundary ?? null),
  };

  const rows = await db
    .insert(systems)
    .values(insertValues as never)
    .returning();

  const created = rows[0];
  if (!created) {
    return c.json({ error: "internal", message: "failed to insert system" }, 500);
  }

  // Revision log. `contributorName` falls back to `IP:<address>` for
  // unauthenticated calls (the auth middleware still authenticates
  // the JWT; this is for the case where a future change relaxes auth
  // for system create). Today this is always the user's username.
  const contributorName = resolveContributorName({
    req: c.req,
    get: c.get.bind(c),
  });
  await recordRevision({
    targetType: "system",
    targetId: created.id,
    action: "create",
    actorId: authUser.id,
    contributorName,
    editSummary: `Created system ${created.name}`,
    payloadAfter: {
      name: created.name,
      slug: created.slug,
      boundary: parsed.data.boundary ?? null,
    },
  });

  return c.json(created, 201);
});

/**
 * §21.5 — PATCH a system. Any logged-in user can update; the
 * protection service gate is applied automatically via
 * `refreshProtection` + `canWrite` (so popular entities require a
 * higher trust tier). Boundary is wrapped through
 * `ST_GeomFromGeoJSON` so the DB column stays a PostGIS
 * MultiPolygon.
 */
systemsRoute.put("/:id", authRequired(), async (c) => {
  const authUser = c.get("user");
  if (!authUser) return c.json({ error: "unauthorized" }, 401);
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = updateSystemInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", message: "validation failed", details: parsed.error.flatten() },
      400,
    );
  }

  // Protection gate.
  await refreshProtection("system", id);
  const prot = await getProtection("system", id);
  const actorRow = await db
    .select({ karma: users.trustScore, role: users.role })
    .from(users)
    .where(eq(users.id, authUser.id))
    .limit(1);
  const allowed = canWrite(prot.level, {
    role: actorRow[0]?.role ?? null,
    karma: Number(actorRow[0]?.karma ?? 0),
    loggedIn: true,
  });
  if (!allowed) {
    return c.json(
      {
        error: "forbidden",
        message: `protection level '${prot.level}' requires higher trust tier`,
        protection: prot.level,
      },
      403,
    );
  }

  // Snapshot the pre-image so the revision log records what changed.
  const beforeRow = await db.select().from(systems).where(eq(systems.id, id)).limit(1);
  const before = beforeRow[0];

  const patch: Parameters<typeof updateSystem>[1] = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.color !== undefined) patch.color = parsed.data.color;
  if (parsed.data.description !== undefined) patch.description = parsed.data.description;
  if (parsed.data.external_url !== undefined) patch.externalUrl = parsed.data.external_url;
  if (parsed.data.ownership_source !== undefined)
    patch.ownershipSource = parsed.data.ownership_source;
  if (parsed.data.source_date !== undefined) patch.sourceDate = parsed.data.source_date;
  if (parsed.data.boundary !== undefined) {
    // The updateSystem service handles the GeoJSON → PostGIS
    // wrapping via ST_GeomFromGeoJSON internally; we hand it the
    // raw object and let the service stringify.
    patch.boundary = parsed.data.boundary;
  }

  const updated = await updateSystem(id, patch);
  if (!updated) return c.json({ error: "not_found" }, 404);

  const contributorName = resolveContributorName({
    req: c.req,
    get: c.get.bind(c),
  });
  await recordRevision({
    targetType: "system",
    targetId: id,
    action: "update",
    actorId: authUser.id,
    contributorName,
    editSummary: "Updated system",
    payloadBefore: before
      ? {
          name: before.name,
          boundary_changed: parsed.data.boundary !== undefined,
        }
      : null,
    payloadAfter: {
      boundary_changed: parsed.data.boundary !== undefined,
      fields: Object.keys(patch),
    },
  });

  // Patrol: surface the action for low-trust actors (the patrol
  // service decides whether to flag). Best-effort.
  await evaluateAction({
    revisionId: "00000000-0000-0000-0000-000000000000",
    actorId: authUser.id,
    actorKarma: Number(actorRow[0]?.karma ?? 0),
    actorRole: authUser.role,
    targetType: "system",
    targetId: id,
    action: "reassign",
  }).catch(() => undefined);

  // Re-fetch with the same shape as the other read endpoints.
  const refreshed = await db
    .select(baseSystemSelectWithCenter)
    .from(systems)
    .where(eq(systems.id, id))
    .limit(1);
  const fresh = refreshed[0];
  if (!fresh) return c.json({ error: "not_found" }, 404);
  const { lon, lat, ...rest } = fresh;
  const center = lon != null && lat != null ? { lat, lon } : null;
  return c.json({ ...rest, center });
});
