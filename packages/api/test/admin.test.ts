import { describe, expect, test } from "bun:test";
import { mock } from "bun:test";
import { createMockDb } from "./helpers/mockDb.js";

const { db, state } = createMockDb();

mock.module("../src/db/index.js", () => ({
  db,
  pool: { end: () => Promise.resolve() },
  schema: {},
}));

const { Hono } = await import("hono");
const { adminRoute } = await import("../src/routes/admin.js");

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
    state.executeRouter.length = 0;
    state.executeRouter.push({ match: "count(*)", rows: [{ count: 5 }] });
    state.executeRouter.push({ match: "count(*)", rows: [{ count: 42 }] });
    state.executeRouter.push({ match: "count(*)", rows: [{ count: 15 }] });
    state.executeRouter.push({ match: "count(*)", rows: [{ count: 8 }] });

    const res = await buildApp().request("/api/admin/dashboard", {
      headers: ADMIN_HEADERS,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("userCount");
    expect(body).toHaveProperty("revisionCount");
    expect(body).toHaveProperty("trailCount");
    expect(body).toHaveProperty("featureCount");
  });
});

describe("GET /api/admin/users", () => {
  test("returns user list", async () => {
    state.users.length = 0;
    state.users.push({
      id: "00000000-0000-0000-0000-000000000001",
      username: "hiker1",
      email: "hiker1@example.com",
      role: "contributor",
      trust_score: 0.5,
      display_name: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });

    state.executeRouter.length = 0;
    state.executeRouter.push({ match: "count(*)", rows: [{ count: 1 }] });

    const res = await buildApp().request("/api/admin/users", {
      headers: ADMIN_HEADERS,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items.length).toBe(1);
    expect(body.items[0].username).toBe("hiker1");
  });
});

describe("POST /api/admin/users/:id/ban", () => {
  test("bans a user", async () => {
    state.updateCalls.length = 0;
    const res = await buildApp().request("/api/admin/users/00000000-0000-0000-0000-000000000001/ban", {
      method: "POST",
      headers: ADMIN_HEADERS,
    });
    expect(res.status).toBe(200);
    expect(state.updateCalls.length).toBe(1);
    expect(state.updateCalls[0]?.table).toBe("users");
  });
});

describe("POST /api/admin/users/:id/unban", () => {
  test("unbans a user", async () => {
    state.updateCalls.length = 0;
    const res = await buildApp().request("/api/admin/users/00000000-0000-0000-0000-000000000001/unban", {
      method: "POST",
      headers: ADMIN_HEADERS,
    });
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/admin/wiki-pages/:id", () => {
  test("deletes a wiki page", async () => {
    state.deleteCalls.length = 0;
    const res = await buildApp().request("/api/admin/wiki-pages/test-page-id", {
      method: "DELETE",
      headers: ADMIN_HEADERS,
    });
    expect(res.status).toBe(200);
    expect(state.deleteCalls.length).toBe(1);
  });
});

describe("DELETE /api/admin/features/:id", () => {
  test("deletes a feature", async () => {
    state.deleteCalls.length = 0;
    const res = await buildApp().request("/api/admin/features/test-feature-id", {
      method: "DELETE",
      headers: ADMIN_HEADERS,
    });
    expect(res.status).toBe(200);
    expect(state.deleteCalls.length).toBe(1);
  });
});
