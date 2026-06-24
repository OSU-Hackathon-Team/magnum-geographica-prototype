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
const { authRoute } = await import("../src/routes/auth.js");

const buildApp = () => {
  const app = new Hono();
  app.route("/api/auth", authRoute);
  return app;
};

describe("POST /api/auth/register", () => {
  test("rejects missing body", async () => {
    const res = await buildApp().request("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  test("rejects short password", async () => {
    const res = await buildApp().request("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "testuser",
        email: "test@example.com",
        password: "short",
      }),
    });
    expect(res.status).toBe(400);
  });

  test("rejects duplicate email", async () => {
    state.users.push({
      id: "00000000-0000-0000-0000-000000000001",
      username: "existing",
      email: "test@example.com",
      password_hash: "hashed",
      role: "contributor",
    });

    const res = await buildApp().request("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "newuser",
        email: "test@example.com",
        password: "password123",
      }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("conflict");
  });

  test("registers successfully and returns tokens", async () => {
    state.users.length = 0;
    state.insertCalls.length = 0;

    const res = await buildApp().request("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "hiker42",
        email: "hiker@example.com",
        password: "securepass123",
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.access_token).toBeDefined();
    expect(body.refresh_token).toBeDefined();
    expect(body.expires_in).toBe(900);
    expect(body.user).toBeDefined();
    expect(body.user.username).toBe("hiker42");
    expect(body.user.email).toBe("hiker@example.com");

    // Verify DB insert
    expect(state.insertCalls.length).toBe(1);
    const insertCall = state.insertCalls[0];
    expect(insertCall?.table).toBe("users");
    expect((insertCall?.values as Record<string, unknown>)?.username).toBe("hiker42");
  });
});

describe("POST /api/auth/login", () => {
  test("rejects missing body", async () => {
    const res = await buildApp().request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  test("rejects unknown email", async () => {
    state.users.length = 0;
    const res = await buildApp().request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "nobody@example.com",
        password: "password123",
      }),
    });
    expect(res.status).toBe(401);
  });

  test("returns 403 for banned user", async () => {
    state.users.length = 0;
    state.users.push({
      id: "00000000-0000-0000-0000-000000000001",
      username: "banneduser",
      email: "banned@example.com",
      password_hash: "not-checked-for-banned",
      role: "banned",
    });

    const res = await buildApp().request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "banned@example.com",
        password: "password123",
      }),
    });
    expect(res.status).toBe(403);
  });
});

describe("GET /api/auth/me", () => {
  test("returns 401 without token", async () => {
    const res = await buildApp().request("/api/auth/me");
    expect(res.status).toBe(401);
  });
});
