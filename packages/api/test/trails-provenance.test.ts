/**
 * Real-DB tests for trail provenance and the new PUT / DELETE endpoints.
 * Uses the real Postgres+PostGIS test database.
 */
import { describe, expect, test, beforeEach } from "bun:test";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { setupRealDb } from "./helpers/db.js";
import { trailsRoute } from "../src/routes/trails.js";
import { trails, trailSystems, users } from "../src/db/schema.js";
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

const TEST_MOD = {
  id: "00000000-0000-4000-a000-000000000098",
  username: "moderator",
  email: "mod@test.com",
  role: "moderator",
  karma: 999,
  tier: "moderator" as const,
};

let authToken: string;
let modToken: string;

beforeEach(async () => {
  await reset();
  // Seed test users so FK constraints are satisfied.
  await db.insert(users).values([
    { id: TEST_USER.id, username: TEST_USER.username, email: TEST_USER.email, passwordHash: "x" },
    { id: TEST_MOD.id, username: TEST_MOD.username, email: TEST_MOD.email, passwordHash: "x" },
  ]);
  authToken = await signToken(TEST_USER);
  modToken = await signToken(TEST_MOD);
});

const buildApp = () => new Hono().route("/api/trails", trailsRoute);

async function seedTrail(extra: Partial<typeof trails.$inferInsert> = {}) {
  const [t] = await db
    .insert(trails)
    .values({
      name: "Buckeye",
      slug: "buckeye",
      geometry: "SRID=4326;MULTILINESTRING((-82.5 39.4, -82.6 39.5))",
      ...extra,
    })
    .returning();
  return t;
}

describe("PUT /api/trails/:id", () => {
  test("updates name", async () => {
    const t = await seedTrail();
    const res = await buildApp().request(`/api/trails/${t.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ name: "Updated Name" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { name: string };
    expect(body.name).toBe("Updated Name");
  });

  test("updates description to null", async () => {
    const t = await seedTrail({ description: "old description" });
    const res = await buildApp().request(`/api/trails/${t.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ description: null }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { description: string | null };
    expect(body.description).toBeNull();
  });

  test("updates difficulty", async () => {
    const t = await seedTrail();
    const res = await buildApp().request(`/api/trails/${t.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ difficulty: "hard" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { difficulty: string };
    expect(body.difficulty).toBe("hard");
  });

  test("updates provenance fields", async () => {
    const t = await seedTrail();
    const res = await buildApp().request(`/api/trails/${t.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: `Bearer ${authToken}` },
      body: JSON.stringify({
        source: "NPS",
        source_date: "2024-01-01",
        external_url: "https://example.com/trail",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { source: string; source_date: string; external_url: string };
    expect(body.source).toBe("NPS");
    expect(body.source_date).toBe("2024-01-01");
    expect(body.external_url).toBe("https://example.com/trail");
  });

  test("rejects empty patch via 400", async () => {
    const t = await seedTrail();
    const res = await buildApp().request(`/api/trails/${t.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: `Bearer ${authToken}` },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  test("returns 404 for unknown trail", async () => {
    const res = await buildApp().request(
      "/api/trails/00000000-0000-0000-0000-000000000099",
      {
        method: "PUT",
        headers: { "content-type": "application/json", authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ name: "Nope" }),
      },
    );
    expect(res.status).toBe(404);
  });

  test("returns 401 without auth", async () => {
    const t = await seedTrail();
    const res = await buildApp().request(`/api/trails/${t.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "X" }),
    });
    expect(res.status).toBe(401);
  });

  test("response includes tier and provenance", async () => {
    const t = await seedTrail({ source: "USFS" });
    const res = await buildApp().request(`/api/trails/${t.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ source: "NPS" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tier: string; source: string };
    expect(body.tier).toBe("synthesized");
    expect(body.source).toBe("NPS");
  });
});

describe("DELETE /api/trails/:id", () => {
  test("deletes a synthesized trail", async () => {
    const t = await seedTrail();
    const res = await buildApp().request(`/api/trails/${t.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.status).toBe(200);
    const stored = await db.select().from(trails).where(eq(trails.id, t.id));
    expect(stored.length).toBe(0);
  });

  test("deletes an elevated trail", async () => {
    const t = await seedTrail({ tier: "elevated" });
    const res = await buildApp().request(`/api/trails/${t.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.status).toBe(200);
  });

  test("returns 403 when non-moderator deletes a premium trail", async () => {
    const t = await seedTrail({ tier: "premium" });
    const res = await buildApp().request(`/api/trails/${t.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${authToken}` }, // regular user
    });
    expect(res.status).toBe(403);
  });

  test("moderator can delete premium trail", async () => {
    const t = await seedTrail({ tier: "premium" });
    const res = await buildApp().request(`/api/trails/${t.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${modToken}` },
    });
    expect(res.status).toBe(200);
  });

  test("returns 404 for unknown trail", async () => {
    const res = await buildApp().request(
      "/api/trails/00000000-0000-0000-0000-000000000099",
      { method: "DELETE", headers: { authorization: `Bearer ${authToken}` } },
    );
    expect(res.status).toBe(404);
  });

  test("returns 401 without auth", async () => {
    const t = await seedTrail();
    const res = await buildApp().request(`/api/trails/${t.id}`, { method: "DELETE" });
    expect(res.status).toBe(401);
  });
});

describe("GET endpoints emit tier and provenance", () => {
  test("GET /api/trails/:id returns tier", async () => {
    const t = await seedTrail({ tier: "premium", source: "NPS" });
    const res = await buildApp().request(`/api/trails/${t.id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tier: string; source: string };
    expect(body.tier).toBe("premium");
    expect(body.source).toBe("NPS");
  });

  test("GET /api/trails returns tier in list items", async () => {
    await seedTrail({ tier: "premium" });
    await seedTrail({ slug: "other", tier: "elevated" });
    const res = await buildApp().request("/api/trails");
    const body = (await res.json()) as { items: Array<{ tier: string }>; total: number };
    expect(body.total).toBe(2);
    const tiers = body.items.map((i) => i.tier);
    expect(tiers).toContain("premium");
    expect(tiers).toContain("elevated");
  });
});
