/**
 * Real-DB tests for trace segment vote semantics (§21.6).
 * Tests the 3-way vote (agree/disagree/propose-new) and tally endpoint.
 */
import { describe, expect, test, beforeEach } from "bun:test";
import { Hono } from "hono";
import { setupRealDb } from "./helpers/db.js";
import { traceSegmentsRoute } from "../src/routes/traces.js";
import { gpsTraces, gpsTraceSegments, trails } from "../src/db/schema.js";
import { signToken } from "../src/middleware/auth.js";

const { db, reset } = setupRealDb();

const TEST_USER = {
  id: "00000000-0000-4000-a000-000000000099",
  username: "tester",
  email: "test@test.com",
  role: "contributor",
  karma: 100,
  tier: "established" as const,
};

let authToken: string;

beforeEach(async () => {
  await reset();
  authToken = await signToken(TEST_USER);
});

const buildApp = () => new Hono().route("/api/trace-segments", traceSegmentsRoute);

async function seedTrail() {
  const [t] = await db
    .insert(trails)
    .values({
      name: "Test Trail",
      slug: `test-${Date.now()}`,
      tier: "synthesized",
    })
    .returning();
  return t;
}

async function seedTraceAndSegment() {
  const [trace] = await db
    .insert(gpsTraces)
    .values({
      contributorName: "alice",
      status: "active",
      source: "recorded",
      geometry: "SRID=4326;MULTILINESTRING((-82.5 39.4, -82.6 39.5))",
    })
    .returning();
  const [seg] = await db
    .insert(gpsTraceSegments)
    .values({
      traceId: trace.id,
      geometry: "SRID=4326;MULTILINESTRING((-82.5 39.4, -82.6 39.5))",
    })
    .returning();
  return { trace, seg };
}

describe("POST /api/trace-segments/:id/vote", () => {
  test("agree: trail_id=X, vote=+1", async () => {
    const { seg } = await seedTraceAndSegment();
    const trail = await seedTrail();
    const res = await buildApp().request(`/api/trace-segments/${seg.id}/vote`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ trail_id: trail.id, vote: 1 }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { vote: number };
    expect(body.vote).toBe(1);
  });

  test("disagree: trail_id=X, vote=-1", async () => {
    const { seg } = await seedTraceAndSegment();
    const trail = await seedTrail();
    const res = await buildApp().request(`/api/trace-segments/${seg.id}/vote`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ trail_id: trail.id, vote: -1 }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { vote: number };
    expect(body.vote).toBe(-1);
  });

  test("propose new: trail_id=null, vote=+1", async () => {
    const { seg } = await seedTraceAndSegment();
    const res = await buildApp().request(`/api/trace-segments/${seg.id}/vote`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ trail_id: null, vote: 1 }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { vote: number };
    expect(body.vote).toBe(1);
  });

  test("defaults vote to +1 when omitted", async () => {
    const { seg } = await seedTraceAndSegment();
    const trail = await seedTrail();
    const res = await buildApp().request(`/api/trace-segments/${seg.id}/vote`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ trail_id: trail.id }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { vote: number };
    expect(body.vote).toBe(1);
  });

  test("UPSERT: voting again overwrites previous", async () => {
    const { seg } = await seedTraceAndSegment();
    const trail = await seedTrail();
    await buildApp().request(`/api/trace-segments/${seg.id}/vote`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ trail_id: trail.id, vote: 1 }),
    });
    const res = await buildApp().request(`/api/trace-segments/${seg.id}/vote`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ trail_id: trail.id, vote: -1 }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { vote: number };
    expect(body.vote).toBe(-1);
  });

  test("invalid trail_id returns 500 (FK violation)", async () => {
    const { seg } = await seedTraceAndSegment();
    const res = await buildApp().request(`/api/trace-segments/${seg.id}/vote`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ trail_id: "00000000-0000-4000-a000-000000000001", vote: 1 }),
    });
    expect(res.status).toBe(500);
  });

  test("returns 401 without auth", async () => {
    const { seg } = await seedTraceAndSegment();
    const res = await buildApp().request(`/api/trace-segments/${seg.id}/vote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trail_id: null }),
    });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/trace-segments/:id/votes", () => {
  test("returns tally for a segment with votes", async () => {
    const { seg } = await seedTraceAndSegment();
    const trail = await seedTrail();
    await buildApp().request(`/api/trace-segments/${seg.id}/vote`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ trail_id: trail.id, vote: 1 }),
    });
    const user2 = await signToken({
      id: "00000000-0000-4000-a000-000000000088",
      username: "user2",
      email: "u2@test.com",
      role: "contributor",
      karma: 0,
      tier: "new" as const,
    });
    await buildApp().request(`/api/trace-segments/${seg.id}/vote`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${user2}` },
      body: JSON.stringify({ trail_id: null, vote: 1 }),
    });

    const res = await buildApp().request(`/api/trace-segments/${seg.id}/votes`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      votes: Array<{ trail_id: string | null; vote: number; count: number }>;
      total: number;
    };
    expect(body.total).toBe(2);
    expect(body.votes.length).toBe(2);
  });

  test("returns empty array for segment with no votes", async () => {
    const { seg } = await seedTraceAndSegment();
    const res = await buildApp().request(`/api/trace-segments/${seg.id}/votes`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { votes: unknown[] };
    expect(body.votes).toEqual([]);
  });
});
