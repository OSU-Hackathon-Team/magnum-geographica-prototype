/**
 * Synthesis service tests (§21.6 phase 2).
 *
 * Covers:
 *   - runSynthesis() inserts a synthesis_runs row, mirrors tally on
 *     trails, and returns a summary
 *   - promoteTrail() upgrades tier (synthesized → elevated)
 *   - importPremiumTrail() creates a premium trail, bypasses synthesis
 *   - listProposals() returns unassigned segments
 *   - approveProposal() creates a new synthesized trail + attaches the
 *     segment to it
 *   - rejectProposal() removes the segment
 *   - computeTraceWeight() Wilson-style math
 *   - trace floor: weight < 0.3 flips status to "ignored"
 */
import { describe, expect, test, beforeEach, mock } from "bun:test";
import { createMockDb } from "./helpers/mockDb.js";

const { db, state } = createMockDb();

mock.module("../src/db/index.js", () => ({
  db,
  pool: { end: () => Promise.resolve() },
  schema: {},
}));

const synth = await import("../src/services/synthesis.js");
const traces = await import("../src/services/traces.js");

const traceUUID = (n: number) =>
  `00000000-0000-0000-0000-${n.toString(16).padStart(12, "0")}`;

function seedSystem(id = traceUUID(1)) {
  state.systems.push({ id, slug: `s-${id}`, name: "Test", boundary: null });
}

function seedTrail(
  id: string,
  tier: "synthesized" | "elevated" | "premium" = "synthesized",
) {
  state.trails.push({
    id,
    slug: `t-${id}`,
    name: `Trail ${id}`,
    tier,
    geometry: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function seedTrace(id: string, systemId = traceUUID(1), status: string = "active") {
  state.gpsTraces.push({
    id,
    source: "recorded",
    contributorName: "alice",
    userId: null,
    status,
    upvotes: 0,
    downvotes: 0,
    weight: 1.0,
    createdAt: new Date(),
    recordedAt: new Date(),
  });
  state.traceSystems.push({ traceId: id, systemId });
}

function seedSegment(id: string, traceId: string) {
  state.gpsTraceSegments.push({
    id,
    traceId,
    clusterId: 1,
    proposedTrailId: null,
    geometry: null,
    createdAt: new Date(),
  });
}

beforeEach(() => {
  state.systems.length = 0;
  state.superSystems.length = 0;
  state.subSystems.length = 0;
  state.systemSuperSystems.length = 0;
  state.trails.length = 0;
  state.gpsTraces.length = 0;
  state.traceSystems.length = 0;
  state.gpsTraceSegments.length = 0;
  state.traceSegmentVotes.length = 0;
  state.synthesisRuns.length = 0;
  state.votes.length = 0;
  state.entityStats.length = 0;
});

describe("synthesis: runSynthesis()", () => {
  test("inserts a synthesis_runs row and returns the run", async () => {
    seedSystem();
    seedTrace(traceUUID(3));
    const result = await synth.runSynthesis(traceUUID(1));
    expect(result.run.id).toBeDefined();
    expect(result.run.systemId).toBe(traceUUID(1));
    expect(state.synthesisRuns.length).toBeGreaterThanOrEqual(1);
  });

  test("marks the run complete", async () => {
    seedSystem();
    seedTrace(traceUUID(3));
    const result = await synth.runSynthesis(traceUUID(1));
    const finished = state.synthesisRuns.find((r) => r.id === result.run.id);
    expect(finished?.status).toBe("complete");
    expect(finished?.finishedAt).toBeDefined();
  });
});

describe("synthesis: promoteTrail()", () => {
  test("upgrades a synthesized trail to elevated", async () => {
    seedTrail(traceUUID(7), "synthesized");
    const promoted = await synth.promoteTrail(traceUUID(7), "elevated");
    expect(promoted?.tier).toBe("elevated");
    const stored = state.trails.find((t) => t.id === traceUUID(7));
    expect(stored?.tier).toBe("elevated");
  });

  test("returns null for unknown trail", async () => {
    const result = await synth.promoteTrail("missing", "elevated");
    expect(result).toBeNull();
  });
});

describe("synthesis: importPremiumTrail()", () => {
  test("inserts a premium trail", async () => {
    const trail = await synth.importPremiumTrail({
      name: "Bear Creek",
      slug: "bear-creek",
      systemId: traceUUID(1),
      geometry: { type: "LineString", coordinates: [[-120, 50], [-120.01, 50.01]] },
    });
    expect(trail.tier).toBe("premium");
    expect(state.trails.some((t) => t.slug === "bear-creek" && t.tier === "premium")).toBe(true);
  });
});

describe("synthesis: listProposals()", () => {
  test("returns unassigned segments", async () => {
    seedSystem();
    seedTrace(traceUUID(3));
    seedSegment(traceUUID(11), traceUUID(3));
    const proposals = await synth.listProposals(traceUUID(1));
    expect(proposals.length).toBeGreaterThanOrEqual(1);
    expect(proposals[0]?.segment_id).toBe(traceUUID(11));
    expect(proposals[0]?.reason).toBe("no_nearby_trail");
  });
});

describe("synthesis: approveProposal()", () => {
  test("creates a new synthesized trail and attaches the segment", async () => {
    seedSystem();
    seedTrace(traceUUID(3));
    seedSegment(traceUUID(11), traceUUID(3));
    const trail = await synth.approveProposal(traceUUID(1), traceUUID(11), "New Trail");
    expect(trail.tier).toBe("synthesized");
    const seg = state.gpsTraceSegments.find((s) => s.id === traceUUID(11));
    expect(seg?.proposedTrailId).toBe(trail.id);
    const vote = state.traceSegmentVotes.find(
      (v) => v.segmentId === traceUUID(11) && v.trailId === trail.id,
    );
    expect(vote).toBeDefined();
  });
});

describe("synthesis: rejectProposal()", () => {
  test("removes the segment", async () => {
    seedSystem();
    seedSegment(traceUUID(11), traceUUID(3));
    await synth.rejectProposal(traceUUID(1), traceUUID(11));
    expect(state.gpsTraceSegments.some((s) => s.id === traceUUID(11))).toBe(false);
  });
});

describe("trace weight (Wilson-style)", () => {
  test("computeTraceWeight() is 0.5 at zero votes", () => {
    expect(traces.computeTraceWeight(0, 0)).toBeCloseTo(0.5, 5);
  });

  test("computeTraceWeight() rises with upvotes", () => {
    expect(traces.computeTraceWeight(5, 0)).toBeGreaterThan(0.5);
    expect(traces.computeTraceWeight(20, 0)).toBeGreaterThan(0.9);
  });

  test("computeTraceWeight() drops with downvotes", () => {
    expect(traces.computeTraceWeight(0, 5)).toBeLessThan(0.5);
  });
});

describe("trace vote floor", () => {
  test("weight < 0.3 auto-flips status to ignored", async () => {
    seedSystem();
    seedTrace(traceUUID(3));
    seedSegment(traceUUID(11), traceUUID(3));
    const result = await traces.voteOnTrace(traceUUID(3), -1, {
      userId: traceUUID(5),
      voterKarma: 0,
      voterTier: "new",
      contributorName: "bob",
    });
    expect(result.downvotes).toBe(1);
    const t = state.gpsTraces.find((row) => row.id === traceUUID(3));
    expect(t?.status).toBe("ignored");
  });
});
