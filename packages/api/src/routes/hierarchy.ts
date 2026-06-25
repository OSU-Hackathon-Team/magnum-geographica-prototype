import { Hono } from "hono";
import { authRequired, type AuthUser } from "../middleware/auth.js";
import {
  assignTrailsInputSchema,
  createSubSystemInputSchema,
  createSuperSystemInputSchema,
  createSystemInputSchema,
  moveSystemInputSchema,
  pointInPolygonQuerySchema,
  updateSubSystemInputSchema,
  updateSuperSystemInputSchema,
  updateSystemInputSchema,
} from "@magnum/shared";
import { refreshProtection, canWrite, canDelete } from "../services/protection.js";
import { evaluateAction } from "../services/patrol.js";
import { recordRevision } from "../services/revisions.js";
import { db } from "../db/index.js";
import { eq } from "drizzle-orm";
import { systems as systemsTable, users } from "../db/schema.js";
import {
  assignTrailsToSystem,
  createSubSystem,
  createSuperSystem,
  createSystem,
  deleteSubSystem,
  deleteSuperSystem,
  deleteSystem,
  getHierarchyTree,
  getSubSystem,
  getSuperSystem,
  listSubSystems,
  listSuperSystems,
  moveSystem,
  systemsContainingPoint,
  unassignTrailsFromSystem,
  updateSubSystem,
  updateSuperSystem,
  updateSystem,
} from "../services/hierarchy.js";

type Variables = { user?: AuthUser };

/* ------------------------------------------------------------------ */
/* /api/super-systems                                                 */
/* ------------------------------------------------------------------ */

export const superSystemsRoute = new Hono<{ Variables: Variables }>();

superSystemsRoute.get("/", async (c) => {
  const items = await listSuperSystems();
  return c.json({ items, total: items.length });
});

superSystemsRoute.get("/:id", async (c) => {
  const id = c.req.param("id");
  const sup = await getSuperSystem(id);
  if (!sup) return c.json({ error: "not_found" }, 404);
  return c.json(sup);
});

superSystemsRoute.post("/", authRequired(), async (c) => {
  const authUser = c.get("user");
  if (!authUser) return c.json({ error: "unauthorized" }, 401);
  const body = await c.req.json().catch(() => null);
  const parsed = createSuperSystemInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", message: parsed.error.issues[0]?.message ?? "validation failed" },
      400,
    );
  }
  // Per outline.md, super-systems are "Unofficial" if self-organized.
  // Mods+ are treated as official.
  const official = authUser.role === "admin" || authUser.role === "moderator" || parsed.data.official;
  const created = await createSuperSystem({ ...parsed.data, official });
  await recordRevision({
    targetType: "super_system",
    targetId: created.id,
    action: "create",
    actorId: authUser.id,
    contributorName: authUser.username,
    editSummary: `Created super-system ${created.name}`,
    payloadAfter: { name: created.name, official: created.official },
  });
  return c.json(created, 201);
});

superSystemsRoute.put("/:id", authRequired(), async (c) => {
  const authUser = c.get("user");
  if (!authUser) return c.json({ error: "unauthorized" }, 401);
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = updateSuperSystemInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", message: parsed.error.issues[0]?.message ?? "validation failed" },
      400,
    );
  }
  const updated = await updateSuperSystem(id, parsed.data);
  if (!updated) return c.json({ error: "not_found" }, 404);
  await recordRevision({
    targetType: "super_system",
    targetId: id,
    action: "update",
    actorId: authUser.id,
    contributorName: authUser.username,
    editSummary: "Updated super-system",
  });
  return c.json(updated);
});

superSystemsRoute.delete("/:id", authRequired(), async (c) => {
  const authUser = c.get("user");
  if (!authUser) return c.json({ error: "unauthorized" }, 401);
  const id = c.req.param("id");
  const ok = await deleteSuperSystem(id);
  if (!ok) return c.json({ error: "not_found" }, 404);
  await recordRevision({
    targetType: "super_system",
    targetId: id,
    action: "delete",
    actorId: authUser.id,
    contributorName: authUser.username,
    editSummary: "Deleted super-system",
  });
  return c.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/* /api/sub-systems                                                   */
/* ------------------------------------------------------------------ */

export const subSystemsRoute = new Hono<{ Variables: Variables }>();

subSystemsRoute.get("/", async (c) => {
  const systemId = c.req.query("system_id");
  const items = await listSubSystems(systemId);
  return c.json({ items, total: items.length });
});

subSystemsRoute.get("/:id", async (c) => {
  const id = c.req.param("id");
  const sub = await getSubSystem(id);
  if (!sub) return c.json({ error: "not_found" }, 404);
  return c.json(sub);
});

subSystemsRoute.post("/", authRequired(), async (c) => {
  const authUser = c.get("user");
  if (!authUser) return c.json({ error: "unauthorized" }, 401);
  const body = await c.req.json().catch(() => null);
  const parsed = createSubSystemInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", message: parsed.error.issues[0]?.message ?? "validation failed" },
      400,
    );
  }
  const created = await createSubSystem({
    systemId: parsed.data.system_id,
    name: parsed.data.name,
    slug: parsed.data.slug,
    geometry: parsed.data.geometry,
    description: parsed.data.description,
  });
  await recordRevision({
    targetType: "sub_system",
    targetId: created.id,
    action: "create",
    actorId: authUser.id,
    contributorName: authUser.username,
    editSummary: `Created sub-system ${created.name}`,
  });
  return c.json(created, 201);
});

subSystemsRoute.put("/:id", authRequired(), async (c) => {
  const authUser = c.get("user");
  if (!authUser) return c.json({ error: "unauthorized" }, 401);
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = updateSubSystemInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_input", message: parsed.error.issues[0]?.message ?? "validation failed" },
      400,
    );
  }
  const updated = await updateSubSystem(id, parsed.data);
  if (!updated) return c.json({ error: "not_found" }, 404);
  await recordRevision({
    targetType: "sub_system",
    targetId: id,
    action: "update",
    actorId: authUser.id,
    contributorName: authUser.username,
    editSummary: "Updated sub-system",
  });
  return c.json(updated);
});

subSystemsRoute.delete("/:id", authRequired(), async (c) => {
  const authUser = c.get("user");
  if (!authUser) return c.json({ error: "unauthorized" }, 401);
  const id = c.req.param("id");
  const ok = await deleteSubSystem(id);
  if (!ok) return c.json({ error: "not_found" }, 404);
  await recordRevision({
    targetType: "sub_system",
    targetId: id,
    action: "delete",
    actorId: authUser.id,
    contributorName: authUser.username,
    editSummary: "Deleted sub-system",
  });
  return c.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/* System moves + tree + contains                                     */
/* ------------------------------------------------------------------ */

export const systemMoveRoute = new Hono<{ Variables: Variables }>();

systemMoveRoute.post("/:id/move", authRequired(), async (c) => {
  const authUser = c.get("user");
  if (!authUser) return c.json({ error: "unauthorized" }, 401);
  const sourceSystemId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = moveSystemInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", message: parsed.error.issues[0]?.message ?? "validation failed" },
      400,
    );
  }
  const { action, target_super_id, target_system_id, sub_system_id, trail_ids } = parsed.data;

  // Protection gate for write-class actions on a system.
  if (action !== "assign_trail" && action !== "unassign_trail" && action !== "merge_into") {
    if (sourceSystemId) {
      await refreshProtection("system", sourceSystemId);
      const { getProtection } = await import("../services/protection.js");
      const prot = await getProtection("system", sourceSystemId);
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
    }
  }

  if (action === "assign_trail" && trail_ids) {
    const n = await assignTrailsToSystem(sourceSystemId, trail_ids);
    return c.json({ ok: true, action, affected: n });
  }
  if (action === "unassign_trail" && trail_ids) {
    const n = await unassignTrailsFromSystem(sourceSystemId, trail_ids);
    return c.json({ ok: true, action, affected: n });
  }

  // For merge_into we also check the delete gate (the source system is
  // being absorbed — outline.md's "multiple trails you did not create"
  // rule still applies).
  if (action === "merge_into" && sourceSystemId) {
    const actorRow = await db
      .select({ karma: users.trustScore, role: users.role })
      .from(users)
      .where(eq(users.id, authUser.id))
      .limit(1);
    const actorKarma = Number(actorRow[0]?.karma ?? 0);
    const actorRole = actorRow[0]?.role ?? null;
    const protRow = await db
      .select({ c: systemsTable })
      .from(systemsTable)
      .where(eq(systemsTable.id, sourceSystemId))
      .limit(1);
    void protRow;
    const isCreator = protRow[0]?.c?.id === authUser.id;
    const { countChildren } = await import("../services/protection.js");
    const children = await countChildren("system", sourceSystemId);
    const del = canDelete(
      "normal",
      { loggedIn: true, role: actorRole, karma: actorKarma, isCreator },
      children,
    );
    if (!del.ok) {
      return c.json({ error: "forbidden", message: del.reason }, 403);
    }
  }

  const result = await moveSystem(action, {
    actorId: authUser.id,
    actorRole: authUser.role,
    sourceSystemId,
    sourceSubSystemId: sub_system_id,
    targetSuperId: target_super_id,
    targetSystemId: target_system_id,
  });
  if (!result.ok) {
    return c.json({ error: "invalid_input", message: result.reason ?? "move failed" }, 400);
  }
  // Patrol: log the action. Trust tier is checked on the next mutation;
  // for now we just record.
  await evaluateAction({
    revisionId: "00000000-0000-0000-0000-000000000000", // synthetic; patrol uses this for grouping
    actorId: authUser.id,
    actorKarma: 0,
    actorRole: authUser.role,
    targetType: "system",
    targetId: sourceSystemId,
    action: "reassign",
  }).catch(() => undefined);
  return c.json({ ok: true, action, affected: result.affected ?? 0 });
});

/* ------------------------------------------------------------------ */
/* Tree + contains                                                    */
/* ------------------------------------------------------------------ */

export const systemTreeRoute = new Hono();

systemTreeRoute.get("/", async (c) => {
  const nodes = await getHierarchyTree();
  return c.json({ nodes, total: nodes.length });
});

export const systemContainsRoute = new Hono();

systemContainsRoute.get("/contains", async (c) => {
  const parsed = pointInPolygonQuerySchema.safeParse({
    lon: c.req.query("lon"),
    lat: c.req.query("lat"),
  });
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", message: parsed.error.issues[0]?.message ?? "validation failed" },
      400,
    );
  }
  const { hits, usedFallback } = await systemsContainingPoint(parsed.data.lon, parsed.data.lat);
  return c.json({
    systems: hits.map((h) => ({
      id: h.id,
      name: h.name,
      slug: h.slug,
      distance_m: h.distance_m ?? undefined,
    })),
    fallback: usedFallback ? "nearest" : "point_in_polygon",
  });
});
