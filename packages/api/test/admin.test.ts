import { describe, expect, test, beforeEach } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { setupRealDb } from "./helpers/db.js";
import { adminRoute } from "../src/routes/admin.js";
import { users, wikiPages, features } from "../src/db/schema.js";

const { db, reset } = setupRealDb();

beforeEach(async () => {
  await reset();
});

const buildApp = () => {
  const app = new Hono();
  app.route("/api/admin", adminRoute);
  return app;
};

const ADMIN_HEADERS = { "x-admin-secret": "dev-secret-change-me" };

describe("GET /api/admin/dashboard", () => {
  test("returns 401 without admin secret", async () => {
    const res = await buildApp().request("/api/admin/dashboard");
    expect(res.status).toBe(401);
  });

  test("returns dashboard stats with admin secret", async () => {
    const res = await buildApp().request("/api/admin/dashboard", {
      headers: ADMIN_HEADERS,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty("userCount");
    expect(body).toHaveProperty("revisionCount");
    expect(body).toHaveProperty("trailCount");
    expect(body).toHaveProperty("featureCount");
  });
});

describe("GET /api/admin/users", () => {
  test("returns user list", async () => {
    await db.insert(users).values({
      username: "hiker1",
      email: "hiker1@example.com",
      passwordHash: "hash",
    });

    const res = await buildApp().request("/api/admin/users", {
      headers: ADMIN_HEADERS,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ username: string }> };
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    expect(body.items.some((u) => u.username === "hiker1")).toBe(true);
  });
});

describe("POST /api/admin/users/:id/ban", () => {
  test("bans a user", async () => {
    const [u] = await db.insert(users).values({
      username: "toban",
      email: "ban@example.com",
      passwordHash: "hash",
    }).returning();

    const res = await buildApp().request(`/api/admin/users/${u!.id}/ban`, {
      method: "POST",
      headers: ADMIN_HEADERS,
    });
    expect(res.status).toBe(200);

    const stored = await db.select().from(users).where(
      eq(users.id, u!.id),
    );
    expect(stored[0]?.role).toBe("banned");
  });
});

describe("POST /api/admin/users/:id/unban", () => {
  test("unbans a user", async () => {
    const [u] = await db.insert(users).values({
      username: "tounban",
      email: "unban@example.com",
      passwordHash: "hash",
      role: "banned",
    }).returning();

    const res = await buildApp().request(`/api/admin/users/${u!.id}/unban`, {
      method: "POST",
      headers: ADMIN_HEADERS,
    });
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/admin/wiki-pages/:id", () => {
  test("deletes a wiki page", async () => {
    const [page] = await db.insert(wikiPages).values({
      targetType: "trail",
      targetId: "00000000-0000-0000-0000-000000000001",
      title: "Test Page",
      contentMd: "# test",
    }).returning();

    const res = await buildApp().request(`/api/admin/wiki-pages/${page!.id}`, {
      method: "DELETE",
      headers: ADMIN_HEADERS,
    });
    expect(res.status).toBe(200);

    const stored = await db.select().from(wikiPages).where(
      eq(wikiPages.id, page!.id),
    );
    expect(stored.length).toBe(0);
  });
});

describe("DELETE /api/admin/features/:id", () => {
  test("deletes a feature", async () => {
    const [feat] = await db.insert(features).values({
      name: "Test Feature",
      typeTag: "bench",
      point: sql`ST_SetSRID(ST_MakePoint(-82.5, 39.4), 4326)`,
    }).returning();

    const res = await buildApp().request(`/api/admin/features/${feat!.id}`, {
      method: "DELETE",
      headers: ADMIN_HEADERS,
    });
    expect(res.status).toBe(200);

    const stored = await db.select().from(features).where(
      eq(features.id, feat!.id),
    );
    expect(stored.length).toBe(0);
  });
});
