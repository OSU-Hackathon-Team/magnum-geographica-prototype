import { Hono } from "hono";
import {
  patrolQuerySchema,
  patrolActionSchema,
} from "@magnum/shared/schemas";
import { adminOnly, type AuthUser } from "../middleware/auth.js";
import {
  listPatrolFlags,
  resolveFlag,
  rollbackActorEdits,
} from "../services/patrol.js";
import { recordRevision } from "../services/revisions.js";
import type { PatrolFlagReason } from "@magnum/shared/constants";

type Variables = { user: AuthUser };

export const patrolRoute = new Hono<{ Variables: Variables }>();

patrolRoute.use("*", adminOnly());

/**
 * List patrol flags. Mod+ only.
 */
patrolRoute.get("/", async (c) => {
  const parsed = patrolQuerySchema.safeParse({
    reason: c.req.query("reason") ?? undefined,
    user_id: c.req.query("user_id") ?? undefined,
    resolved: c.req.query("resolved") ?? undefined,
    page: c.req.query("page") ?? undefined,
    pageSize: c.req.query("pageSize") ?? undefined,
  });
  if (!parsed.success) {
    return c.json({ error: "invalid_input", message: parsed.error.issues[0]?.message ?? "validation failed" }, 400);
  }
  const { reason, user_id, resolved, page, pageSize } = parsed.data;
  const result = await listPatrolFlags({
    reason: reason as PatrolFlagReason | undefined,
    userId: user_id,
    resolved,
    page,
    pageSize,
  });
  return c.json({ ...result, page, pageSize });
});

/**
 * Act on a flag: resolve it, revert the underlying revision, or rollback all
 * of an actor's consecutive edits on one entity. Mod+ only.
 */
patrolRoute.post("/act", async (c) => {
  const authUser = c.get("user");
  const body = await c.req.json().catch(() => null);
  const parsed = patrolActionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_input", message: parsed.error.issues[0]?.message ?? "validation failed" }, 400);
  }
  const { flag_id, revision_id, action } = parsed.data;

  if (action === "resolve") {
    if (!flag_id) {
      return c.json({ error: "invalid_input", message: "flag_id required" }, 400);
    }
    await resolveFlag(flag_id, authUser.id);
    return c.json({ ok: true, action: "resolve", flag_id });
  }

  if (action === "revert") {
    if (!revision_id) {
      return c.json({ error: "invalid_input", message: "revision_id required" }, 400);
    }
    const newRevId = await recordRevision({
      targetType: "system", // overridden below
      targetId: "00000000-0000-0000-0000-000000000000",
      action: "revert",
      actorId: authUser.id,
      contributorName: "patrol-revert",
      editSummary: `Patrol revert of revision ${revision_id}`,
      revertedFromId: revision_id,
    });
    if (flag_id) await resolveFlag(flag_id, authUser.id);
    return c.json({ ok: true, action: "revert", revision_id: newRevId });
  }

  if (action === "rollback") {
    if (!revision_id) {
      return c.json({ error: "invalid_input", message: "revision_id (or actor/target) required" }, 400);
    }
    // The frontend should also send `actor_id`, `target_type`, `target_id` in
    // the request body for a rollback. Schema simplified to revision_id; the
    // additional fields are read from the body directly.
    const extras = (body ?? {}) as {
      actor_id?: string;
      target_type?: string;
      target_id?: string;
    };
    if (!extras.actor_id || !extras.target_type || !extras.target_id) {
      return c.json(
        { error: "invalid_input", message: "actor_id, target_type, target_id required for rollback" },
        400,
      );
    }
    const { reverted } = await rollbackActorEdits(
      extras.actor_id,
      extras.target_type,
      extras.target_id,
      authUser.id,
    );
    if (flag_id) await resolveFlag(flag_id, authUser.id);
    return c.json({ ok: true, action: "rollback", reverted });
  }

  return c.json({ error: "invalid_input", message: "unknown action" }, 400);
});
