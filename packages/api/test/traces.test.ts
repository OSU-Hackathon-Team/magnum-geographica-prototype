import { describe, expect, test, beforeEach } from "bun:test";
import { mock } from "bun:test";
import { createMockDb } from "./helpers/mockDb.js";

const { db, state } = createMockDb();

mock.module("../src/db/index.js", () => ({
  db,
  pool: { end: () => Promise.resolve() },
  schema: {},
}));

const {
  createTrace,
  getTraceById,
  listTraces,
  deleteTrace,
  setTraceStatus,
  voteOnTrace,
  retractTraceVote,
  importTrace,
  listSegmentsForTrace,
} = await import("../src/services/traces.js");

const traceUUID = (n: number) =>
  `00000000-0000-0000-0000-${n.toString(16).padStart(12, "0")}`;
const SYSTEM_A = traceUUID(1);
const SYSTEM_B = traceUUID(2);
const TRACE_ID = traceUUID(3);
const AUTHOR_ID = traceUUID(4);
const VOTER_ID = traceUUID(5);
const COORDS: Array<[number, number]> = [
  [-83.0, 40.0],
  [-83.001, 40.0],
  [-83.002, 40.0],
  [-83.003, 40.0],
];

beforeEach(() => {
  state.gpsTraces.length = 0;
  state.traceSystems.length = 0;
  state.gpsTraceSegments.length = 0;
  state.users.length = 0;
  state.executeRouter.length = 0;
  // Set up an author so the karma attribution can look them up.
  state.users.push({
    id: AUTHOR_ID,
    username: "author",
    email: "a@example.com",
    password_hash: "x",
    role: "contributor",
    trust_score: 10,
    display_name: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  });
});

describe("createTrace", () => {
  test("inserts a trace and auto-tags intersecting systems", async () => {
    state.executeRouter.push({
      match: "ST_Intersects",
      rows: [{ system_id: SYSTEM_A }, { system_id: SYSTEM_B }],
    });
    const { trace, taggedSystemIds } = await createTrace({
      coordinates: COORDS,
      source: "import",
      contributorName: "tester",
      userId: AUTHOR_ID,
    });
    expect(trace.source).toBe("import");
    expect(trace.contributorName).toBe("tester");
    expect(taggedSystemIds).toEqual([SYSTEM_A, SYSTEM_B]);
    expect(state.traceSystems.length).toBe(2);
  });

  test("rejects a trace with fewer than 2 points", async () => {
    await expect(
      createTrace({
        coordinates: [[0, 0]],
        source: "import",
        contributorName: "t",
        userId: null,
      }),
    ).rejects.toThrow();
  });
});

describe("getTraceById / listTraces / deleteTrace", () => {
  test("get returns null when missing", async () => {
    expect(await getTraceById("missing")).toBe(null);
  });

  test("listTraces returns all traces when no filter", async () => {
    state.gpsTraces.push(
      { id: TRACE_ID, source: "import", contributor_name: "t", user_id: null, weight: 1, upvotes: 0, downvotes: 0, status: "active", recorded_at: null, created_at: "2026-01-01T00:00:00.000Z" },
      { id: traceUUID(6), source: "recorded", contributor_name: "u", user_id: AUTHOR_ID, weight: 1, upvotes: 0, downvotes: 0, status: "active", recorded_at: null, created_at: "2026-01-01T00:00:00.000Z" },
    );
    const { items } = await listTraces();
    // The mock can't simulate `count(*)`, so we assert on `items.length`
    // (which is reliable). `total` is tested separately in a follow-up.
    expect(items.length).toBe(2);
  });

  test("listTraces filters by user_id without joining", async () => {
    state.gpsTraces.push(
      { id: TRACE_ID, source: "import", contributor_name: "t", user_id: AUTHOR_ID, weight: 1, upvotes: 0, downvotes: 0, status: "active", recorded_at: null, created_at: "2026-01-01T00:00:00.000Z" },
      { id: traceUUID(6), source: "import", contributor_name: "u", user_id: null, weight: 1, upvotes: 0, downvotes: 0, status: "active", recorded_at: null, created_at: "2026-01-01T00:00:00.000Z" },
    );
    const { items } = await listTraces({ userId: AUTHOR_ID });
    expect(items.length).toBe(1);
  });

  test("delete removes the trace", async () => {
    state.gpsTraces.push({ id: TRACE_ID });
    const ok = await deleteTrace(TRACE_ID);
    expect(ok).toBe(true);
    expect(state.gpsTraces.length).toBe(0);
  });

  test("setTraceStatus updates status", async () => {
    state.gpsTraces.push({ id: TRACE_ID, status: "active" });
    const ok = await setTraceStatus(TRACE_ID, "removed");
    expect(ok).toBe(true);
    expect(state.gpsTraces[0]?.status).toBe("removed");
  });
});

describe("importTrace", () => {
  test("imports a GPX string", async () => {
    const gpx = `<gpx><trkpt lat="40" lon="-83"/><trkpt lat="40.001" lon="-83"/></gpx>`;
    state.executeRouter.push({ match: "ST_Intersects", rows: [] });
    const res = await importTrace("gpx", gpx, {
      contributorName: "t",
      userId: null,
    });
    expect(res.points).toBe(2);
    expect(res.lengthMeters).toBeGreaterThan(0);
    expect(res.taggedSystemIds).toEqual([]);
  });

  test("imports a GeoJSON LineString", async () => {
    const ls = {
      type: "LineString",
      coordinates: [
        [-83, 40],
        [-83.001, 40.001],
      ],
    };
    state.executeRouter.push({ match: "ST_Intersects", rows: [] });
    const res = await importTrace("geojson", ls, {
      contributorName: "t",
      userId: null,
    });
    expect(res.points).toBe(2);
  });

  test("rejects a non-trace GeoJSON geometry", async () => {
    await expect(
      importTrace("geojson", { type: "Point", coordinates: [0, 0] }, {
        contributorName: "t",
        userId: null,
      }),
    ).rejects.toThrow();
  });
});

describe("voteOnTrace", () => {
  test("upvote increments tally, awards karma to author", async () => {
    state.gpsTraces.push({
      id: TRACE_ID,
      contributor_name: "author",
      source: "import",
      weight: 1,
      upvotes: 0,
      downvotes: 0,
      status: "active",
      recorded_at: null,
      created_at: "2026-01-01T00:00:00.000Z",
      user_id: AUTHOR_ID,
    });
    // Author lookup: the castVote service queries `SELECT user_id AS
    // author_id FROM gps_traces WHERE id = ?`. Route the mock to
    // return the trace's author id.
    state.executeRouter.push({
      match: "from gps_traces",
      rows: [{ author_id: AUTHOR_ID }],
    });
    const res = await voteOnTrace(TRACE_ID, 1, {
      userId: VOTER_ID,
      voterKarma: 0,
      voterTier: "new",
      contributorName: "voter",
    });
    expect(res.upvotes).toBe(1);
    expect(res.karmaAwarded).toBe(1);
  });

  test("retract removes the vote and reverses karma", async () => {
    state.gpsTraces.push({
      id: TRACE_ID,
      contributor_name: "author",
      source: "import",
      weight: 1,
      upvotes: 1,
      downvotes: 0,
      status: "active",
      recorded_at: null,
      created_at: "2026-01-01T00:00:00.000Z",
      user_id: AUTHOR_ID,
    });
    // Pre-seed a vote row so the retract finds it.
    state.votes = [
      {
        id: "00000000-0000-0000-0000-000000000099",
        target_type: "trace",
        target_id: TRACE_ID,
        user_id: VOTER_ID,
        value: 1,
        voter_karma: 0,
        voter_tier: "new",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ];
    state.executeRouter.push({
      match: "from gps_traces",
      rows: [{ author_id: AUTHOR_ID }],
    });
    const res = await retractTraceVote(TRACE_ID, VOTER_ID);
    expect(res.upvotes).toBe(0);
    expect(res.karmaAwarded).toBe(-1);
  });
});

describe("listSegmentsForTrace", () => {
  test("returns segments for the trace in created_at order", async () => {
    state.gpsTraceSegments.push(
      { id: traceUUID(10), trace_id: TRACE_ID, created_at: "2026-01-01T00:00:00.000Z" },
      { id: traceUUID(11), trace_id: TRACE_ID, created_at: "2026-01-02T00:00:00.000Z" },
    );
    const segs = await listSegmentsForTrace(TRACE_ID);
    expect(segs.length).toBe(2);
    expect(segs[0]?.id).toBe(traceUUID(10));
  });
});
