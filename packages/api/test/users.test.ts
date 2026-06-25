/**
 * Tests for the users route (GET /api/users/:id,
 * GET /api/users/:id/contributions, PUT /api/users/:id).
 *
 * Previously untested at the unit level. Uses the real test Postgres
 * database so password-hash redaction, contribution counting, and
 * authorization checks (self vs admin) are all exercised against
 * actual Drizzle queries.
 */
import { describe, expect, test, beforeEach } from "bun:test";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { setupRealDb } from "./helpers/db.js";
import { usersRoute } from "../src/routes/users.js";
import { users, revisions, systems } from "../src/db/schema.js";
import { signToken } from "../src/middleware/auth.js";

const { db, reset } = setupRealDb();

beforeEach(async () => {
  await reset();
});

const buildApp = () => new Hono().route("/api/users", usersRoute);

async function seedUser(extra: Partial<typeof users.$inferInsert> = {}) {
  const [u] = await db
    .insert(users)
    .values({
      username: "tester",
      email: "t@example.com",
      passwordHash: "hashed:secret",
      ...extra,
    })
    .returning();
  return u;
}

async function seedAdmin() {
  return seedUser({ username: "admin", email: "admin@example.com", role: "admin" });
}

describe("GET /api/users/:id", () => {
  test("returns 404 for an unknown id", async () => {
    const res = await buildApp().request(
      "/api/users/00000000-0000-0000-0000-000000000099",
    );
    expect(res.status).toBe(404);
  });

  test("returns the user with no password_hash leaked", async () => {
    const u = await seedUser({ displayName: "Hiker 42" });
    const res = await buildApp().request(`/api/users/${u.id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.id).toBe(u.id);
    expect(body.username).toBe("tester");
    expect(body.display_name).toBe("Hiker 42");
    expect(body.password_hash).toBeUndefined();
    expect(body.passwordHash).toBeUndefined();
  });

  test("includes contribution_count from the revisions table", async () => {
    const u = await seedUser();
    const [sys] = await db
      .insert(systems)
      .values({ name: "Hocking", slug: "hocking" })
      .returning();
    // Insert 3 revisions authored by this user.
    for (let i = 0; i < 3; i++) {
      await db.insert(revisions).values({
        authorId: u.id,
        contentMd: `edit ${i}`,
        action: "update",
        targetType: "system",
        targetId: sys.id,
      });
    }
    // And one by a different user — should not be counted.
    const other = await seedUser({
      username: "other",
      email: "o@example.com",
    });
    await db.insert(revisions).values({
      authorId: other.id,
      contentMd: "unrelated",
      action: "update",
      targetType: "system",
      targetId: sys.id,
    });

    const res = await buildApp().request(`/api/users/${u.id}`);
    const body = (await res.json()) as { contribution_count: number };
    expect(body.contribution_count).toBe(3);
  });
});

describe("GET /api/users/:id/contributions", () => {
  test("returns 200 with empty list when user has no revisions", async () => {
    const u = await seedUser();
    const res = await buildApp().request(`/api/users/${u.id}/contributions`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[]; total: number };
    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
  });

  test("paginates with page and pageSize", async () => {
    const u = await seedUser();
    const [sys] = await db
      .insert(systems)
      .values({ name: "Hocking", slug: "hocking" })
      .returning();
    for (let i = 0; i < 5; i++) {
      await db.insert(revisions).values({
        authorId: u.id,
        contentMd: `edit ${i}`,
        action: "update",
        targetType: "system",
        targetId: sys.id,
      });
    }

    const p1 = await buildApp().request(`/api/users/${u.id}/contributions?page=1&pageSize=2`);
    const p1Body = (await p1.json()) as { items: unknown[]; total: number; page: number; pageSize: number };
    expect(p1Body.items.length).toBe(2);
    expect(p1Body.total).toBe(5);
    expect(p1Body.page).toBe(1);
    expect(p1Body.pageSize).toBe(2);

    const p2 = await buildApp().request(`/api/users/${u.id}/contributions?page=2&pageSize=2`);
    const p2Body = (await p2.json()) as { items: unknown[] };
    expect(p2Body.items.length).toBe(2);

    const p3 = await buildApp().request(`/api/users/${u.id}/contributions?page=3&pageSize=2`);
    const p3Body = (await p3.json()) as { items: unknown[] };
    expect(p3Body.items.length).toBe(1);
  });

  test("clamps pageSize to 100 and page to min 1", async () => {
    const u = await seedUser();
    const res = await buildApp().request(
      `/api/users/${u.id}/contributions?page=0&pageSize=999`,
    );
    const body = (await res.json()) as { page: number; pageSize: number };
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(100);
  });
});

describe("PUT /api/users/:id", () => {
  test("returns 401 without a token", async () => {
    const u = await seedUser();
    const res = await buildApp().request(`/api/users/${u.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ display_name: "x" }),
    });
    expect(res.status).toBe(401);
  });

  test("returns 403 when a non-admin tries to update another user", async () => {
    const me = await seedUser();
    const other = await seedUser({ username: "other", email: "o@example.com" });
    const token = await signToken({
      id: me.id,
      username: me.username,
      email: me.email,
      role: me.role,
      karma: 0,
      tier: "new",
    });
    const res = await buildApp().request(`/api/users/${other.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ display_name: "evil" }),
    });
    expect(res.status).toBe(403);
  });

  test("allows a user to update their own display name", async () => {
    const me = await seedUser();
    const token = await signToken({
      id: me.id,
      username: me.username,
      email: me.email,
      role: me.role,
      karma: 0,
      tier: "new",
    });
    const res = await buildApp().request(`/api/users/${me.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ display_name: "New Display Name" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { display_name: string };
    expect(body.display_name).toBe("New Display Name");

    const stored = await db.select().from(users).where(eq(users.id, me.id));
    expect(stored[0]?.displayName).toBe("New Display Name");
  });

  test("allows an admin to update another user's display name", async () => {
    const admin = await seedAdmin();
    const other = await seedUser({ username: "other", email: "o@example.com" });
    const token = await signToken({
      id: admin.id,
      username: admin.username,
      email: admin.email,
      role: admin.role,
      karma: 9999,
      tier: "moderator",
    });
    const res = await buildApp().request(`/api/users/${other.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ display_name: "Edited by admin" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { display_name: string };
    expect(body.display_name).toBe("Edited by admin");
  });

  test("rejects an invalid username (special characters)", async () => {
    const me = await seedUser();
    const token = await signToken({
      id: me.id,
      username: me.username,
      email: me.email,
      role: me.role,
      karma: 0,
      tier: "new",
    });
    const res = await buildApp().request(`/api/users/${me.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ username: "has spaces" }),
    });
    expect(res.status).toBe(400);
  });

  test("rejects a username already taken by another user", async () => {
    const me = await seedUser();
    const other = await seedUser({ username: "taken-name", email: "x@example.com" });
    const token = await signToken({
      id: me.id,
      username: me.username,
      email: me.email,
      role: me.role,
      karma: 0,
      tier: "new",
    });
    const res = await buildApp().request(`/api/users/${me.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ username: other.username }),
    });
    expect(res.status).toBe(409);
  });

  test("allows a user to keep their own username (no conflict with self)", async () => {
    const me = await seedUser();
    const token = await signToken({
      id: me.id,
      username: me.username,
      email: me.email,
      role: me.role,
      karma: 0,
      tier: "new",
    });
    const res = await buildApp().request(`/api/users/${me.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ username: me.username, display_name: "Updated" }),
    });
    expect(res.status).toBe(200);
  });

  test("returns 404 when the target user does not exist (admin path)", async () => {
    const admin = await seedAdmin();
    const token = await signToken({
      id: admin.id,
      username: admin.username,
      email: admin.email,
      role: admin.role,
      karma: 9999,
      tier: "moderator",
    });
    const res = await buildApp().request(
      "/api/users/00000000-0000-0000-0000-000000000099",
      {
        method: "PUT",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ display_name: "x" }),
      },
    );
    expect(res.status).toBe(404);
  });
});
