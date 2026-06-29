import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { setupRealDb } from "./helpers/db.js";
import {
  synthesisJobs,
  systems,
  gpsTraces,
  type SynthesisJob,
} from "../src/db/schema.js";
import {
  enqueueSynthesis,
} from "../src/services/synthesis-worker.js";
import { eq, sql } from "drizzle-orm";

const { db, reset } = setupRealDb();

describe("enqueueSynthesis", () => {
  beforeEach(async () => {
    await reset();
  });

  afterEach(async () => {
    await reset();
  });

  test("creates a new queued job for a system", async () => {
    const sysRow = await db
      .insert(systems)
      .values({ name: "Test", slug: "test-system" })
      .returning();
    const systemId = sysRow[0]!.id;

    const job = await enqueueSynthesis(systemId, { scope: "incremental" });
    expect(job.status).toBe("queued");
    expect(job.systemId).toBe(systemId);
    expect(job.scope).toBe("incremental");

    const stored = await db
      .select()
      .from(synthesisJobs)
      .where(eq(synthesisJobs.systemId, systemId));
    expect(stored.length).toBe(1);
    expect(stored[0]!.status).toBe("queued");
  });

  test("debounce: bumps existing queued job within window instead of creating new", async () => {
    const sysRow = await db
      .insert(systems)
      .values({ name: "Test2", slug: "test-system-2" })
      .returning();
    const systemId = sysRow[0]!.id;

    const job1 = await enqueueSynthesis(systemId);
    const originalTime = job1.createdAt;

    await new Promise((r) => setTimeout(r, 100));
    const job2 = await enqueueSynthesis(systemId);

    const stored = await db
      .select()
      .from(synthesisJobs)
      .where(eq(synthesisJobs.systemId, systemId));
    expect(stored.length).toBe(1);
    expect(stored[0]!.id).toBe(job1.id);
    expect(stored[0]!.createdAt.getTime()).toBeGreaterThanOrEqual(
      originalTime.getTime(),
    );
  });

  test("creates a new job after debounce window passes", async () => {
    const sysRow = await db
      .insert(systems)
      .values({ name: "Test3", slug: "test-system-3" })
      .returning();
    const systemId = sysRow[0]!.id;

    const job1 = await enqueueSynthesis(systemId);

    const oldDate = new Date(Date.now() - 120_000);
    await db
      .update(synthesisJobs)
      .set({ createdAt: oldDate })
      .where(eq(synthesisJobs.id, job1.id));

    const job2 = await enqueueSynthesis(systemId);

    const stored = await db
      .select()
      .from(synthesisJobs)
      .where(eq(synthesisJobs.systemId, systemId));
    expect(stored.length).toBe(2);
  });

  test("stores triggerTraceId when provided", async () => {
    const sysRow = await db
      .insert(systems)
      .values({ name: "Test4", slug: "test-system-4" })
      .returning();
    const systemId = sysRow[0]!.id;

    // Create a real trace for the FK reference
    const [traceRow] = await db
      .insert(gpsTraces)
      .values({
        userId: null,
        contributorName: "test",
        geometry: sql`ST_GeomFromText('MULTILINESTRING((-82.5 39.4,-82.6 39.5))', 4326)`,
        source: "recorded",
      })
      .returning();
    const traceId = traceRow!.id;

    const job = await enqueueSynthesis(systemId, {
      triggerTraceId: traceId,
    });
    expect(job.triggerTraceId).toBe(traceId);
  });
});
