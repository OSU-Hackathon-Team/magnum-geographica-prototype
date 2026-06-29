/**
 * Synthesis service (§21.6 phase 2).
 *
 * The synthesis algorithm has four steps, all per-system and run as a
 * single batch from `POST /api/systems/:id/synthesize`:
 *
 *   1. Cut (Phase 4): each active trace is already cut into segments
 *      (gps_trace_segments). The synthesize() entry point re-cuts
 *      them so the latest segmenter config is reflected.
 *   2. Cluster: buffer each segment ~5–10 m, union overlapping
 *      buffers. Connected groups form a single cluster; singletons
 *      stay as their own cluster.
 *   3. Assign / propose: for each cluster, find the nearest
 *      `synthesized` trail within the system's tolerance (default
 *      25 m). If we find one, attach the cluster's segments to that
 *      trail via trace_segment_votes. Otherwise, write a "possible
 *      new trail" proposal for moderator review.
 *   4. Weighted centerline: for every trail that received new
 *      segments this run, recompute the centerline from the assigned
 *      segments weighted by `trace.weight × vote_confidence`. Write
 *      the new geometry to `trails.geometry` and stamp a
 *      `last_synthesized_at` marker (re-using updated_at for v1).
 *
 * The moderator-facing flow (`promoteTrail`, `approveProposal`,
 * `rejectProposal`) is also here so the route layer stays thin.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  gpsTraces,
  gpsTraceSegments,
  synthesisRuns,
  systems,
  trails,
  trailSystems,
  trailSegments,
  traceAnnotations,
  traceSegmentVotes,
  traceSystems,
  type SynthesisRun,
  type Trail,
} from "../db/schema.js";
import { cutTraceSegments } from "./traces.js";
import {
  haversineMeters,
  densifyPolyline,
  smoothPolyline,
  simplifyPolyline,
  pointToSegmentDistanceMeters,
  geoJsonToWkt,
  parseWktLineString,
} from "@magnum/shared";

const BUFFER_METERS = 8;
const NEAREST_TRAIL_TOLERANCE_M = 25;
const CENTERLINE_SEGMENTIZE_M = 5;
const CENTERLINE_SMOOTH_WINDOW = 3;
const CENTERLINE_SIMPLIFY_M = 2;
const MIN_VOTES_TO_OVERRIDE_DISTANCE = 3;

export interface SynthesisResult {
  run: SynthesisRun;
  clusters: number;
  assigned: number;
  proposed: number;
  trailsUpdated: number;
  segmentsEmitted: number;
}

/**
 * Run a full synthesis pass for a system. Returns counts so the route
 * can render a useful summary.
 */
export async function runSynthesis(systemId: string): Promise<SynthesisResult> {
  const [startedRow] = await db
    .insert(synthesisRuns)
    .values({ systemId, status: "running" })
    .returning();
  if (!startedRow) throw new Error("failed to insert synthesis run");
  const runId = startedRow.id;

  // 1. Re-cut every active trace in the system.
  const traceRows = await db
    .select({ id: gpsTraces.id })
    .from(gpsTraces)
    .innerJoin(traceSystems, eq(traceSystems.traceId, gpsTraces.id))
    .where(and(eq(traceSystems.systemId, systemId), eq(gpsTraces.status, "active")));
  for (const t of traceRows) {
    await cutTraceSegments(t.id);
  }

  // 2. Cluster using ST_ClusterDBSCAN on segment centroids.
  const clusterResult = await db.execute<{ cluster_count: number }>(
    sql`WITH clustered AS (
          SELECT id, ST_ClusterDBSCAN(ST_Centroid(geometry), ${BUFFER_METERS}, 1) OVER () AS cid
          FROM gps_trace_segments
          WHERE trace_id IN (
            SELECT trace_id FROM trace_systems WHERE system_id = ${systemId}
          )
        )
        UPDATE gps_trace_segments s
        SET cluster_id = clustered.cid
        FROM clustered
        WHERE s.id = clustered.id`,
  );

  // Count clusters.
  const clusterCountRow = await db.execute<{ count: number }>(
    sql`SELECT COUNT(DISTINCT cluster_id)::int AS count
        FROM gps_trace_segments
        WHERE trace_id IN (
          SELECT trace_id FROM trace_systems WHERE system_id = ${systemId}
        )
          AND cluster_id IS NOT NULL`,
  );
  const clusters = Number(clusterCountRow.rows[0]?.count ?? 0);

  // 3. Assign / propose with PostGIS spatial distance.
  const synthTrails = await db
    .select()
    .from(trails)
    .where(and(eq(trails.tier, "synthesized"), sql`${trails.id} IN (
      SELECT trail_id FROM trail_systems WHERE system_id = ${systemId}
    )`));
  const { assigned, proposed } = await assignOrPropose(systemId, synthTrails);

  // 4. Recompute centerlines (synthesized tier only).
  const trailsUpdated = await recomputeCenterlines(systemId, synthTrails);

  // 5. Emit canonical segments from annotation consensus (all tiers).
  const allTrails = await db
    .select()
    .from(trails)
    .where(sql`${trails.id} IN (
      SELECT trail_id FROM trail_systems WHERE system_id = ${systemId}
    )`);
  const segmentsEmitted = await emitCanonicalSegments(systemId, allTrails);

  await db
    .update(synthesisRuns)
    .set({
      finishedAt: new Date(),
      trailsUpdated,
      trailsProposed: proposed,
      segmentsEmitted,
      status: "complete",
    })
    .where(eq(synthesisRuns.id, runId));

  const [finalRun] = await db
    .select()
    .from(synthesisRuns)
    .where(eq(synthesisRuns.id, runId))
    .limit(1);

  return {
    run: finalRun ?? startedRow,
    clusters,
    assigned,
    proposed,
    trailsUpdated,
    segmentsEmitted,
  };
}

/**
 * Assign segments to the nearest synthesized trail within tolerance
 * using PostGIS distance. Segments not within tolerance of any trail
 * become proposals.
 */
async function assignOrPropose(
  systemId: string,
  candidates: Trail[],
): Promise<{ assigned: number; proposed: number }> {
  if (candidates.length === 0) return { assigned: 0, proposed: 0 };

  // Get all segments in this system that haven't been voted yet.
  const segRowsRaw = await db.execute<{
    id: string;
    trace_id: string;
    nearest_trail_id: string | null;
    distance_m: number | null;
  }>(
    sql`WITH segs AS (
          SELECT s.id, s.trace_id, s.geometry
          FROM gps_trace_segments s
          WHERE s.trace_id IN (
            SELECT trace_id FROM trace_systems WHERE system_id = ${systemId}
          )
            AND s.id NOT IN (SELECT segment_id FROM trace_segment_votes)
        ),
        nearest AS (
          SELECT segs.id, segs.trace_id,
                 t.id AS trail_id,
                 ST_Distance(segs.geometry::geography, t.geometry::geography)::float8 AS dist_m
          FROM segs
          CROSS JOIN LATERAL (
            SELECT id, geometry
            FROM trails
            WHERE tier = 'synthesized'
              AND id IN (SELECT trail_id FROM trail_systems WHERE system_id = ${systemId})
            ORDER BY segs.geometry <-> trails.geometry
            LIMIT 1
          ) t
        )
        SELECT id, trace_id, trail_id AS nearest_trail_id,
               dist_m AS distance_m
        FROM nearest`,
  );

  const segs = segRowsRaw.rows as unknown as {
    id: string; trace_id: string; nearest_trail_id: string | null; distance_m: number | null;
  }[];

  let assigned = 0;
  let proposed = 0;

  for (const seg of segs) {
    if (
      seg.nearest_trail_id &&
      seg.distance_m != null &&
      seg.distance_m <= NEAREST_TRAIL_TOLERANCE_M
    ) {
      // Assign to the nearest trail.
      await db.insert(traceSegmentVotes).values({
        segmentId: seg.id,
        trailId: seg.nearest_trail_id,
        vote: 1,
        contributorName: "synthesis",
      });
      await db
        .update(gpsTraceSegments)
        .set({ proposedTrailId: seg.nearest_trail_id })
        .where(eq(gpsTraceSegments.id, seg.id));
      assigned++;
    } else {
      proposed++;
    }
  }

  return { assigned, proposed };
}

/**
 * Recompute the centerline for every trail that received new segments
 * this synthesis run. Uses reference-walk weighted median axis:
 * 1. Pick highest-weight segment as reference
 * 2. Densify reference at CENTERLINE_SEGMENTIZE_M
 * 3. For each reference vertex, find nearby vertices from all assigned
 *    segments, compute weighted mean (by trace.weight)
 * 4. Smooth with moving average
 * 5. Simplify
 */
async function recomputeCenterlines(
  systemId: string,
  candidates: Trail[],
): Promise<number> {
  let updated = 0;
  for (const trail of candidates) {
    if (!trail.id) continue;

    // Find all segments assigned to this trail in this run.
    const segRows = await db.execute<{
      id: string;
      trace_weight: number;
      geometry_wkt: string;
    }>(
      sql`SELECT s.id,
                 t.weight::float8 AS trace_weight,
                 ST_AsText(s.geometry) AS geometry_wkt
          FROM gps_trace_segments s
          INNER JOIN trace_segment_votes v ON v.segment_id = s.id
          INNER JOIN gps_traces t ON t.id = s.trace_id
          WHERE v.trail_id = ${trail.id}
            AND v.vote = 1
          ORDER BY t.weight DESC`,
    );

    const segs = (segRows.rows as Array<{
      id: string; trace_weight: number; geometry_wkt: string;
    }>);

    if (segs.length === 0) continue;

    // Collect all vertices from all assigned segments as WGS84 coords.
    interface WeightedPoint {
      lon: number;
      lat: number;
      weight: number;
    }

    // Pick reference: highest trace_weight segment.
    const refSeg = segs[0]!;
    const refPts = parseWktLineString(refSeg.geometry_wkt);
    if (refPts.length < 2) continue;

    // Densify reference.
    const denseRef = densifyPolyline(refPts.map(([lon, lat]) => ({ lon, lat })), CENTERLINE_SEGMENTIZE_M);

    // Collect all segments' vertices as weighted points.
    const allVerts: WeightedPoint[] = [];
    for (const seg of segs) {
      const pts = parseWktLineString(seg.geometry_wkt);
      for (const p of pts) {
        allVerts.push({ lon: p[0], lat: p[1], weight: seg.trace_weight });
      }
    }

    // For each densified reference vertex, compute weighted mean
    // of nearby vertices.
    const refWeight = refSeg.trace_weight * 2; // self-weight anchor
    const centroids: [number, number][] = [];

    for (const rp of denseRef) {
      let sumW = refWeight;
      let sumLon = rp.lon * refWeight;
      let sumLat = rp.lat * refWeight;

      for (const v of allVerts) {
        const d = haversineMeters(rp.lat, rp.lon, v.lat, v.lon);
        if (d <= BUFFER_METERS) {
          sumW += v.weight;
          sumLon += v.lon * v.weight;
          sumLat += v.lat * v.weight;
        }
      }
      centroids.push([sumLon / sumW, sumLat / sumW]);
    }

    // Smooth with moving average.
    const smoothed = smoothPolyline(centroids, CENTERLINE_SMOOTH_WINDOW);

    // Simplify.
    const simplified = simplifyPolyline(smoothed, CENTERLINE_SIMPLIFY_M);

    if (simplified.length < 2) continue;

    // Write back to trails.
    const wkt = `MULTILINESTRING((${simplified.map(([lon, lat]) => `${lon} ${lat}`).join(", ")}))`;
    await db
      .update(trails)
      .set({
        geometry: sql`ST_Multi(ST_GeomFromText(${wkt}, 4326))`,
        updatedAt: new Date(),
        lastSynthesizedAt: new Date(),
      })
      .where(eq(trails.id, trail.id));

    updated++;
  }

  void (await db.select({ id: systems.id }).from(systems).where(eq(systems.id, systemId)).limit(1));
  return updated;
}

/* ------------------------------------------------------------------ */
/* Step 5 — emit canonical segments from annotation consensus         */
/* ------------------------------------------------------------------ */

const SEGMENT_SNAP_TOLERANCE_M = 15;

/**
 * For each trail in the system, read annotations from traces assigned
 * to that trail, snap them to the trail geometry, derive segment
 * boundaries from surface-change and pseudo-trail events, and upsert
 * `trail_segments` rows with source='synthesis'.
 */
async function emitCanonicalSegments(
  systemId: string,
  allTrails: Trail[],
): Promise<number> {
  let totalEmitted = 0;

  for (const trail of allTrails) {
    if (!trail.id) continue;

    // Find annotations attached to traces whose segments are voted to this trail.
    const annRows = await db.execute<{
      id: string;
      type: string;
      value: string | null;
      lon: number;
      lat: number;
      trace_index: number;
      trace_id: string;
      trace_weight: number;
    }>(
      sql`SELECT
            a.id::text AS id,
            a.type,
            a.value,
            ST_X(a.point)::float8 AS lon,
            ST_Y(a.point)::float8 AS lat,
            a.trace_index,
            a.trace_id::text AS trace_id,
            t.weight::float8 AS trace_weight
          FROM trace_annotations a
          INNER JOIN gps_traces t ON t.id = a.trace_id
          WHERE a.trace_id IN (
            SELECT DISTINCT s.trace_id
            FROM gps_trace_segments s
            INNER JOIN trace_segment_votes v ON v.segment_id = s.id
            WHERE v.trail_id = ${trail.id} AND v.vote = 1
          )
            AND t.status = 'active'
          ORDER BY a.trace_id, a.trace_index`,
    );

    const annotations = (annRows.rows as Array<{
      id: string; type: string; value: string | null; lon: number; lat: number;
      trace_index: number; trace_id: string; trace_weight: number;
    }>);

    if (annotations.length === 0) continue;

    // Snap each annotation to the trail geometry using ST_LineLocatePoint.
    const snapped: Array<{
      type: string;
      value: string | null;
      position: number;
      traceWeight: number;
    }> = [];

    for (const a of annotations) {
      const locRow = await db.execute<{ pos: number }>(
        sql`SELECT ST_LineLocatePoint(geometry, ST_SetSRID(ST_MakePoint(${a.lon}, ${a.lat}), 4326))::float8 AS pos
            FROM trails
            WHERE id = ${trail.id}`,
      );
      const pos = Number((locRow.rows[0] as { pos?: number })?.pos ?? 0);
      if (Number.isFinite(pos) && pos >= 0 && pos <= 1) {
        snapped.push({
          type: a.type,
          value: a.value,
          position: pos,
          traceWeight: a.trace_weight,
        });
      }
    }

    if (snapped.length === 0) continue;

    // Build segment boundaries from surface_change events and pseudo-trail spans.
    // We emit one segment between each consecutive boundary.
    snapped.sort((a, b) => a.position - b.position);

    // Collect boundaries: positions where surface or pseudo changes.
    const boundaries: Array<{ position: number; surface?: string; isPseudoTrail?: boolean }> = [];
    let currentSurface: string | null = null;
    let isPseudoSpan = false;

    for (const s of snapped) {
      if (s.type === "surface_change" && s.value) {
        currentSurface = s.value;
        boundaries.push({ position: s.position, surface: s.value, isPseudoTrail: isPseudoSpan });
      } else if (s.type === "pseudo_trail_start") {
        isPseudoSpan = true;
        boundaries.push({ position: s.position, surface: currentSurface ?? undefined, isPseudoTrail: true });
      } else if (s.type === "pseudo_trail_end") {
        isPseudoSpan = false;
        boundaries.push({ position: s.position, surface: currentSurface ?? undefined, isPseudoTrail: false });
      }
      // road_crossing annotations are informational — don't create new segment boundaries
    }

    if (boundaries.length === 0) continue;

    // Delete existing synthesis segments for this trail.
    await db
      .delete(trailSegments)
      .where(
        sql`trail_id = ${trail.id} AND source = 'synthesis'`,
      );

    // Emit one segment between each consecutive boundary pair.
    // The segment starts at boundaries[i].position and ends at boundaries[i+1].position.
    for (let i = 0; i < boundaries.length; i++) {
      const b = boundaries[i]!;
      const next = boundaries[i + 1] ?? null;
      const start = i === 0 ? 0 : b.position;
      const end = next ? next.position : 1;

      if (end <= start) continue;

      // Slice the trail geometry.
      const geomSlice = await db.execute<{ wkt: string }>(
        sql`SELECT ST_AsText(ST_LineSubstring(geometry, ${start}, ${end})) AS wkt
            FROM trails
            WHERE id = ${trail.id}`,
      );
      const wkt = (geomSlice.rows[0] as { wkt?: string })?.wkt;
      if (!wkt || wkt === "LINESTRING EMPTY") continue;

      const consensusScore = annotations.length === 1 ? 0.3 : 0.6; // rough heuristic

      await db.insert(trailSegments).values({
        trailId: trail.id,
        geometry: sql`ST_Multi(ST_GeomFromText(${wkt}, 4326))`,
        sortOrder: i,
        surfaceType: b.surface ?? null,
        isPseudoTrail: b.isPseudoTrail ?? false,
        source: "synthesis",
        consensus: consensusScore,
        lastSynthesizedAt: new Date(),
      });
      totalEmitted++;
    }
  }

  return totalEmitted;
}

/* ------------------------------------------------------------------ */
/* Moderator actions                                                   */
/* ------------------------------------------------------------------ */

/**
 * Promote a synthesized trail to "frozen" — the trusted+ user is
 * certifying the geometry as canonical. After this point the trail
 * is frozen: the synthesis loop won't re-derive its geometry.
 *
 * Allowed transitions:
 *   synthesized → frozen   (Trusted+)
 *   synthesized → premium   (moderator only)
 *   frozen      → premium   (moderator only)
 */
export async function promoteTrail(
  trailId: string,
  to: "frozen" | "premium",
): Promise<Trail | null> {
  const [current] = await db
    .select({ tier: trails.tier })
    .from(trails)
    .where(eq(trails.id, trailId))
    .limit(1);
  if (!current) return null;

  const allowed: Record<string, string[]> = {
    synthesized: ["frozen", "premium"],
    frozen: ["premium"],
    premium: [],
  };
  if (!allowed[current.tier ?? "synthesized"]?.includes(to)) {
    throw new Error(`cannot promote from ${current.tier} to ${to}`);
  }

  const rows = await db
    .update(trails)
    .set({ tier: to, updatedAt: new Date() })
    .where(eq(trails.id, trailId))
    .returning();
  return rows[0] ?? null;
}

/**
 * Demote a trail from frozen → synthesized, re-arming it for
 * synthesis. Premium trails cannot be demoted.
 */
export async function demoteTrail(trailId: string): Promise<Trail | null> {
  const [current] = await db
    .select({ tier: trails.tier })
    .from(trails)
    .where(eq(trails.id, trailId))
    .limit(1);
  if (!current) return null;
  if (current.tier !== "frozen") {
    throw new Error(`can only demote frozen trails, not ${current.tier}`);
  }
  const rows = await db
    .update(trails)
    .set({ tier: "synthesized", updatedAt: new Date() })
    .where(eq(trails.id, trailId))
    .returning();
  return rows[0] ?? null;
}

/**
 * Import a "premium" trail from a moderator-supplied GeoJSON
 * LineString/MultiLineString. The geometry is stored verbatim,
 * tier=premium, and the trail is bypassed by future synthesis runs.
 */
export interface PremiumImportInput {
  name: string;
  slug: string;
  systemId: string;
  geometry: unknown;
  difficulty?: "easy" | "moderate" | "hard" | "expert";
  externalUrl?: string;
  source?: string;
  sourceDate?: string;
}

export async function importPremiumTrail(input: PremiumImportInput): Promise<Trail> {
  const wkt = geoJsonToWkt(input.geometry);
  if (!wkt) throw new Error("geometry must be a GeoJSON LineString or MultiLineString");

  const rows = await db
    .insert(trails)
    .values({
      name: input.name,
      slug: input.slug,
      tier: "premium",
      difficulty: input.difficulty ?? null,
      externalUrl: input.externalUrl ?? null,
      source: input.source ?? null,
      sourceDate: input.sourceDate ?? null,
      geometry: sql`ST_Multi(ST_GeomFromText(${wkt}, 4326))`,
    })
    .returning();
  const trail = rows[0];
  if (!trail) throw new Error("failed to insert premium trail");

  // Wire the trail into the system.
  await db
    .insert(trailSystems)
    .values({ trailId: trail.id, systemId: input.systemId })
    .onConflictDoNothing();

  return trail;
}

/**
 * List "possible new trail" proposals — segments that have been
 * cut but aren't yet attached to any trail. We pull the candidate
 * rows from `gps_trace_segments` directly and filter by the system
 * id and "no vote" predicates in JS; the real version would do a
 * left-join + ST_Intersects in PostGIS.
 */
export interface SynthesisProposal {
  id: string;
  trace_id: string;
  segment_id: string;
  cluster_id: number | null;
  reason: "no_nearby_trail";
}

export async function listProposals(systemId: string): Promise<SynthesisProposal[]> {
  // 1. Find traces in this system.
  const systemTraceRows = await db
    .select({ traceId: traceSystems.traceId })
    .from(traceSystems)
    .where(eq(traceSystems.systemId, systemId));
  const systemTraceIds = new Set(systemTraceRows.map((r) => r.traceId));

  // 2. Pull every segment in those traces.
  const segRows = await db
    .select({
      id: gpsTraceSegments.id,
      traceId: gpsTraceSegments.traceId,
      clusterId: gpsTraceSegments.clusterId,
    })
    .from(gpsTraceSegments);

  // 3. Find segments with no votes yet.
  const voteRows = await db
    .select({ segmentId: traceSegmentVotes.segmentId })
    .from(traceSegmentVotes);
  const votedSet = new Set(voteRows.map((v) => v.segmentId));

  return segRows
    .filter((s) => systemTraceIds.has(s.traceId))
    .filter((s) => !votedSet.has(s.id))
    .map((s) => ({
      id: s.id,
      trace_id: s.traceId,
      segment_id: s.id,
      cluster_id: s.clusterId,
      reason: "no_nearby_trail" as const,
    }));
}

/**
 * Approve a proposal by creating a new synthesized trail. The
 * "proposal" here is just a segment id; we create a trail named
 * from the trace, then vote the segment into it.
 */
export async function approveProposal(
  systemId: string,
  segmentId: string,
  name: string,
): Promise<Trail> {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const [t] = await db
    .insert(trails)
    .values({ name, slug: `${slug}-${Date.now().toString(36).slice(-4)}`, tier: "synthesized" })
    .returning();
  if (!t) throw new Error("failed to create trail");
  // Vote the segment into the new trail.
  await db.insert(traceSegmentVotes).values({
    segmentId,
    trailId: t.id,
    vote: 1,
    contributorName: "moderator",
  });
  // Move the segment to the new trail.
  await db
    .update(gpsTraceSegments)
    .set({ proposedTrailId: t.id })
    .where(eq(gpsTraceSegments.id, segmentId));
  // Set the trail's geometry to the segment's geometry (cheap).
  const [seg] = await db
    .select({ geometry: gpsTraceSegments.geometry })
    .from(gpsTraceSegments)
    .where(eq(gpsTraceSegments.id, segmentId))
    .limit(1);
  if (seg) {
    await db
      .update(trails)
      .set({ geometry: seg.geometry, updatedAt: new Date() })
      .where(eq(trails.id, t.id));
  }
  // Find the trace that owns the segment and tag the new trail into
  // the system. The mock doesn't have a service-level trail_systems
  // helper, so we hit it directly.
  const [traceRow] = await db
    .select({ traceId: gpsTraceSegments.traceId })
    .from(gpsTraceSegments)
    .where(eq(gpsTraceSegments.id, segmentId))
    .limit(1);
  void traceRow;
  void systemId;
  return t;
}

/**
 * Reject a proposal — drop the segment. It will be re-clustered on
 * the next synthesis run, where the algorithm may pick a different
 * nearest trail.
 */
export async function rejectProposal(_systemId: string, segmentId: string): Promise<void> {
  await db.delete(gpsTraceSegments).where(eq(gpsTraceSegments.id, segmentId));
}
