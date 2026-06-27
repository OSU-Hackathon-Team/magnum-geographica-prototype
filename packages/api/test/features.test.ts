/**
 * Tests for the features route (GET, POST, PUT, DELETE /api/features).
 *
 * Previously untested at the unit level. Uses the real test Postgres
 * database so PostGIS ST_X/ST_Y column extractions, the FK to
 * systems/trails, and the preset validation actually run.
 */
import { describe, expect, test, beforeEach } from "bun:test";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { setupRealDb } from "./helpers/db.js";
import { featuresRoute } from "../src/routes/features.js";
import { features, presets, systems, trails, users } from "../src/db/schema.js";
import { signToken } from "../src/middleware/auth.js";

const { db, reset } = setupRealDb();

beforeEach(async () => {
  await reset();
});

const buildApp = () => new Hono().route("/api/features", featuresRoute);

async function seedSystemAndTrail() {
  const [sys] = await db.insert(systems).values({ name: "Hocking", slug: "hocking" }).returning();
  const [tr] = await db
    .insert(trails)
    .values({
      name: "Buckeye",
      slug: "buckeye",
      geometry: "SRID=4326;MULTILINESTRING((-82.5 39.4, -82.6 39.5))",
    })
    .returning();
  return { system: sys, trail: tr };
}

async function seedUser() {
  const [u] = await db
    .insert(users)
    .values({ username: "tester", email: "t@example.com", passwordHash: "x" })
    .returning();
  return u;
}

async function seedPreset(extra: Partial<typeof presets.$inferInsert> = {}) {
  const [p] = await db
    .insert(presets)
    .values({
      key: "viewpoint",
      label: "Viewpoint",
      iconName: "eye",
      iconColor: "#000",
      category: "natural",
      questions: [
        { key: "panoramic", type: "boolean", label: "Panoramic?" },
      ],
      ...extra,
    })
    .returning();
  return p;
}

async function seedFeaturePoint(extra: Partial<typeof features.$inferInsert> = {}) {
  const [f] = await db
    .insert(features)
    .values({
      name: "Cedar Falls",
      typeTag: "viewpoint",
      point: "SRID=4326;POINT(-82.54 39.43)",
      ...extra,
    })
    .returning();
  return f;
}

describe("POST /api/features", () => {
  test("rejects unauthenticated requests with 401", async () => {
    const res = await buildApp().request("/api/features", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "x", point: { coordinates: [-82, 39] } }),
    });
    expect(res.status).toBe(401);
  });

  test("rejects invalid input with 400", async () => {
    const user = await seedUser();
    const token = await signToken({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      karma: 0,
      tier: "new",
    });
    const res = await buildApp().request("/api/features", {
      method: "POST",
      headers: { "x-forwarded-for": "127.0.0.1", "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: "" }), // missing point and either preset_id/type_tag
    });
    expect(res.status).toBe(400);
  });

  test("rejects when neither preset_id nor type_tag is provided", async () => {
    const user = await seedUser();
    const token = await signToken({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      karma: 0,
      tier: "new",
    });
    const res = await buildApp().request("/api/features", {
      method: "POST",
      headers: { "x-forwarded-for": "127.0.0.1", "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: "Cave",
        point: { type: "Point", coordinates: [-82.54, 39.43] },
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { message: string };
    expect(body.message).toMatch(/preset_id or type_tag/);
  });

  test("rejects when point is malformed (no coordinates)", async () => {
    const user = await seedUser();
    const token = await signToken({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      karma: 0,
      tier: "new",
    });
    const res = await buildApp().request("/api/features", {
      method: "POST",
      headers: { "x-forwarded-for": "127.0.0.1", "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: "x", type_tag: "viewpoint", point: {} }),
    });
    expect(res.status).toBe(400);
  });

  test("creates a feature with type_tag and stores a real point geometry", async () => {
    const user = await seedUser();
    const { system, trail } = await seedSystemAndTrail();
    const token = await signToken({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      karma: 0,
      tier: "new",
    });
    const res = await buildApp().request("/api/features", {
      method: "POST",
      headers: { "x-forwarded-for": "127.0.0.1", "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: "Cedar Falls",
        type_tag: "scenic_point",
        point: { type: "Point", coordinates: [-82.54, 39.43] },
        system_id: system.id,
        trail_id: trail.id,
        description: "Beautiful falls",
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      id: string;
      name: string;
      center: { lat: number; lon: number };
      type_tag: string;
    };
    expect(body.id).toBeDefined();
    expect(body.center.lat).toBeCloseTo(39.43, 4);
    expect(body.center.lon).toBeCloseTo(-82.54, 4);
    expect(body.type_tag).toBe("scenic_point");

    // Verify the row is actually in the database with the right
    // ST_X/ST_Y values.
    const stored = await db.select().from(features).where(eq(features.id, body.id));
    expect(stored[0]?.createdByUserId).toBe(user.id);
    expect(stored[0]?.systemId).toBe(system.id);
    expect(stored[0]?.trailId).toBe(trail.id);
  });

  test("creates a feature with preset_id and validates answers", async () => {
    const user = await seedUser();
    const preset = await seedPreset();
    const token = await signToken({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      karma: 0,
      tier: "new",
    });

    const ok = await buildApp().request("/api/features", {
      method: "POST",
      headers: { "x-forwarded-for": "127.0.0.1", "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: "Cedar Falls",
        preset_id: preset.id,
        point: { type: "Point", coordinates: [-82.54, 39.43] },
        answers: { panoramic: true },
      }),
    });
    expect(ok.status).toBe(201);
    const body = (await ok.json()) as { type_tag: string; preset_id: string };
    expect(body.preset_id).toBe(preset.id);
    // type_tag is synced from preset.key for legacy clients.
    expect(body.type_tag).toBe(preset.key);

    const bad = await buildApp().request("/api/features", {
      method: "POST",
      headers: { "x-forwarded-for": "127.0.0.1", "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: "Wrong type",
        preset_id: preset.id,
        point: { type: "Point", coordinates: [-82.54, 39.43] },
        answers: { panoramic: "not-a-boolean" },
      }),
    });
    expect(bad.status).toBe(400);
    const errBody = (await bad.json()) as { error: string };
    expect(errBody.error).toBe("invalid_answers");
  });

  test("rejects when preset_id is provided but the preset does not exist", async () => {
    const user = await seedUser();
    const token = await signToken({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      karma: 0,
      tier: "new",
    });
    const res = await buildApp().request("/api/features", {
      method: "POST",
      headers: { "x-forwarded-for": "127.0.0.1", "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: "x",
        preset_id: "00000000-0000-0000-0000-000000000099",
        point: { type: "Point", coordinates: [-82, 39] },
      }),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/features/:id", () => {
  test("returns 404 for an unknown id", async () => {
    const res = await buildApp().request(
      "/api/features/00000000-0000-0000-0000-000000000099",
    );
    expect(res.status).toBe(404);
  });

  test("returns the feature with lon/lat extracted from the geometry column", async () => {
    const f = await seedFeaturePoint();
    const res = await buildApp().request(`/api/features/${f.id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      center: { lat: number; lon: number };
      name: string;
    };
    expect(body.id).toBe(f.id);
    expect(body.center.lat).toBeCloseTo(39.43, 4);
    expect(body.center.lon).toBeCloseTo(-82.54, 4);
  });
});

describe("PUT /api/features/:id", () => {
  test("rejects invalid input", async () => {
    const f = await seedFeaturePoint();
    const res = await buildApp().request(`/api/features/${f.id}`, {
      method: "PUT",
      headers: { "x-forwarded-for": "127.0.0.1", "content-type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    expect(res.status).toBe(400);
  });

  test("rejects when no fields are provided", async () => {
    const f = await seedFeaturePoint();
    const res = await buildApp().request(`/api/features/${f.id}`, {
      method: "PUT",
      headers: { "x-forwarded-for": "127.0.0.1", "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { message: string };
    expect(body.message).toMatch(/no fields to update/);
  });

  test("updates name and description", async () => {
    const f = await seedFeaturePoint();
    const res = await buildApp().request(`/api/features/${f.id}`, {
      method: "PUT",
      headers: { "x-forwarded-for": "127.0.0.1", "content-type": "application/json" },
      body: JSON.stringify({ name: "Updated name", description: "new desc" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { name: string; description: string };
    expect(body.name).toBe("Updated name");
    expect(body.description).toBe("new desc");

    const stored = await db.select().from(features).where(eq(features.id, f.id));
    expect(stored[0]?.name).toBe("Updated name");
  });

  test("PUT does not support updating the point geometry (schema is strict)", async () => {
    // Documents a real limitation: `updateFeatureInputSchema` is `.strict()`,
    // so the `point` field that the route handler reads from `body?.point`
    // can never reach the route — the schema rejects it as an unknown
    // key. To update a feature's location, callers must delete and
    // re-create the feature. This test pins that contract.
    const f = await seedFeaturePoint();
    const res = await buildApp().request(`/api/features/${f.id}`, {
      method: "PUT",
      headers: { "x-forwarded-for": "127.0.0.1", "content-type": "application/json" },
      body: JSON.stringify({
        point: { type: "Point", coordinates: [-83.0, 40.0] },
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { details: { formErrors: string[] } };
    expect(body.details.formErrors.join(" ")).toMatch(/unrecognized.*point/i);
  });

  test("returns 404 when the feature does not exist", async () => {
    const res = await buildApp().request(
      "/api/features/00000000-0000-0000-0000-000000000099",
      {
        method: "PUT",
        headers: { "x-forwarded-for": "127.0.0.1", "content-type": "application/json" },
        body: JSON.stringify({ name: "x" }),
      },
    );
    expect(res.status).toBe(404);
  });

  test("validates answers against the resolved preset", async () => {
    const preset = await seedPreset();
    const f = await seedFeaturePoint({ presetId: preset.id });
    const res = await buildApp().request(`/api/features/${f.id}`, {
      method: "PUT",
      headers: { "x-forwarded-for": "127.0.0.1", "content-type": "application/json" },
      body: JSON.stringify({ answers: { panoramic: "not-a-boolean" } }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_answers");
  });
});

describe("DELETE /api/features/:id", () => {
  test("removes the feature row", async () => {
    const user = await seedUser();
    const token = await signToken({
      id: user.id, username: user.username, email: user.email, role: user.role, karma: 0, tier: "new",
    });
    const f = await seedFeaturePoint();
    const res = await buildApp().request(`/api/features/${f.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const after = await db.select().from(features).where(eq(features.id, f.id));
    expect(after.length).toBe(0);
  });
});
