/**
 * Trace service (§21.6).
 *
 * CRUD for `gps_traces` plus the import/record flows from the plan:
 *
 *   - import: parse a GPX or GeoJSON LineString, store as a MultiLineString
 *     trace, auto-tag by intersecting system boundaries.
 *   - record: store a multi-point trace collected by the mobile app's
 *     recorder. Same auto-tag step.
 *   - autoTag: run an `ST_Intersects(trace, system.boundary)` query for
 *     every system and persist matches in `trace_systems`.
 *   - cutSegments: simplify + split at turn vertices, persist to
 *     `gps_trace_segments` so synthesis can group them into trails.
 *   - voteTrace: thin wrapper over the existing votes service so a
 *     trace target_type reuses the same karma math.
 *
 * Trace `weight` is recomputed lazily on read; votes write to the
 * votes table and the `upvotes`/`downvotes` columns on gps_traces are
 * kept in sync by the votes service (which already supports arbitrary
 * target types).
 */
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  gpsTraces,
  gpsTraceSegments,
  systems,
  traceSystems,
  type GpsTrace,
  type GpsTraceSegment,
  type NewGpsTraceSegment,
} from "../db/schema.js";
import {
  parseGpx,
  parseGeoJsonTrace,
  simplifyRdp,
  splitAtTurns,
  traceLengthMeters,
  type TraceSource,
  TRACE_SIMPLIFY_TOLERANCE_M,
} from "@magnum/shared/constants";
import { castVote, retractVote } from "./votes.js";

export interface CreateTraceInput {
  coordinates: Array<[number, number]>;
  source: TraceSource;
  contributorName: string;
  userId: string | null;
  recordedAt?: string;
}

export interface TraceListOptions {
  systemId?: string;
  userId?: string;
  status?: "active" | "ignored" | "removed";
  page?: number;
  pageSize?: number;
}

/**
 * Insert a trace and auto-tag intersecting systems. Returns the
 * trace plus the system ids it intersects.
 */
export async function createTrace(
  input: CreateTraceInput,
): Promise<{ trace: GpsTrace; taggedSystemIds: string[] }> {
  if (input.coordinates.length < 2) {
    throw new Error("trace needs at least 2 coordinates");
  }
  // We store traces as MultiLineString (one ring) so the schema
  // matches the rest of the system. PostGIS's ST_MultiLineFromLineString
  // would do the same; we do it in JS to keep the route simple.
  const ring = input.coordinates.map(([lon, lat]) => `${lon} ${lat}`).join(", ");
  const wkt = `MULTILINESTRING((${ring}))`;

  const rows = await db
    .insert(gpsTraces)
    .values({
      userId: input.userId,
      contributorName: input.contributorName,
      geometry: sql`ST_MultiLineStringFromText(${wkt})`,
      source: input.source,
      recordedAt: input.recordedAt ? new Date(input.recordedAt) : new Date(),
    })
    .returning();
  const trace = rows[0];
  if (!trace) throw new Error("failed to insert trace");

  const tagged = await autoTagTrace(trace.id);
  return { trace, taggedSystemIds: tagged };
}

/**
 * §21.3.2 step 1 — auto-tag by intersecting system boundaries.
 * Runs a PostGIS ST_Intersects and inserts matches into trace_systems.
 * Safe to re-run; uses ON CONFLICT DO NOTHING.
 */
export async function autoTagTrace(traceId: string): Promise<string[]> {
  const matched = await db.execute<{ system_id: string }>(
    sql`SELECT id AS system_id
        FROM systems
        WHERE boundary IS NOT NULL
          AND ST_Intersects(boundary, (SELECT geometry FROM gps_traces WHERE id = ${traceId}))`,
  );
  const ids = (matched.rows as Array<{ system_id: string }>).map((r) => r.system_id);
  if (ids.length === 0) return [];
  await db
    .insert(traceSystems)
    .values(ids.map((systemId) => ({ traceId, systemId })))
    .onConflictDoNothing();
  return ids;
}

/**
 * Re-tag every trace. Cheap enough to call after a system boundary
 * change (e.g. a new system is created or an existing one is redrawn).
 */
export async function retagAllTraces(): Promise<{ processed: number; tagged: number }> {
  const traces = await db.select({ id: gpsTraces.id }).from(gpsTraces);
  let tagged = 0;
  for (const t of traces) {
    const ids = await autoTagTrace(t.id);
    tagged += ids.length;
  }
  return { processed: traces.length, tagged };
}

export async function getTraceById(id: string): Promise<GpsTrace | null> {
  const rows = await db.select().from(gpsTraces).where(eq(gpsTraces.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listTraces(
  opts: TraceListOptions = {},
): Promise<{ items: GpsTrace[]; total: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 20));
  const conditions = [];
  if (opts.userId) conditions.push(eq(gpsTraces.userId, opts.userId));
  if (opts.status) conditions.push(eq(gpsTraces.status, opts.status));
  const where = conditions.length ? and(...conditions) : undefined;

  // When systemId is provided we join through trace_systems.
  if (opts.systemId) {
    const joined = await db
      .select({ trace: gpsTraces })
      .from(gpsTraces)
      .innerJoin(traceSystems, eq(traceSystems.traceId, gpsTraces.id))
      .where(where ? and(where, eq(traceSystems.systemId, opts.systemId)) : eq(traceSystems.systemId, opts.systemId))
      .orderBy(desc(gpsTraces.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    return { items: joined.map((j) => j.trace), total: joined.length };
  }

  const [items, totalRow] = await Promise.all([
    db
      .select()
      .from(gpsTraces)
      .where(where)
      .orderBy(desc(gpsTraces.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(gpsTraces)
      .where(where),
  ]);
  return { items, total: Number(totalRow[0]?.count ?? 0) };
}

export async function deleteTrace(id: string): Promise<boolean> {
  // ON DELETE CASCADE removes trace_systems + segments + votes.
  const rows = await db.delete(gpsTraces).where(eq(gpsTraces.id, id)).returning({ id: gpsTraces.id });
  return rows.length > 0;
}

/**
 * Soft-delete (moderator remove). Keeps the geometry for audit but
 * flags the trace as removed so it's excluded from synthesis.
 */
export async function setTraceStatus(
  id: string,
  status: "active" | "ignored" | "removed",
): Promise<boolean> {
  const rows = await db
    .update(gpsTraces)
    .set({ status })
    .where(eq(gpsTraces.id, id))
    .returning({ id: gpsTraces.id });
  return rows.length > 0;
}

/* ------------------------------------------------------------------ */
/* Segments                                                            */
/* ------------------------------------------------------------------ */

export interface SegmentOptions {
  simplifyToleranceM?: number;
  turnAngleDeg?: number;
}

export async function cutTraceSegments(
  traceId: string,
  opts: SegmentOptions = {},
): Promise<number> {
  const trace = await getTraceById(traceId);
  if (!trace) throw new Error("trace not found");
  const coords = await extractTraceCoordinates(trace);
  if (coords.length < 2) return 0;
  const tolerance = opts.simplifyToleranceM ?? TRACE_SIMPLIFY_TOLERANCE_M;
  const angle = opts.turnAngleDeg ?? 25;

  const simplified = simplifyRdp(coords, tolerance);
  const rings = splitAtTurns(simplified, angle);
  if (rings.length === 0) return 0;

  // Wipe existing segments first (idempotent re-cut).
  await db.delete(gpsTraceSegments).where(eq(gpsTraceSegments.traceId, traceId));

  const values: NewGpsTraceSegment[] = rings
    .filter((r) => r.length >= 2)
    .map((r) => {
      const ring = r.map(([lon, lat]) => `${lon} ${lat}`).join(", ");
      return {
        traceId,
        geometry: sql`ST_MultiLineStringFromText(${sql.raw(`'MULTILINESTRING((${ring}))'` as never)})` as never,
      };
    });

  if (values.length === 0) return 0;
  await db.insert(gpsTraceSegments).values(values);
  return values.length;
}

export async function listSegmentsForTrace(traceId: string): Promise<GpsTraceSegment[]> {
  return db
    .select()
    .from(gpsTraceSegments)
    .where(eq(gpsTraceSegments.traceId, traceId))
    .orderBy(asc(gpsTraceSegments.createdAt));
}

/**
 * Extract the `[lon, lat]` vertices of a trace. Drizzle doesn't
 * unpack PostGIS for us, so we go through ST_DumpPoints + ST_X/Y.
 */
async function extractTraceCoordinates(trace: GpsTrace): Promise<Array<[number, number]>> {
  const rows = await db.execute<{ lon: number; lat: number; path: number[] }>(
    sql`SELECT ST_X((ST_DumpPoints(geometry)).geom)::float8 AS lon,
                ST_Y((ST_DumpPoints(geometry)).geom)::float8 AS lat,
                (ST_DumpPoints(geometry)).path AS path
         FROM gps_traces
         WHERE id = ${trace.id}
         ORDER BY path`,
  );
  return (rows.rows as Array<{ lon: number; lat: number }>).map((r) => [r.lon, r.lat]);
}

/* ------------------------------------------------------------------ */
/* Voting (re-export the votes service)                                */
/* ------------------------------------------------------------------ */

export interface TraceVoteResult {
  upvotes: number;
  downvotes: number;
  net: number;
  hidden: boolean;
  myVote: -1 | 0 | 1;
  karmaAwarded: number;
}

export async function voteOnTrace(
  traceId: string,
  value: 1 | -1,
  actor: {
    userId: string | null;
    voterKarma: number;
    voterTier: "new" | "established" | "trusted" | "moderator";
    contributorName: string;
  },
): Promise<TraceVoteResult> {
  const result = await castVote({
    targetType: "trace",
    targetId: traceId,
    value,
    userId: actor.userId,
    voterKarma: actor.voterKarma,
    voterTier: actor.voterTier,
    contributorName: actor.contributorName,
  });
  // Mirror the tally on the trace row so list views don't need to
  // join the votes table on every query.
  await db
    .update(gpsTraces)
    .set({ upvotes: result.upvotes, downvotes: result.downvotes })
    .where(eq(gpsTraces.id, traceId));
  return result;
}

export async function retractTraceVote(
  traceId: string,
  userId: string,
): Promise<TraceVoteResult> {
  const result = await retractVote("trace", traceId, userId);
  await db
    .update(gpsTraces)
    .set({ upvotes: result.upvotes, downvotes: result.downvotes })
    .where(eq(gpsTraces.id, traceId));
  return result;
}

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

export interface ImportResult {
  trace: GpsTrace;
  taggedSystemIds: string[];
  points: number;
  lengthMeters: number;
}

/**
 * Parse a GPX string or GeoJSON object into a trace. The route layer
 * normalizes the body into `{ format, payload }`; this does the
 * parsing, then defers to `createTrace` for storage + auto-tag.
 */
export async function importTrace(
  format: "gpx" | "geojson",
  payload: string | Record<string, unknown>,
  meta: { contributorName: string; userId: string | null; recordedAt?: string },
): Promise<ImportResult> {
  let coords: Array<[number, number]>;
  if (format === "gpx") {
    if (typeof payload !== "string") {
      throw new Error("gpx import requires a string payload");
    }
    coords = parseGpx(payload);
  } else {
    coords = parseGeoJsonTrace(payload);
  }
  const { trace, taggedSystemIds } = await createTrace({
    coordinates: coords,
    source: "import",
    contributorName: meta.contributorName,
    userId: meta.userId,
    recordedAt: meta.recordedAt,
  });
  return {
    trace,
    taggedSystemIds,
    points: coords.length,
    lengthMeters: traceLengthMeters(coords),
  };
}
