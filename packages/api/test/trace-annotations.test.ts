import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { setupRealDb } from "./helpers/db.js";
import {
  systems,
  gpsTraces,
  traceAnnotations,
  trails,
  trailSystems,
  gpsTraceSegments,
  traceSegmentVotes,
} from "../src/db/schema.js";
import { createTrace } from "../src/services/traces.js";
import { listAnnotationsForTrace, listAnnotationsForTrail } from "../src/services/traces.js";
import { eq, sql } from "drizzle-orm";

const { db, reset } = setupRealDb();

describe("trace annotations", () => {
  beforeEach(async () => {
    await reset();
  });

  afterEach(async () => {
    await reset();
  });

  test("createTrace inserts annotations", async () => {
    const sysRow = await db
      .insert(systems)
      .values({ name: "Test", slug: "test-ann-sys" })
      .returning();
    const systemId = sysRow[0]!.id;

    const { trace } = await createTrace({
      coordinates: [
        [-82.5, 39.4],
        [-82.55, 39.45],
        [-82.59, 39.49],
      ],
      source: "recorded",
      contributorName: "tester",
      userId: null,
      annotations: [
        {
          type: "surface_change",
          value: "gravel",
          index: 1,
          lat: 39.45,
          lon: -82.55,
          capturedAt: new Date().toISOString(),
        },
        {
          type: "road_crossing",
          index: 2,
          lat: 39.49,
          lon: -82.59,
          capturedAt: new Date().toISOString(),
        },
      ],
    });

    const items = await db
      .select()
      .from(traceAnnotations)
      .where(eq(traceAnnotations.traceId, trace.id));
    expect(items.length).toBe(2);
    expect(items[0]!.type).toBe("surface_change");
    expect(items[0]!.value).toBe("gravel");
    expect(items[1]!.type).toBe("road_crossing");
    expect(items[1]!.value).toBeNull();
  });

  test("listAnnotationsForTrace returns sorted annotations", async () => {
    const { trace } = await createTrace({
      coordinates: [
        [-82.5, 39.4],
        [-82.6, 39.5],
      ],
      source: "recorded",
      contributorName: "tester",
      userId: null,
      annotations: [
        { type: "surface_change", value: "paved", index: 0, lat: 39.4, lon: -82.5, capturedAt: new Date().toISOString() },
        { type: "road_crossing", index: 1, lat: 39.5, lon: -82.6, capturedAt: new Date().toISOString() },
      ],
    });

    const items = await listAnnotationsForTrace(trace.id);
    expect(items.length).toBe(2);
    expect(items[0]!.type).toBe("surface_change");
    expect(items[0]!.index).toBe(0);
    expect(items[1]!.index).toBe(1);
  });

  test("listAnnotationsForTrail returns annotations from assigned traces", async () => {
    const sysRow = await db
      .insert(systems)
      .values({ name: "Test", slug: "test-ann-trail" })
      .returning();
    const systemId = sysRow[0]!.id;

    const [trailRow] = await db
      .insert(trails)
      .values({ name: "Test Trail", slug: "test-trail", tier: "synthesized" })
      .returning();
    const trailId = trailRow!.id;

    await db
      .insert(trailSystems)
      .values({ trailId, systemId });

    const { trace } = await createTrace({
      coordinates: [
        [-82.5, 39.4],
        [-82.6, 39.5],
      ],
      source: "recorded",
      contributorName: "tester",
      userId: null,
      annotations: [
        { type: "surface_change", value: "gravel", index: 0, lat: 39.4, lon: -82.5, capturedAt: new Date().toISOString() },
      ],
    });

    const { cutTraceSegments } = await import("../src/services/traces.js");
    await cutTraceSegments(trace.id);

    const segs = await db.execute<{ id: string }>(
      sql`SELECT id FROM gps_trace_segments WHERE trace_id = ${trace.id} LIMIT 1`,
    );
    const segId = (segs.rows[0] as { id?: string })?.id;
    if (segId) {
      await db.insert(traceSegmentVotes).values({
        segmentId: segId,
        trailId,
        vote: 1,
        contributorName: "test",
      });
    }

    const items = await listAnnotationsForTrail(trailId);
    expect(items.length).toBe(1);
    expect(items[0]!.type).toBe("surface_change");
  });
});
