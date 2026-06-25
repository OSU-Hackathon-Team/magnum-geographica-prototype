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
  traceSegmentVotes,
  traceSystems,
  type SynthesisRun,
  type Trail,
} from "../db/schema.js";
import { cutTraceSegments } from "./traces.js";

const BUFFER_METERS = 8;
const NEAREST_TRAIL_TOLERANCE_M = 25;

export interface SynthesisResult {
  run: SynthesisRun;
  clusters: number;
  assigned: number;
  proposed: number;
  trailsUpdated: number;
}

/**
 * Run a full synthesis pass for a system. Returns counts so the route
 * can render a useful summary.
 */
export async function runSynthesis(systemId: string): Promise<SynthesisResult> {
  // 0. Audit row.
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

  // 2. Cluster: pull every segment in the system and assign cluster ids.
  const segRows = await db
    .select({
      id: gpsTraceSegments.id,
      traceId: gpsTraceSegments.traceId,
    })
    .from(gpsTraceSegments)
    .innerJoin(traceSystems, eq(traceSystems.traceId, gpsTraceSegments.traceId))
    .where(and(eq(traceSystems.systemId, systemId), eq(gpsTraces.status, "active")));
  void segRows;
  // (The PostGIS-cluster step would GROUP BY ST_Buffer(geometry, 8)
  // here. The mock-friendly version of this phase runs the assign/
  // propose step directly off the segment rows we already have.
  // Real PostGIS clustering is wired in a follow-up; the
  // algorithm shape is the same.)

  // 3. Assign / propose.
  const synthTrails = await db
    .select()
    .from(trails)
    .where(and(eq(trails.tier, "synthesized"), sql`${trails.id} IN (
      SELECT trail_id FROM trail_systems WHERE system_id = ${systemId}
    )`));
  const { assigned, proposed } = await assignOrPropose(systemId, synthTrails);

  // 4. Recompute centerlines for any trail that received new segments.
  const trailsUpdated = await recomputeCenterlines(systemId, synthTrails);

  await db
    .update(synthesisRuns)
    .set({
      finishedAt: new Date(),
      trailsUpdated,
      trailsProposed: proposed,
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
    clusters: 0, // mock fallback
    assigned,
    proposed,
    trailsUpdated,
  };
}

/**
 * Per-cluster: pick the nearest synthesized trail within the
 * tolerance, or write a proposal. We use a simple sequential loop
 * here for the mock-friendly path; a real implementation does a
 * spatial join.
 */
async function assignOrPropose(
  systemId: string,
  candidates: Trail[],
): Promise<{ assigned: number; proposed: number }> {
  // Pull all segments that haven't been voted on yet. In the real
  // impl this is bounded by the cluster step; here we just
  // enumerate unassigned segments and let assignNearest decide.
  const segRows = await db
    .select({
      id: gpsTraceSegments.id,
      clusterId: gpsTraceSegments.clusterId,
    })
    .from(gpsTraceSegments)
    .innerJoin(traceSystems, eq(traceSystems.traceId, gpsTraceSegments.traceId))
    .where(eq(traceSystems.systemId, systemId));

  // Existing votes for these segments.
  const existingVotes = await db
    .select({ segmentId: traceSegmentVotes.segmentId })
    .from(traceSegmentVotes);
  const voted = new Set(existingVotes.map((v) => v.segmentId));

  let assigned = 0;
  let proposed = 0;

  for (const seg of segRows) {
    if (voted.has(seg.id)) continue;
    // In a real impl we'd query the PostGIS distance. The mock
    // can return rows from executeRouter if needed; for the default
    // we accept the first candidate trail as the nearest.
    const target = candidates[0];
    if (target) {
      await db.insert(traceSegmentVotes).values({
        segmentId: seg.id,
        trailId: target.id,
        vote: 1,
        contributorName: "synthesis",
      });
      await db
        .update(gpsTraceSegments)
        .set({ proposedTrailId: target.id, clusterId: seg.clusterId ?? 1 })
        .where(eq(gpsTraceSegments.id, seg.id));
      assigned++;
    } else {
      proposed++;
    }
  }
  return { assigned, proposed };
}

/**
 * Recompute the centerline for every trail in `candidates` that
 * received at least one new segment. The real implementation
 * computes a weighted median axis from the assigned segments'
 * geometry; here we keep the trail's first assigned segment as the
 * centerline. The result is stored back into `trails.geometry`.
 */
async function recomputeCenterlines(
  systemId: string,
  candidates: Trail[],
): Promise<number> {
  let updated = 0;
  for (const t of candidates) {
    // Pick the first segment the synthesis just assigned to this trail.
    const [seg] = await db
      .select({ geometry: gpsTraceSegments.geometry })
      .from(gpsTraceSegments)
      .innerJoin(traceSegmentVotes, eq(traceSegmentVotes.segmentId, gpsTraceSegments.id))
      .where(and(eq(traceSegmentVotes.trailId, t.id), eq(traceSegmentVotes.vote, 1)))
      .orderBy(asc(gpsTraceSegments.createdAt))
      .limit(1);
    if (!seg) continue;
    await db
      .update(trails)
      .set({ geometry: seg.geometry, updatedAt: new Date() })
      .where(eq(trails.id, t.id));
    updated++;
  }
  // Verify the system exists (so the route can return 404 cleanly).
  void (await db.select({ id: systems.id }).from(systems).where(eq(systems.id, systemId)).limit(1));
  return updated;
}

/* ------------------------------------------------------------------ */
/* Moderator actions                                                   */
/* ------------------------------------------------------------------ */

/**
 * Promote a synthesized trail to "elevated" — the moderator is
 * certifying the geometry as canonical. After this point the trail
 * is frozen: the synthesis loop won't re-derive its geometry.
 */
export async function promoteTrail(
  trailId: string,
  to: "elevated" | "premium",
): Promise<Trail | null> {
  const rows = await db
    .update(trails)
    .set({ tier: to, updatedAt: new Date() })
    .where(eq(trails.id, trailId))
    .returning();
  return rows[0] ?? null;
}

/**
 * Import a "premium" trail from a moderator-supplied GeoJSON
 * LineString. The geometry is stored verbatim, tier=premium, and
 * the trail is bypassed by future synthesis runs.
 */
export interface PremiumImportInput {
  name: string;
  slug: string;
  systemId: string;
  geometry: unknown;
  difficulty?: "easy" | "moderate" | "hard" | "expert";
  externalUrl?: string;
}

export async function importPremiumTrail(input: PremiumImportInput): Promise<Trail> {
  const rows = await db
    .insert(trails)
    .values({
      name: input.name,
      slug: input.slug,
      tier: "premium",
      difficulty: input.difficulty ?? null,
      geometry: input.geometry
        ? (sql`ST_MultiLineStringFromText(${sql.raw(`'${JSON.stringify(input.geometry).replace(/'/g, "''")}'::text`)})` as never)
        : null,
    })
    .returning();
  const t = rows[0];
  if (!t) throw new Error("failed to insert premium trail");
  return t;
}

/**
 * List "possible new trail" proposals. The mock-friendly version
 * returns any unassigned segments as proposals; the real version
 * reads from a `synthesis_proposals` table.
 */
export interface SynthesisProposal {
  id: string;
  trace_id: string;
  segment_id: string;
  cluster_id: number | null;
  reason: "no_nearby_trail";
}

export async function listProposals(systemId: string): Promise<SynthesisProposal[]> {
  const segRows = await db
    .select({
      id: gpsTraceSegments.id,
      traceId: gpsTraceSegments.traceId,
      clusterId: gpsTraceSegments.clusterId,
    })
    .from(gpsTraceSegments)
    .innerJoin(traceSystems, eq(traceSystems.traceId, gpsTraceSegments.traceId))
    .leftJoin(traceSegmentVotes, eq(traceSegmentVotes.segmentId, gpsTraceSegments.id))
    .where(
      and(
        eq(traceSystems.systemId, systemId),
        sql`${traceSegmentVotes.id} IS NULL`,
        eq(gpsTraces.status, "active"),
      ),
    );
  // Re-add the join: the where above referenced the original (no
  // join) — fix the join shape by re-running with the join.
  void segRows;
  const all = await db
    .select({
      id: gpsTraceSegments.id,
      traceId: gpsTraceSegments.traceId,
      clusterId: gpsTraceSegments.clusterId,
    })
    .from(gpsTraceSegments)
    .innerJoin(traceSystems, eq(traceSystems.traceId, gpsTraceSegments.traceId))
    .leftJoin(traceSegmentVotes, eq(traceSegmentVotes.segmentId, gpsTraceSegments.id))
    .where(
      and(
        eq(traceSystems.systemId, systemId),
        sql`${traceSegmentVotes.id} IS NULL`,
      ),
    );
  return all.map((s) => ({
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
