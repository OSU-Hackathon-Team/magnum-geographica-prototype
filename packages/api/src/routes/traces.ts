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
  getHeatmapPoints,
} from "../services/traces.js";
import {
  authRequired,
  optionalAuth,
  actorRequired,
  type AuthUser,
} from "../middleware/auth.js";
import { evaluateAction } from "../services/patrol.js";
import { recordRevision } from "../services/revisions.js";
import { tierFromKarma } from "../services/karma.js";
import { resolveContributorName, resolveActor } from "../services/identity.js";

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

/**
 * Heatmap — densified trace points for client-side canvas heatmap overlay.
 * GET /api/traces/heat?bbox=minLon,minLat,maxLon,maxLat&zoom=14
 * Returns a GeoJSON FeatureCollection of Point features sampled along
 * active trace geometries within the bounding box.
 */
tracesRoute.get("/heat", async (c) => {
  const bboxRaw = c.req.query("bbox");
  if (!bboxRaw) {
    return c.json({ error: "missing_bbox", message: "bbox=minLon,minLat,maxLon,maxLat required" }, 400);
  }
  const parts = bboxRaw.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    return c.json({ error: "invalid_bbox", message: "bbox must be minLon,minLat,maxLon,maxLat as numbers" }, 400);
  }
  const bbox = parts as [number, number, number, number];
  if (bbox[0] > bbox[2] || bbox[1] > bbox[3]) {
    return c.json({ error: "invalid_bbox", message: "min must be <= max" }, 400);
  }

  const zoomRaw = c.req.query("zoom");
  const zoom = zoomRaw ? Number(zoomRaw) : 12;
  if (!Number.isFinite(zoom) || zoom < 2 || zoom > 18) {
    return c.json({ error: "invalid_zoom", message: "zoom must be 2-18" }, 400);
  }

  // Segment length in meters: point every ~4 screen pixels at the given zoom.
  // Cap at 2000m (low zoom) and floor at 10m (very high zoom).
  const segLen = Math.max(10, Math.min(2000, Math.round((156543 / Math.pow(2, zoom)) * 4)));

  try {
    const result = await getHeatmapPoints(bbox, segLen);
    return c.json(result as unknown as Record<string, unknown>);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "heatmap query failed";
    console.error("heatmap error:", msg);
    return c.json({ error: "heatmap_query_failed", message: msg }, 500);
  }
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
 * system ids. IP users may submit traces (Wikipedia-style).
 */
tracesRoute.post("/", optionalAuth(), actorRequired(), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createTraceInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", message: parsed.error.issues[0]?.message ?? "validation failed" },
      400,
    );
  }
  const coords = parsed.data.geometry.coordinates;
  const actor = resolveActor(c);
  const { trace, taggedSystemIds } = await createTrace({
    coordinates: coords,
    source: parsed.data.source,
    contributorName: actor.contributorName,
    userId: actor.userId ?? null,
    recordedAt: parsed.data.recorded_at,
  });
  await recordRevision({
    targetType: "trace",
    targetId: trace.id,
    action: "create",
    actorId: actor.userId ?? null,
    contributorName: actor.contributorName,
    editSummary: `Recorded trace (${coords.length} pts)`,
    payloadAfter: { source: parsed.data.source, points: coords.length, tagged: taggedSystemIds },
  });
  return c.json({ trace, tagged_system_ids: taggedSystemIds }, 201);
});

/**
 * Import a GPX file or a GeoJSON LineString/MultiLineString.
 * Same response shape as POST /. IP users may import traces.
 */
tracesRoute.post("/import", optionalAuth(), actorRequired(), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = importTraceInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", message: parsed.error.issues[0]?.message ?? "validation failed" },
      400,
    );
  }
  const actor = resolveActor(c);
  const result = await importTrace(parsed.data.format, parsed.data.payload, {
    contributorName: actor.contributorName,
    userId: actor.userId ?? null,
    recordedAt: parsed.data.recorded_at,
  });
  await recordRevision({
    targetType: "trace",
    targetId: result.trace.id,
    action: "create",
    actorId: actor.userId ?? null,
    contributorName: actor.contributorName,
    editSummary: `Imported ${parsed.data.format.toUpperCase()} trace (${result.points} pts, ${result.lengthMeters.toFixed(0)}m)`,
    payloadAfter: {
      format: parsed.data.format,
      points: result.points,
      length_m: result.lengthMeters,
      tagged: result.taggedSystemIds,
    },
  });
  return c.json(
    {
      trace: result.trace,
      tagged_system_ids: result.taggedSystemIds,
      points: result.points,
      length_meters: result.lengthMeters,
    },
    201,
  );
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
 * segmenter config changes. IP users may re-cut their traces.
 */
tracesRoute.post("/:id/segments", optionalAuth(), actorRequired(), async (c) => {
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
 * - `trail_id: null` + `vote: +1` = "propose new trail"
 * - `trail_id: <uuid>` + `vote: +1` = "this segment IS part of <trail>"
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
  // Default vote to +1 (agree or propose-new); explicit -1 means "disagree".
  const vote = parsed.data.vote ?? 1;
  await db
    .execute(
      sql`INSERT INTO trace_segment_votes (segment_id, user_id, trail_id, vote, contributor_name)
         VALUES (${segmentId}, ${authUser.id}, ${parsed.data.trail_id}, ${vote}, ${resolveContributorName(c)})
         ON CONFLICT (segment_id, user_id)
         DO UPDATE SET trail_id = EXCLUDED.trail_id, vote = EXCLUDED.vote`,
    )
    .catch((e: unknown) => {
      throw new Error(
        `failed to record segment vote: ${e instanceof Error ? e.message : String(e)}`,
      );
    });
  return c.json({ ok: true, segment_id: segmentId, trail_id: parsed.data.trail_id, vote });
});

traceSegmentsRoute.get("/:id/votes", async (c) => {
  const segmentId = c.req.param("id");
  const rows = await db.execute<{
    trail_id: string | null;
    vote: number;
    count: number;
  }>(
    sql`SELECT trail_id, vote, COUNT(*)::int AS count
        FROM trace_segment_votes
        WHERE segment_id = ${segmentId}
        GROUP BY trail_id, vote`,
  );
  return c.json({
    segment_id: segmentId,
    votes: rows.rows,
    total: (rows.rows as Array<{ count: number }>).reduce((s, r) => s + r.count, 0),
  });
});
