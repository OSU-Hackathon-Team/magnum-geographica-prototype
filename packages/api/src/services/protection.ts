/**
 * Entity protection gating (§21.8).
 *
 * Protection levels (Wikipedia-style escalation):
 *   - normal:  default; any logged-in contributor OR IP user can edit/revert.
 *   - semi:    popular entities (≥10 net upvotes OR ≥3 children). Only
 *              Established+ users (50+ karma) can edit/revert. IP users
 *              are blocked.
 *   - full:    very popular (≥100 upvotes) OR moderator-set. Only Moderators
 *              can edit/revert.
 *
 * The level is computed from `entity_stats` (net upvotes) and the entity's
 * child count. A moderator can pin a level higher than the auto-derived one.
 *
 * Hard rule (always enforced): if a user is the *creator* of an entity, they
 * can delete it regardless of protection — provided they pass the "no other
 * contributors' children" check. IP users can never delete.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { entityProtection, entityStats, features, trails, systems } from "../db/schema.js";
import {
  PROTECTION_SEMI_UPVOTE_THRESHOLD,
  PROTECTION_SEMI_CHILDREN_THRESHOLD,
  PROTECTION_FULL_UPVOTE_THRESHOLD,
  type ProtectionLevel,
  type TrustTier,
  type VoteTargetType,
} from "@magnum/shared/constants";
import { tierFromKarma } from "./karma.js";

/**
 * The protection service can be asked about any entity type. We keep the
 * VOTE_TARGET_TYPES as the primary input (since the karma system is the
 * main driver of upvotes), but accept a wider string for super/sub-systems
 * and trail-tier entities that don't yet have direct vote surfaces.
 */
export type ProtectionTargetType = VoteTargetType | "super_system" | "sub_system" | "trail";

export interface ProtectionContext {
  targetType: ProtectionTargetType;
  targetId: string;
  upvotes: number;
  children: number;
  storedLevel?: ProtectionLevel;
  storedReason?: string | null;
}

/**
 * Compute the effective protection level for an entity, accounting for
 * auto-promotion rules and any moderator override.
 */
export function effectiveProtection(ctx: ProtectionContext): ProtectionLevel {
  // Moderator-pinned overrides win.
  if (ctx.storedLevel === "full") return "full";

  // Auto-promote to full at high upvote counts.
  if (ctx.upvotes >= PROTECTION_FULL_UPVOTE_THRESHOLD) return "full";

  if (ctx.storedLevel === "semi") return "semi";

  // Auto-promote to semi based on upvotes or children.
  if (ctx.upvotes >= PROTECTION_SEMI_UPVOTE_THRESHOLD) return "semi";
  if (ctx.children >= PROTECTION_SEMI_CHILDREN_THRESHOLD) return "semi";

  return "normal";
}

export function isModerator(role: string | undefined | null): boolean {
  return role === "admin" || role === "moderator";
}

/**
 * Minimum tier required to edit/revert an entity at the given protection
 * level. Moderators always pass.
 */
export function minTierForProtection(level: ProtectionLevel): TrustTier {
  if (level === "full") return "moderator";
  if (level === "semi") return "established";
  return "new";
}

/**
 * Whether `user` (with optional role and karma) may perform a write operation
 * (create/update/delete/revert) against an entity with protection `level`.
 *
 * IP users (kind="ip") are allowed only on `normal`-protection entities.
 * Logged-in users follow the tier-based gating:
 *   - they are a moderator (always), OR
 *   - the protection is `normal` and they're logged in, OR
 *   - their tier is at or above the minimum for this level.
 */
export function canWrite(
  level: ProtectionLevel,
  actor: { role?: string | null; karma?: number; loggedIn: boolean; kind?: "user" | "ip" },
): boolean {
  if (actor.kind === "ip") return level === "normal";
  if (!actor.loggedIn) return false;
  if (isModerator(actor.role ?? null)) return true;
  const required = minTierForProtection(level);
  if (required === "moderator") return false;
  const tier = tierFromKarma(actor.karma ?? 0);
  return tierWeightFor(required) <= tierWeightFor(tier);
}

function tierWeightFor(tier: TrustTier): number {
  // Lower number = lower tier. Tier rank is implicit in the enum order.
  const order: TrustTier[] = ["new", "established", "trusted", "moderator"];
  return order.indexOf(tier);
}

/**
 * Whether `actor` may *delete* an entity. Adds the hard rule: a system with
 * ≥2 trails they did not create cannot be deleted by a non-moderator.
 * IP users (kind="ip") can never delete. Caller is responsible for the
 * children-count check.
 */
export function canDelete(
  level: ProtectionLevel,
  actor: { role?: string | null; karma?: number; loggedIn: boolean; isCreator: boolean; kind?: "user" | "ip" },
  childrenNotOwnedByActor: number,
): { ok: boolean; reason?: string } {
  if (actor.kind === "ip") return { ok: false, reason: "IP users cannot delete entities" };
  if (!canWrite(level, actor)) {
    return { ok: false, reason: "protection level too high" };
  }
  if (actor.isCreator) return { ok: true };
  if (isModerator(actor.role ?? null)) return { ok: true };
  if (childrenNotOwnedByActor >= 2) {
    return {
      ok: false,
      reason: "cannot delete a system with multiple trails you did not create",
    };
  }
  return { ok: true };
}

/**
 * Count "children" of an entity — anything that would be lost/cascade if it
 * were deleted. Today: trails under a system. The plan also lists
 * sub-systems and trail_systems rows, which Drizzle handles via FK cascades;
 * we count the meaningful children (trails, features, sub-systems).
 */
export async function countChildren(
  targetType: ProtectionTargetType,
  targetId: string,
): Promise<number> {
  if (targetType === "system") {
    const trailCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(trails)
      .innerJoin(
        sql`trail_systems`,
        sql`trail_systems.trail_id = ${trails.id} AND trail_systems.system_id = ${targetId}`,
      );
    const featureCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(features)
      .where(eq(features.systemId, targetId));
    return Number(trailCount[0]?.count ?? 0) + Number(featureCount[0]?.count ?? 0);
  }
  if (targetType === "trail") {
    // segments are the meaningful children of a trail.
    const segs = await db.execute<{ count: string }>(
      sql`SELECT count(*)::int AS count FROM trail_segments WHERE trail_id = ${targetId}`,
    );
    return Number((segs.rows[0] as { count?: string | number } | undefined)?.count ?? 0);
  }
  return 0;
}

/**
 * Recompute and persist protection level for an entity based on its current
 * upvotes and child count. Cheap to call after a vote or a child-add.
 */
export async function refreshProtection(
  targetType: ProtectionTargetType,
  targetId: string,
): Promise<ProtectionLevel> {
  const [statsRow, storedRow] = await Promise.all([
    db
      .select({ upvotes: entityStats.upvotes })
      .from(entityStats)
      .where(and(eq(entityStats.targetType, targetType), eq(entityStats.targetId, targetId)))
      .limit(1),
    db
      .select()
      .from(entityProtection)
      .where(
        and(
          eq(entityProtection.targetType, targetType),
          eq(entityProtection.targetId, targetId),
        ),
      )
      .limit(1),
  ]);
  const upvotes = Number(statsRow[0]?.upvotes ?? 0);
  const children = await countChildren(targetType, targetId);
  const level = effectiveProtection({
    targetType,
    targetId,
    upvotes,
    children,
    storedLevel: storedRow[0]?.level as ProtectionLevel | undefined,
    storedReason: storedRow[0]?.reason ?? null,
  });

  await db
    .insert(entityProtection)
    .values({
      targetType,
      targetId,
      level,
      upvotesAt: upvotes,
      childrenAt: children,
      reason: level === "normal" ? null : "auto",
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [entityProtection.targetType, entityProtection.targetId],
      set: {
        level,
        upvotesAt: upvotes,
        childrenAt: children,
        updatedAt: new Date(),
      },
    });
  return level;
}

/**
 * Set protection level manually (moderator action).
 */
export async function setProtection(
  targetType: ProtectionTargetType,
  targetId: string,
  level: ProtectionLevel,
  reason: string,
): Promise<void> {
  await db
    .insert(entityProtection)
    .values({
      targetType,
      targetId,
      level,
      reason,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [entityProtection.targetType, entityProtection.targetId],
      set: { level, reason, updatedAt: new Date() },
    });
}

export async function getProtection(
  targetType: ProtectionTargetType,
  targetId: string,
): Promise<{
  level: ProtectionLevel;
  upvotes: number;
  children: number;
  reason: string | null;
}> {
  const [stored, stats] = await Promise.all([
    db
      .select()
      .from(entityProtection)
      .where(
        and(
          eq(entityProtection.targetType, targetType),
          eq(entityProtection.targetId, targetId),
        ),
      )
      .limit(1),
    db
      .select({ upvotes: entityStats.upvotes })
      .from(entityStats)
      .where(and(eq(entityStats.targetType, targetType), eq(entityStats.targetId, targetId)))
      .limit(1),
  ]);
  const upvotes = Number(stats[0]?.upvotes ?? 0);
  const children = await countChildren(targetType, targetId);
  const level = effectiveProtection({
    targetType,
    targetId,
    upvotes,
    children,
    storedLevel: stored[0]?.level as ProtectionLevel | undefined,
    storedReason: stored[0]?.reason ?? null,
  });
  return { level, upvotes, children, reason: stored[0]?.reason ?? null };
}
