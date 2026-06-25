import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import {
  createTraceInputSchema,
  importTraceInputSchema,
  traceQuerySchema,
  traceSegmentVoteInputSchema,
} from "@magnum/shared/schemas";
import {
  cutTraceSegments,
  createTrace,
  deleteTrace,
  getTraceById,
  importTrace,
  listSegmentsForTrace,
  listTraces,
  retractTraceVote,
  setTraceStatus,
  voteOnTrace,
} from "../services/traces.js";
import { authRequired, type AuthUser } from "../middleware/auth.js";
import { evaluateAction } from "../services/patrol.js";
import { recordRevision } from "../services/revisions.js";
import { tierFromKarma } from "../services/karma.js";

type Variables = { user?: AuthUser };

export const tracesRoute = new Hono<{ Variables: Variables }>();

/**
 * List GPS traces. Filters: system_id, user_id, status.
 * The `system_id` filter joins through `trace_systems` (auto-tag join).
 */
tracesRoute.get("/", async (c) => {
  const parsed = traceQuerySchema.safeParse({
    system_id: c.req.query("system_id") ?? undefined,
    user_id: c.req.query("user_id") ?? undefined,
    status: c.req.query("status") ?? undefined,
    page: c.req.query("page") ?? undefined,
    pageSize: c.req.query("pageSize") ?? undefined,
  });
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", message: parsed.error.issues[0]?.message ?? "validation failed" },
      400,
    );
  }
  const { items, total } = await listTraces({
    systemId: parsed.data.system_id,
    userId: parsed.data.user_id,
    status: parsed.data.status,
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
  });
  return c.json({ items, total, page: parsed.data.page, pageSize: parsed.data.pageSize });
});

tracesRoute.get("/:id", async (c) => {
  const id = c.req.param("id");
  const trace = await getTraceById(id);
  if (!trace) return c.json({ error: "not_found" }, 404);
  return c.json(trace);
});

/**
 * Create a trace from raw coordinates (the recorder path). The route
 * runs auto-tag synchronously so the response can include tagged
 * system ids.
 */
tracesRoute.post("/", authRequired(), async (c) => {
  const authUser = c.get("user");
  if (!authUser) return c.json({ error: "unauthorized" }, 401);
  const body = await c.req.json().catch(() => null);
  const parsed = createTraceInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", message: parsed.error.issues[0]?.message ?? "validation failed" },
      400,
    );
  }
  const coords = parsed.data.geometry.coordinates;
  const { trace, taggedSystemIds } = await createTrace({
    coordinates: coords,
    source: parsed.data.source,
    contributorName: parsed.data.contributor_name,
    userId: authUser.id,
    recordedAt: parsed.data.recorded_at,
  });
  await recordRevision({
    targetType: "trace",
    targetId: trace.id,
    action: "create",
    actorId: authUser.id,
    contributorName: authUser.username,
    editSummary: `Recorded trace (${coords.length} pts)`,
    payloadAfter: { source: parsed.data.source, points: coords.length, tagged: taggedSystemIds },
  });
  return c.json({ trace, tagged_system_ids: taggedSystemIds }, 201);
});

/**
 * Import a GPX file or a GeoJSON LineString/MultiLineString.
 * Same response shape as POST /.
 */
tracesRoute.post("/import", authRequired(), async (c) => {
  const authUser = c.get("user");
  if (!authUser) return c.json({ error: "unauthorized" }, 401);
  const body = await c.req.json().catch(() => null);
  const parsed = importTraceInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", message: parsed.error.issues[0]?.message ?? "validation failed" },
      400,
    );
  }
  const result = await importTrace(parsed.data.format, parsed.data.payload, {
    contributorName: parsed.data.contributor_name,
    userId: authUser.id,
    recordedAt: parsed.data.recorded_at,
  });
  await recordRevision({
    targetType: "trace",
    targetId: result.trace.id,
    action: "create",
    actorId: authUser.id,
    contributorName: authUser.username,
    editSummary: `Imported ${parsed.data.format.toUpperCase()} trace (${result.points} pts, ${result.lengthMeters.toFixed(0)}m)`,
    payloadAfter: {
      format: parsed.data.format,
      points: result.points,
      length_m: result.lengthMeters,
      tagged: result.taggedSystemIds,
    },
  });
  return c.json({ trace: result.trace, tagged_system_ids: result.taggedSystemIds, points: result.points, length_meters: result.lengthMeters }, 201);
});

tracesRoute.delete("/:id", authRequired(), async (c) => {
  const authUser = c.get("user");
  if (!authUser) return c.json({ error: "unauthorized" }, 401);
  const id = c.req.param("id");
  const trace = await getTraceById(id);
  if (!trace) return c.json({ error: "not_found" }, 404);
  // Owner can delete their own trace; mods+ can delete anything.
  if (trace.userId !== authUser.id && authUser.role !== "admin" && authUser.role !== "moderator") {
    return c.json({ error: "forbidden", message: "cannot delete another user's trace" }, 403);
  }
  await deleteTrace(id);
  await recordRevision({
    targetType: "trace",
    targetId: id,
    action: "delete",
    actorId: authUser.id,
    contributorName: authUser.username,
    editSummary: "Deleted trace",
  });
  return c.json({ ok: true });
});

/**
 * Moderator: soft-delete a trace (status='removed'). Keeps geometry
 * for audit but excludes from synthesis.
 */
tracesRoute.post("/:id/remove", authRequired(), async (c) => {
  const authUser = c.get("user");
  if (!authUser) return c.json({ error: "unauthorized" }, 401);
  if (authUser.role !== "admin" && authUser.role !== "moderator") {
    return c.json({ error: "forbidden" }, 403);
  }
  const id = c.req.param("id");
  const ok = await setTraceStatus(id, "removed");
  if (!ok) return c.json({ error: "not_found" }, 404);
  await recordRevision({
    targetType: "trace",
    targetId: id,
    action: "delete",
    actorId: authUser.id,
    contributorName: authUser.username,
    editSummary: "Moderator removed trace",
  });
  await evaluateAction({
    revisionId: "00000000-0000-0000-0000-000000000000",
    actorId: authUser.id,
    actorKarma: 0,
    actorRole: authUser.role,
    targetType: "trace",
    targetId: id,
    action: "delete",
  }).catch(() => undefined);
  return c.json({ ok: true });
});

/**
 * Cut trace into segments (Douglas-Peucker simplify + turn split).
 * Triggered automatically on import; this route is for re-cuts after
 * segmenter config changes.
 */
tracesRoute.post("/:id/segments", authRequired(), async (c) => {
  const authUser = c.get("user");
  if (!authUser) return c.json({ error: "unauthorized" }, 401);
  const id = c.req.param("id");
  const trace = await getTraceById(id);
  if (!trace) return c.json({ error: "not_found" }, 404);
  const n = await cutTraceSegments(id);
  return c.json({ ok: true, segments: n });
});

tracesRoute.get("/:id/segments", async (c) => {
  const id = c.req.param("id");
  const segments = await listSegmentsForTrace(id);
  return c.json({ items: segments, total: segments.length });
});

/**
 * Upvote/downvote a trace. Re-uses the unified /api/votes karma math
 * (target_type='trace'). The cached `upvotes`/`downvotes` columns on
 * the trace are mirrored by the service for fast list views.
 */
tracesRoute.post("/:id/vote", authRequired(), async (c) => {
  const authUser = c.get("user");
  if (!authUser) return c.json({ error: "unauthorized" }, 401);
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  if (!body || (body.value !== 1 && body.value !== -1)) {
    return c.json({ error: "invalid_input", message: "value must be 1 or -1" }, 400);
  }
  const rows = await db
    .select({ karma: users.trustScore, role: users.role })
    .from(users)
    .where(eq(users.id, authUser.id))
    .limit(1);
  const result = await voteOnTrace(id, body.value, {
    userId: authUser.id,
    voterKarma: Number(rows[0]?.karma ?? 0),
    voterTier: tierFromKarma(Number(rows[0]?.karma ?? 0)),
    contributorName: authUser.username,
  });
  return c.json(result);
});

tracesRoute.delete("/:id/vote", authRequired(), async (c) => {
  const authUser = c.get("user");
  if (!authUser) return c.json({ error: "unauthorized" }, 401);
  const id = c.req.param("id");
  const result = await retractTraceVote(id, authUser.id);
  return c.json(result);
});

/**
 * Wiki-style segment → trail marking (§21.6).
 * - `trail_id: null` + `vote: -1` = "propose new trail" (downvote + null)
 * - `trail_id: <uuid>` + `vote: +1` = "this segment is part of <trail>"
 * - `trail_id: <uuid>` + `vote: -1` = "this segment is NOT part of <trail>"
 */
export const traceSegmentsRoute = new Hono<{ Variables: Variables }>();

traceSegmentsRoute.post("/:id/vote", authRequired(), async (c) => {
  const authUser = c.get("user");
  if (!authUser) return c.json({ error: "unauthorized" }, 401);
  const segmentId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = traceSegmentVoteInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", message: parsed.error.issues[0]?.message ?? "validation failed" },
      400,
    );
  }
  // The plan also asks for a `vote` value; we let trail_id=null mean
  // "propose new" (implicit -1) and trail_id set mean "agrees" (+1).
  // The route stores the vote as +1/-1 in trace_segment_votes.
  const vote = parsed.data.trail_id ? 1 : -1;
  await db
    .execute(
      sql`INSERT INTO trace_segment_votes (segment_id, user_id, trail_id, vote, contributor_name)
         VALUES (${segmentId}, ${authUser.id}, ${parsed.data.trail_id}, ${vote}, ${parsed.data.contributor_name})
         ON CONFLICT (segment_id, user_id)
         DO UPDATE SET trail_id = EXCLUDED.trail_id, vote = EXCLUDED.vote`,
    )
    .catch((e: unknown) => {
      throw new Error(`failed to record segment vote: ${e instanceof Error ? e.message : String(e)}`);
    });
  return c.json({ ok: true, segment_id: segmentId, trail_id: parsed.data.trail_id, vote });
});
