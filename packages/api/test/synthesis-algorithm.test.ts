/**
 * Real-DB tests for the synthesis algorithm with real PostGIS.
 * Tests clustering, spatial assignment, and centerline computation.
 */
import { describe, expect, test, beforeEach } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { setupRealDb } from "./helpers/db.js";
import { synthesisRoute } from "../src/routes/synthesis.js";
import {
  systems, trails, trailSystems, gpsTraces, gpsTraceSegments,
  traceSystems, traceSegmentVotes, synthesisRuns, users,
} from "../src/db/schema.js";
import { signToken } from "../src/middleware/auth.js";

const { db, reset } = setupRealDb();

const TEST_MOD = {
  id: "00000000-0000-4000-a000-000000000098",
  username: "moderator",
  email: "mod@test.com",
  role: "moderator",
  karma: 999,
  tier: "moderator" as const,
};

let modToken: string;

beforeEach(async () => {
  await reset();
  await db.insert(users).values({
    id: TEST_MOD.id, username: TEST_MOD.username, email: TEST_MOD.email, passwordHash: "x", role: "moderator",
  });
  modToken = await signToken(TEST_MOD);
});

const buildApp = () => new Hono().route("/api", synthesisRoute);

async function seedSystem() {
  const [sys] = await db
    .insert(systems)
    .values({ name: "Test Park", slug: "test-park" })
    .returning();
  return sys;
}

async function seedTrail(sysId: string, tier: string = "synthesized") {
  const slug = `trail-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const [t] = await db
    .insert(trails)
    .values({
      name: "Test Trail",
      slug,
      tier,
      geometry: sql`ST_Multi(ST_GeomFromText('LINESTRING(-82.5 39.4, -82.6 39.5)', 4326))`,
    })
    .returning();
  await db.insert(trailSystems).values({ trailId: t.id, systemId: sysId });
  return t;
}

async function seedTrace(sysId: string, status: string = "active", coords?: string) {
  const geom = coords ?? "SRID=4326;MULTILINESTRING((-82.5 39.4, -82.55 39.45, -82.6 39.5))";
  const [trace] = await db
    .insert(gpsTraces)
    .values({
      contributorName: "alice",
      source: "recorded",
      status,
      geometry: geom,
      weight: 1.0,
    })
    .returning();
  await db.insert(traceSystems).values({ traceId: trace.id, systemId: sysId });
  return trace;
}

describe("demoteTrail via route", () => {
  test("demotes frozen → synthesized", async () => {
    const sys = await seedSystem();
    const trail = await seedTrail(sys.id, "frozen");
    const res = await buildApp().request(`/api/admin/trails/${trail.id}/demote`, {
      method: "POST",
      headers: { authorization: `Bearer ${modToken}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tier: string };
    expect(body.tier).toBe("synthesized");
  });

  test("rejects demote of synthesized trail", async () => {
    const sys = await seedSystem();
    const trail = await seedTrail(sys.id, "synthesized");
    const res = await buildApp().request(`/api/admin/trails/${trail.id}/demote`, {
      method: "POST",
      headers: { authorization: `Bearer ${modToken}` },
    });
    expect(res.status).toBe(400);
  });

  test("rejects demote of premium trail", async () => {
    const sys = await seedSystem();
    const trail = await seedTrail(sys.id, "premium");
    const res = await buildApp().request(`/api/admin/trails/${trail.id}/demote`, {
      method: "POST",
      headers: { authorization: `Bearer ${modToken}` },
    });
    expect(res.status).toBe(400);
  });
});

describe("promoteTrail via route", () => {
  test("promotes synthesized → frozen", async () => {
    const sys = await seedSystem();
    const trail = await seedTrail(sys.id, "synthesized");
    const res = await buildApp().request(`/api/admin/trails/${trail.id}/promote`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${modToken}` },
      body: JSON.stringify({ to: "frozen" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tier: string };
    expect(body.tier).toBe("frozen");
  });

  test("rejects invalid transition", async () => {
    const sys = await seedSystem();
    const trail = await seedTrail(sys.id, "premium");
    const res = await buildApp().request(`/api/admin/trails/${trail.id}/promote`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${modToken}` },
      body: JSON.stringify({ to: "frozen" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("importPremiumTrail via route", () => {
  test("creates premium trail with provenance and system link", async () => {
    const sys = await seedSystem();
    const res = await buildApp().request("/api/admin/trails/import", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${modToken}` },
      body: JSON.stringify({
        name: "Premium Path",
        slug: "premium-path",
        system_id: sys.id,
        difficulty: "easy",
        external_url: "https://example.com",
        source: "NPS",
        source_date: "2025-01-01",
        geometry: { type: "LineString", coordinates: [[-82.5, 39.4], [-82.6, 39.5]] },
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; tier: string };
    expect(body.tier).toBe("premium");

    // Verify trail_systems link.
    const links = await db
      .select()
      .from(trailSystems)
      .where(eq(trailSystems.trailId, body.id));
    expect(links.length).toBe(1);
    expect(links[0]?.systemId).toBe(sys.id);

    // Verify provenance stored.
    const stored = await db.select().from(trails).where(eq(trails.id, body.id));
    expect(stored[0]?.source).toBe("NPS");
    expect(stored[0]?.sourceDate).toBe("2025-01-01");
  });
});

describe("runSynthesis basic flow", () => {
  test("synthesize route was removed — synthesis is background-only", async () => {
    const sys = await seedSystem();
    await seedTrace(sys.id);
    const res = await buildApp().request(`/api/systems/${sys.id}/synthesize`, {
      method: "POST",
      headers: { authorization: `Bearer ${modToken}` },
    });
    expect(res.status).toBe(404);
  });

});

