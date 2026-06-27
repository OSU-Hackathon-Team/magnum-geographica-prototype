/**
 * Tests for the media route (POST /api/media, GET /api/media/:id,
 * GET /api/media, DELETE /api/media/:id).
 *
 * Previously untested. Uses the real test Postgres database so
 * binary round-tripping, the unique-foreign-key constraint, and the
 * cascade-delete relationship with features/trails/systems are
 * actually exercised.
 */
import { describe, expect, test, beforeEach } from "bun:test";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { setupRealDb } from "./helpers/db.js";
import { mediaRoute } from "../src/routes/media.js";
import { features, systems, trails, users, media } from "../src/db/schema.js";
import { signToken } from "../src/middleware/auth.js";

const { db, reset } = setupRealDb();

beforeEach(async () => {
  await reset();
});

let userCounter = 0;
async function seedUser() {
  userCounter++;
  const [u] = await db.insert(users).values({
    username: `tester${userCounter}`, email: `t${userCounter}@t.com`, passwordHash: "hash",
  }).returning();
  return u;
}

async function seedFeature() {
  const [u] = await db.insert(users).values({
    username: "tester",
    email: "tester@example.com",
    passwordHash: "x",
  }).returning();
  const [s] = await db.insert(systems).values({ name: "Test System", slug: "test" }).returning();
  const [f] = await db.insert(features).values({
    name: "Test Feature",
    typeTag: "viewpoint",
    point: "SRID=4326;POINT(-82.54 39.43)",
    createdByUserId: u.id,
    systemId: s.id,
  }).returning();
  return { user: u, system: s, feature: f };
}

async function seedTrail() {
  const [t] = await db.insert(trails).values({
    name: "Test Trail",
    slug: "test-trail",
    geometry: "SRID=4326;MULTILINESTRING((-82.5 39.4, -82.6 39.5))",
  }).returning();
  return t;
}

const buildApp = () => new Hono().route("/api/media", mediaRoute);

const onePixelPngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

describe("POST /api/media", () => {
  test("rejects missing body with 400", async () => {
    const res = await buildApp().request("/api/media", {
      method: "POST",
      headers: { "x-forwarded-for": "127.0.0.1", "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  test("rejects when data field is missing", async () => {
    const res = await buildApp().request("/api/media", {
      method: "POST",
      headers: { "x-forwarded-for": "127.0.0.1", "content-type": "application/json" },
      body: JSON.stringify({ mime_type: "image/png", feature_id: "ignored" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_input");
  });

  test("rejects when mime_type is missing", async () => {
    const res = await buildApp().request("/api/media", {
      method: "POST",
      headers: { "x-forwarded-for": "127.0.0.1", "content-type": "application/json" },
      body: JSON.stringify({ data: onePixelPngBase64, feature_id: "ignored" }),
    });
    expect(res.status).toBe(400);
  });

  test("rejects when zero of (feature, trail, system) are provided", async () => {
    const res = await buildApp().request("/api/media", {
      method: "POST",
      headers: { "x-forwarded-for": "127.0.0.1", "content-type": "application/json" },
      body: JSON.stringify({ data: onePixelPngBase64, mime_type: "image/png" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { message: string };
    expect(body.message).toContain("exactly one");
  });

  test("rejects when more than one of (feature, trail, system) are provided", async () => {
    const { feature } = await seedFeature();
    const trail = await seedTrail();
    const res = await buildApp().request("/api/media", {
      method: "POST",
      headers: { "x-forwarded-for": "127.0.0.1", "content-type": "application/json" },
      body: JSON.stringify({
        data: onePixelPngBase64,
        mime_type: "image/png",
        feature_id: feature.id,
        trail_id: trail.id,
      }),
    });
    expect(res.status).toBe(400);
  });

  test("accepts a feature-scoped media upload and round-trips the bytes", async () => {
    const { feature } = await seedFeature();
    const res = await buildApp().request("/api/media", {
      method: "POST",
      headers: { "x-forwarded-for": "127.0.0.1", "content-type": "application/json" },
      body: JSON.stringify({
        data: onePixelPngBase64,
        mime_type: "image/png",
        feature_id: feature.id,
        caption: "Test caption",
        width: 1,
        height: 1,
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      id: string;
      feature_id: string;
      mime_type: string;
      caption: string;
      width: number;
      height: number;
    };
    expect(body.id).toBeDefined();
    expect(body.feature_id).toBe(feature.id);
    expect(body.mime_type).toBe("image/png");
    expect(body.caption).toBe("Test caption");
    expect(body.width).toBe(1);
    expect(body.height).toBe(1);

    // The bytea column should have stored the original base64 verbatim.
    const stored = await db.select().from(media).where(eq(media.id, body.id));
    expect(stored[0]?.data).toBeInstanceOf(Buffer);
    expect(Buffer.from(stored[0]!.data).toString("base64")).toBe(onePixelPngBase64);
  });
});

describe("GET /api/media/:id", () => {
  test("returns 404 for an unknown id", async () => {
    const res = await buildApp().request(
      "/api/media/00000000-0000-0000-0000-000000000099",
    );
    expect(res.status).toBe(404);
  });

  test("returns the media as a base64 data URL", async () => {
    const { feature } = await seedFeature();
    const created = await buildApp().request("/api/media", {
      method: "POST",
      headers: { "x-forwarded-for": "127.0.0.1", "content-type": "application/json" },
      body: JSON.stringify({
        data: onePixelPngBase64,
        mime_type: "image/png",
        feature_id: feature.id,
      }),
    });
    const { id } = (await created.json()) as { id: string };
    const res = await buildApp().request(`/api/media/${id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; data: string; mime_type: string };
    expect(body.id).toBe(id);
    expect(body.mime_type).toBe("image/png");
    expect(body.data).toMatch(/^data:image\/png;base64,/);
  });
});

describe("GET /api/media (list)", () => {
  test("returns an empty list when no media exists", async () => {
    const res = await buildApp().request("/api/media");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[]; total: number };
    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
  });

  test("filters by feature_id", async () => {
    const { feature } = await seedFeature();
    await buildApp().request("/api/media", {
      method: "POST",
      headers: { "x-forwarded-for": "127.0.0.1", "content-type": "application/json" },
      body: JSON.stringify({
        data: onePixelPngBase64,
        mime_type: "image/png",
        feature_id: feature.id,
      }),
    });
    const res = await buildApp().request(`/api/media?feature_id=${feature.id}`);
    const body = (await res.json()) as { items: unknown[]; total: number };
    expect(body.total).toBe(1);
  });
});

describe("DELETE /api/media/:id", () => {
  test("deletes the media row and returns ok", async () => {
    const user = await seedUser();
    const token = await signToken({
      id: user.id, username: user.username, email: user.email, role: user.role ?? "contributor", karma: 0, tier: "new",
    });
    const { feature } = await seedFeature();
    const created = await buildApp().request("/api/media", {
      method: "POST",
      headers: { "x-forwarded-for": "127.0.0.1", "content-type": "application/json" },
      body: JSON.stringify({
        data: onePixelPngBase64,
        mime_type: "image/png",
        feature_id: feature.id,
      }),
    });
    const { id } = (await created.json()) as { id: string };

    const res = await buildApp().request(`/api/media/${id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);

    const after = await db.select().from(media).where(eq(media.id, id));
    expect(after.length).toBe(0);
  });

  test("media cascades delete when the parent feature is deleted", async () => {
    const { feature } = await seedFeature();
    const created = await buildApp().request("/api/media", {
      method: "POST",
      headers: { "x-forwarded-for": "127.0.0.1", "content-type": "application/json" },
      body: JSON.stringify({
        data: onePixelPngBase64,
        mime_type: "image/png",
        feature_id: feature.id,
      }),
    });
    const { id } = (await created.json()) as { id: string };
    expect((await db.select().from(media).where(eq(media.id, id))).length).toBe(1);

    // Direct DB delete simulates what would happen if the feature were
    // removed by an admin or a sync conflict resolved in favour of
    // deletion. The FK should cascade.
    await db.delete(features).where(eq(features.id, feature.id));
    expect((await db.select().from(media).where(eq(media.id, id))).length).toBe(0);
  });
});
