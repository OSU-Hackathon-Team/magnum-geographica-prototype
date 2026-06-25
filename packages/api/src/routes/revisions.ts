import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import {
  revisionQuerySchema,
  revertRevisionInputSchema,
} from "@magnum/shared/schemas";
import {
  getRevisionById,
  listRevisionsForTarget,
  queryRevisions,
  recordRevision,
} from "../services/revisions.js";
import { authRequired, type AuthUser } from "../middleware/auth.js";
import { canWrite, getProtection, refreshProtection } from "../services/protection.js";
import { evaluateAction } from "../services/patrol.js";
import type { RevisionTargetType, RevisionAction } from "@magnum/shared/constants";

type Variables = { user: AuthUser };

export const revisionsRoute = new Hono<{ Variables: Variables }>();

/**
 * Generalized revision query. Supports filtering by target_type, target_id,
 * author_id. Powers the new per-entity history view and the moderation
 * patrol feed.
 */
revisionsRoute.get("/", async (c) => {
  const parsed = revisionQuerySchema.safeParse({
    target_type: c.req.query("target_type"),
    target_id: c.req.query("target_id"),
    author_id: c.req.query("author_id"),
    page: c.req.query("page") ?? undefined,
    pageSize: c.req.query("pageSize") ?? undefined,
  });
  if (!parsed.success) {
    return c.json({ error: "invalid_input", message: parsed.error.issues[0]?.message ?? "validation failed" }, 400);
  }
  const { target_type, target_id, author_id, page, pageSize } = parsed.data;
  const { items, total } = await queryRevisions({
    targetType: target_type as RevisionTargetType | undefined,
    targetId: target_id,
    authorId: author_id,
    page,
    pageSize,
  });
  return c.json({ items, total, page, pageSize });
});

revisionsRoute.get("/:id", async (c) => {
  const id = c.req.param("id");
  const rev = await getRevisionById(id);
  if (!rev) return c.json({ error: "not_found" }, 404);
  return c.json(rev);
});

revisionsRoute.get("/target/:targetType/:targetId", async (c) => {
  const targetType = c.req.param("targetType") as RevisionTargetType;
  const targetId = c.req.param("targetId");
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(c.req.query("pageSize") ?? "20", 10)));
  const { items, total } = await listRevisionsForTarget(targetType, targetId, { page, pageSize });
  return c.json({ items, total, page, pageSize });
});

/**
 * Revert a revision. Protection-gated: requires the actor's tier to meet
 * the minimum for the target's current protection level. Always writes a
 * new revision with `action='revert'` and `reverted_from_id` pointing at the
 * source revision.
 */
revisionsRoute.post("/:id/revert", authRequired(), async (c) => {
  const authUser = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const parsed = revertRevisionInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_input", message: parsed.error.issues[0]?.message ?? "validation failed" }, 400);
  }

  const source = await getRevisionById(id);
  if (!source) return c.json({ error: "not_found", message: "revision not found" }, 404);
  if (!source.targetType || !source.targetId) {
    return c.json({ error: "invalid_input", message: "source revision has no target" }, 400);
  }

  // Protection check.
  const actorRows = await db
    .select({ karma: users.trustScore, role: users.role })
    .from(users)
    .where(eq(users.id, authUser.id))
    .limit(1);
  const actorKarma = Number(actorRows[0]?.karma ?? 0);
  const actorRole = actorRows[0]?.role ?? authUser.role;

  const targetType = source.targetType as RevisionTargetType;
  // Refresh protection before checking so the gate is up-to-date.
  await refreshProtection(targetType, source.targetId);
  const prot = await getProtection(targetType, source.targetId);

  const allowed = canWrite(prot.level, {
    role: actorRole,
    karma: actorKarma,
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

  // Write the revert revision. The actual data undo is the responsibility
  // of the per-entity route (which has the entity-specific knowledge).
  // We do record the audit trail and run patrol evaluation.
  const newRevId = await recordRevision({
    targetType: targetType as RevisionTargetType,
    targetId: source.targetId,
    action: "revert" as RevisionAction,
    actorId: authUser.id,
    contributorName: parsed.data.contributor_name,
    editSummary:
      parsed.data.edit_summary ?? `Revert to revision ${id}`,
    revertedFromId: id,
    payloadBefore: { revertedFrom: id },
  });
  // Patrol: flag this revert per the §21.8 rules.
  await evaluateAction({
    revisionId: newRevId,
    actorId: authUser.id,
    actorKarma,
    actorRole,
    targetType,
    targetId: source.targetId,
    action: "revert",
  });

  return c.json({ ok: true, revision_id: newRevId });
});
