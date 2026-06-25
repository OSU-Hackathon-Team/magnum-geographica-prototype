/**
 * Hierarchy service (§21.5).
 *
 * Wraps CRUD for the system / super_system / sub_system tier plus the
 * "Move-to" action set the plan calls out:
 *
 *   - move_to_super       system → joins a super-system
 *   - move_out_of_super   system → leaves all super-systems
 *   - promote_to_system   sub-system → becomes its own system
 *   - demote_to_sub_system (no-op; sub-systems are scoped to a system)
 *   - merge_into          system A → folds into system B (trails, features,
 *                                            sub-systems move with it; A
 *                                            is deleted)
 *   - assign_trail        attach N trails to a system
 *   - unassign_trail      remove N trails from a system
 *
 * Every mutation is revision-logged via the generalized revisions
 * service so the moderator patrol feed can review it. Hard rule
 * (per outline.md): a system with ≥2 trails not created by the actor
 * cannot be deleted by a non-moderator; canDelete() in the protection
 * service enforces this.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  systems,
  subSystems,
  superSystems,
  systemSuperSystems,
  trailSystems,
  trailSubSystems,
  features,
  trails,
  type System,
  type SubSystem,
  type SuperSystem,
  type NewSystem,
} from "../db/schema.js";
import type { HierarchyAction, HierarchyTreeNode } from "@magnum/shared";
import { recordRevision } from "./revisions.js";

/* ------------------------------------------------------------------ */
/* Super-systems                                                      */
/* ------------------------------------------------------------------ */

export async function listSuperSystems(): Promise<SuperSystem[]> {
  return db.select().from(superSystems).orderBy(asc(superSystems.name));
}

export async function getSuperSystem(id: string): Promise<SuperSystem | null> {
  const rows = await db.select().from(superSystems).where(eq(superSystems.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createSuperSystem(input: {
  name: string;
  slug: string;
  official: boolean;
  description?: string;
  externalUrl?: string;
  boundary?: unknown;
}): Promise<SuperSystem> {
  const rows = await db
    .insert(superSystems)
    .values({
      name: input.name,
      slug: input.slug,
      official: input.official,
      description: input.description ?? null,
      externalUrl: input.externalUrl ?? null,
      boundary: input.boundary
        ? (sql`ST_GeomFromGeoJSON(${JSON.stringify(input.boundary)})` as never)
        : null,
    })
    .returning();
  const p = rows[0];
  if (!p) throw new Error("failed to insert super_system");
  return p;
}

export async function updateSuperSystem(
  id: string,
  patch: {
    name?: string;
    official?: boolean;
    description?: string;
    externalUrl?: string;
    boundary?: unknown;
  },
): Promise<SuperSystem | null> {
  const updates: Record<string, unknown> = {};
  if (patch.name !== undefined) updates.name = patch.name;
  if (patch.official !== undefined) updates.official = patch.official;
  if (patch.description !== undefined) updates.description = patch.description;
  if (patch.externalUrl !== undefined) updates.externalUrl = patch.externalUrl;
  if (patch.boundary !== undefined) {
    updates.boundary = patch.boundary
      ? (sql`ST_GeomFromGeoJSON(${JSON.stringify(patch.boundary)})` as never)
      : null;
  }
  if (Object.keys(updates).length === 0) return getSuperSystem(id);
  const rows = await db
    .update(superSystems)
    .set(updates as Partial<SuperSystem>)
    .where(eq(superSystems.id, id))
    .returning();
  return rows[0] ?? null;
}

export async function deleteSuperSystem(id: string): Promise<boolean> {
  // Detach all systems that belong to this super-system first.
  await db.delete(systemSuperSystems).where(eq(systemSuperSystems.superSystemId, id));
  const rows = await db.delete(superSystems).where(eq(superSystems.id, id)).returning({ id: superSystems.id });
  return rows.length > 0;
}

/* ------------------------------------------------------------------ */
/* Systems                                                            */
/* ------------------------------------------------------------------ */

export async function createSystem(input: NewSystem): Promise<System> {
  const rows = await db.insert(systems).values(input).returning();
  const s = rows[0];
  if (!s) throw new Error("failed to insert system");
  return s;
}

export async function updateSystem(
  id: string,
  patch: {
    name?: string;
    color?: string;
    boundary?: unknown;
    description?: string;
    externalUrl?: string;
    ownershipSource?: string;
    sourceDate?: string;
  },
): Promise<System | null> {
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) updates.name = patch.name;
  if (patch.color !== undefined) updates.color = patch.color;
  if (patch.description !== undefined) updates.description = patch.description;
  if (patch.externalUrl !== undefined) updates.externalUrl = patch.externalUrl;
  if (patch.ownershipSource !== undefined) updates.ownershipSource = patch.ownershipSource;
  if (patch.sourceDate !== undefined) updates.sourceDate = patch.sourceDate;
  if (patch.boundary !== undefined) {
    updates.boundary = patch.boundary
      ? (sql`ST_GeomFromGeoJSON(${JSON.stringify(patch.boundary)})` as never)
      : null;
  }
  if (Object.keys(updates).length === 1) {
    const rows = await db.select().from(systems).where(eq(systems.id, id)).limit(1);
    return rows[0] ?? null;
  }
  const rows = await db
    .update(systems)
    .set(updates as Partial<NewSystem>)
    .where(eq(systems.id, id))
    .returning();
  return rows[0] ?? null;
}

export async function deleteSystem(id: string): Promise<boolean> {
  // Detach: sub-systems become orphans (we null their system_id);
  // features and trails lose their system_id pointer but keep trail_id.
  // Both Drizzle FKs are SET NULL on the relevant columns.
  await db.delete(systemSuperSystems).where(eq(systemSuperSystems.systemId, id));
  await db.update(subSystems).set({ systemId: null as never }).where(eq(subSystems.systemId, id));
  const rows = await db.delete(systems).where(eq(systems.id, id)).returning({ id: systems.id });
  return rows.length > 0;
}

/* ------------------------------------------------------------------ */
/* Sub-systems                                                        */
/* ------------------------------------------------------------------ */

export async function listSubSystems(systemId?: string): Promise<SubSystem[]> {
  if (systemId) {
    return db.select().from(subSystems).where(eq(subSystems.systemId, systemId)).orderBy(asc(subSystems.name));
  }
  return db.select().from(subSystems).orderBy(asc(subSystems.name));
}

export async function getSubSystem(id: string): Promise<SubSystem | null> {
  const rows = await db.select().from(subSystems).where(eq(subSystems.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createSubSystem(input: {
  systemId: string;
  name: string;
  slug: string;
  geometry?: unknown;
  description?: string;
}): Promise<SubSystem> {
  const rows = await db
    .insert(subSystems)
    .values({
      systemId: input.systemId,
      name: input.name,
      slug: input.slug,
      geometry: input.geometry
        ? (sql`ST_GeomFromGeoJSON(${JSON.stringify(input.geometry)})` as never)
        : null,
      description: input.description ?? null,
    })
    .returning();
  const s = rows[0];
  if (!s) throw new Error("failed to insert sub_system");
  return s;
}

export async function updateSubSystem(
  id: string,
  patch: { name?: string; geometry?: unknown; description?: string },
): Promise<SubSystem | null> {
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) updates.name = patch.name;
  if (patch.description !== undefined) updates.description = patch.description;
  if (patch.geometry !== undefined) {
    updates.geometry = patch.geometry
      ? (sql`ST_GeomFromGeoJSON(${JSON.stringify(patch.geometry)})` as never)
      : null;
  }
  if (Object.keys(updates).length === 1) {
    return getSubSystem(id);
  }
  const rows = await db
    .update(subSystems)
    .set(updates)
    .where(eq(subSystems.id, id))
    .returning();
  return rows[0] ?? null;
}

export async function deleteSubSystem(id: string): Promise<boolean> {
  await db.delete(trailSubSystems).where(eq(trailSubSystems.subSystemId, id));
  const rows = await db.delete(subSystems).where(eq(subSystems.id, id)).returning({ id: subSystems.id });
  return rows.length > 0;
}

/* ------------------------------------------------------------------ */
/* Move-to action set                                                 */
/* ------------------------------------------------------------------ */

export interface MoveResult {
  ok: boolean;
  reason?: string;
  affected?: number;
}

export interface MoveParams {
  actorId: string;
  actorRole?: string;
  actorKarma?: number;
  sourceSystemId?: string;
  sourceSubSystemId?: string;
  targetSuperId?: string;
  targetSystemId?: string;
}

export async function moveSystem(
  action: HierarchyAction,
  params: MoveParams,
): Promise<MoveResult> {
  switch (action) {
    case "move_to_super":
      return moveToSuper(params);
    case "move_out_of_super":
      return moveOutOfSuper(params);
    case "promote_to_system":
      return promoteSubSystem(params);
    case "demote_to_sub_system":
      return { ok: false, reason: "demote_to_sub_system must target a system, not a sub-system" };
    case "merge_into":
      return mergeInto(params);
    case "assign_trail":
    case "unassign_trail":
      return { ok: false, reason: "use /api/systems/:id/trails for trail assignment" };
    default:
      return { ok: false, reason: `unknown action ${action}` };
  }
}

async function moveToSuper(params: MoveParams): Promise<MoveResult> {
  if (!params.sourceSystemId || !params.targetSuperId) {
    return { ok: false, reason: "source_system_id and target_super_id required" };
  }
  await db
    .insert(systemSuperSystems)
    .values({ systemId: params.sourceSystemId, superSystemId: params.targetSuperId })
    .onConflictDoNothing();
  await recordRevision({
    targetType: "system",
    targetId: params.sourceSystemId,
    action: "assign",
    actorId: params.actorId,
    contributorName: "anonymous",
    editSummary: `Moved system into super-system ${params.targetSuperId}`,
    payloadAfter: { superSystemId: params.targetSuperId },
  });
  return { ok: true, affected: 1 };
}

async function moveOutOfSuper(params: MoveParams): Promise<MoveResult> {
  if (!params.sourceSystemId || !params.targetSuperId) {
    return { ok: false, reason: "source_system_id and target_super_id required" };
  }
  const rows = await db
    .delete(systemSuperSystems)
    .where(
      and(
        eq(systemSuperSystems.systemId, params.sourceSystemId),
        eq(systemSuperSystems.superSystemId, params.targetSuperId),
      ),
    )
    .returning();
  await recordRevision({
    targetType: "system",
    targetId: params.sourceSystemId,
    action: "reassign",
    actorId: params.actorId,
    contributorName: "anonymous",
    editSummary: `Removed system from super-system ${params.targetSuperId}`,
    payloadBefore: { superSystemId: params.targetSuperId },
  });
  return { ok: true, affected: rows.length };
}

async function promoteSubSystem(params: MoveParams): Promise<MoveResult> {
  if (!params.sourceSubSystemId) {
    return { ok: false, reason: "sub_system_id required" };
  }
  const sub = await getSubSystem(params.sourceSubSystemId);
  if (!sub) return { ok: false, reason: "sub-system not found" };
  // Create a new system with the sub-system's name, then move its
  // trails over. Sub-system is kept (still valid as a sub-system of
  // its old parent) but trails unbind from it.
  const newSystem = await createSystem({
    name: sub.name,
    slug: `${sub.slug}-promoted-${Date.now().toString(36).slice(-4)}`,
    description: sub.description,
  });
  // Move trails that were assigned to the sub-system over to the new system.
  const trailRows = await db
    .select({ trailId: trailSubSystems.trailId })
    .from(trailSubSystems)
    .where(eq(trailSubSystems.subSystemId, sub.id));
  if (trailRows.length > 0) {
    await db.insert(trailSystems).values(
      trailRows.map((r) => ({ systemId: newSystem.id, trailId: r.trailId })),
    );
    await db.delete(trailSubSystems).where(eq(trailSubSystems.subSystemId, sub.id));
  }
  await recordRevision({
    targetType: "system",
    targetId: newSystem.id,
    action: "create",
    actorId: params.actorId,
    contributorName: "anonymous",
    editSummary: `Promoted sub-system ${sub.name} to its own system`,
    payloadAfter: { promotedFrom: sub.id },
  });
  return { ok: true, affected: 1 };
}

async function mergeInto(params: MoveParams): Promise<MoveResult> {
  if (!params.sourceSystemId || !params.targetSystemId) {
    return { ok: false, reason: "source_system_id and target_system_id required" };
  }
  if (params.sourceSystemId === params.targetSystemId) {
    return { ok: false, reason: "cannot merge a system into itself" };
  }
  // Move all trail assignments over. Detach sub-systems from the
  // source (they become orphans of the new parent on demand — we
  // reassign them too for completeness).
  const trailRows = await db
    .select({ trailId: trailSystems.trailId })
    .from(trailSystems)
    .where(eq(trailSystems.systemId, params.sourceSystemId));
  for (const t of trailRows) {
    await db
      .insert(trailSystems)
      .values({ systemId: params.targetSystemId, trailId: t.trailId })
      .onConflictDoNothing();
  }
  await db.delete(trailSystems).where(eq(trailSystems.systemId, params.sourceSystemId));

  // Reassign sub-systems.
  const subRows = await db
    .select({ id: subSystems.id })
    .from(subSystems)
    .where(eq(subSystems.systemId, params.sourceSystemId));
  for (const s of subRows) {
    await db
      .update(subSystems)
      .set({ systemId: params.targetSystemId })
      .where(eq(subSystems.id, s.id));
  }

  // Move features that pointed only at the source system (no trail) to
  // the target system. Features with a trail are already findable by
  // trail; the system_id pointer is informational.
  await db
    .update(features)
    .set({ systemId: params.targetSystemId })
    .where(eq(features.systemId, params.sourceSystemId));

  // Detach super-system memberships and delete the now-empty source.
  await db.delete(systemSuperSystems).where(eq(systemSuperSystems.systemId, params.sourceSystemId));
  await deleteSystem(params.sourceSystemId);

  await recordRevision({
    targetType: "system",
    targetId: params.targetSystemId,
    action: "reassign",
    actorId: params.actorId,
    contributorName: "anonymous",
    editSummary: `Merged system ${params.sourceSystemId} into ${params.targetSystemId}`,
    payloadAfter: { absorbed: params.sourceSystemId, trailsMoved: trailRows.length },
  });
  return { ok: true, affected: trailRows.length };
}

/* ------------------------------------------------------------------ */
/* Trail assignment                                                   */
/* ------------------------------------------------------------------ */

export async function assignTrailsToSystem(
  systemId: string,
  trailIds: string[],
): Promise<number> {
  if (trailIds.length === 0) return 0;
  const rows = await db
    .insert(trailSystems)
    .values(trailIds.map((trailId) => ({ systemId, trailId })))
    .onConflictDoNothing()
    .returning({ trailId: trailSystems.trailId });
  return rows.length;
}

export async function unassignTrailsFromSystem(
  systemId: string,
  trailIds: string[],
): Promise<number> {
  if (trailIds.length === 0) return 0;
  const rows = await db
    .delete(trailSystems)
    .where(
      and(
        eq(trailSystems.systemId, systemId),
        sql`${trailSystems.trailId} = ANY(${sql.raw(`ARRAY[${trailIds.map((id) => `'${id}'`).join(",")}]::uuid[]`)})`,
      ),
    )
    .returning({ trailId: trailSystems.trailId });
  return rows.length;
}

/* ------------------------------------------------------------------ */
/* Tree                                                               */
/* ------------------------------------------------------------------ */

/**
 * Build the full hierarchy tree: super-systems → systems → sub-systems.
 * Each level is sorted by name. Used by /api/systems/tree.
 */
export async function getHierarchyTree(): Promise<HierarchyTreeNode[]> {
  const allSupers = await db.select().from(superSystems).orderBy(asc(superSystems.name));
  const allSystems = await db.select().from(systems).orderBy(asc(systems.name));
  const allSubs = await db.select().from(subSystems).orderBy(asc(subSystems.name));
  const memberships = await db.select().from(systemSuperSystems);
  const memberBySystem = new Map<string, string[]>();
  for (const m of memberships) {
    const arr = memberBySystem.get(m.systemId) ?? [];
    arr.push(m.superSystemId);
    memberBySystem.set(m.systemId, arr);
  }

  // Unaffiliated systems (no super-system) form a "loose" super-system
  // bucket so the tree still shows them.
  const LOOSE_KEY = "__loose__";
  const looseSystemIds = new Set(
    allSystems.filter((s) => !memberBySystem.has(s.id)).map((s) => s.id),
  );
  const subsByParent = new Map<string, SubSystem[]>();
  for (const s of allSubs) {
    if (!s.systemId) continue;
    const arr = subsByParent.get(s.systemId) ?? [];
    arr.push(s);
    subsByParent.set(s.systemId, arr);
  }

  function systemNode(s: System): HierarchyTreeNode {
    return {
      id: s.id,
      name: s.name,
      slug: s.slug,
      tier: "system",
      children: (subsByParent.get(s.id) ?? []).map((sub) => ({
        id: sub.id,
        name: sub.name,
        slug: sub.slug,
        tier: "sub" as const,
        children: [],
      })),
    };
  }

  const result: HierarchyTreeNode[] = [];
  for (const sup of allSupers) {
    const childSystems = allSystems.filter((s) => memberBySystem.get(s.id)?.includes(sup.id));
    result.push({
      id: sup.id,
      name: `${sup.name}${sup.official ? "" : " (Unofficial)"}`,
      slug: sup.slug,
      tier: "super",
      children: childSystems.map(systemNode),
    });
  }
  if (looseSystemIds.size > 0) {
    const looseSystems = allSystems.filter((s) => looseSystemIds.has(s.id));
    result.push({
      id: LOOSE_KEY,
      name: "Loose systems",
      slug: "loose",
      tier: "super",
      children: looseSystems.map(systemNode),
    });
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* Point-in-polygon                                                   */
/* ------------------------------------------------------------------ */

export interface ContainsRow {
  id: string;
  name: string;
  slug: string;
  distance_m: number | null;
  [key: string]: unknown;
}

/**
 * §21.4 — given a lon/lat, return the systems whose boundary contains
 * the point. If none contain it, return the nearest N systems by
 * centroid distance as a fallback. The frontend uses this to auto-
 * detect "Mountains Park" when the user drops a pin.
 */
export async function systemsContainingPoint(
  lon: number,
  lat: number,
  options: { fallbackLimit?: number } = {},
): Promise<{ hits: ContainsRow[]; usedFallback: boolean }> {
  const fallbackLimit = options.fallbackLimit ?? 3;
  const containing = await db.execute<ContainsRow>(
    sql`SELECT id, name, slug,
          ST_Distance(boundary::geography, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography) AS distance_m
        FROM systems
        WHERE boundary IS NOT NULL
          AND ST_Contains(boundary, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326))
        ORDER BY distance_m ASC NULLS LAST
        LIMIT 10`,
  );
  const hits = containing.rows as ContainsRow[];
  if (hits.length > 0) return { hits, usedFallback: false };

  const nearest = await db.execute<ContainsRow>(
    sql`SELECT id, name, slug,
          ST_Distance(boundary::geography, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography) AS distance_m
        FROM systems
        WHERE boundary IS NOT NULL
        ORDER BY distance_m ASC NULLS LAST
        LIMIT ${fallbackLimit}`,
  );
  return { hits: nearest.rows as ContainsRow[], usedFallback: true };
}
