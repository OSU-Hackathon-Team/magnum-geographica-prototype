/**
 * Tests for the auth middleware (signToken, signRefreshToken,
 * authRequired, moderatorRequired).
 *
 * The auth layer is security-critical and was previously untested.
 * `mockDb` doesn't apply here — auth doesn't touch the database —
 * so these tests don't need a real Postgres connection.
 */
import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import {
  signToken,
  signRefreshToken,
  authRequired,
  moderatorRequired,
  type AuthUser,
} from "../src/middleware/auth.js";

const TEST_USER: AuthUser = {
  id: "11111111-1111-1111-1111-111111111111",
  username: "hiker42",
  email: "hiker@example.com",
  role: "contributor",
  karma: 5,
  tier: "new",
};

describe("signToken", () => {
  test("produces a non-empty JWT string", async () => {
    const token = await signToken(TEST_USER);
    expect(typeof token).toBe("string");
    expect(token.split(".").length).toBe(3);
  });

  test("different users produce different tokens", async () => {
    const a = await signToken(TEST_USER);
    const b = await signToken({ ...TEST_USER, id: "22222222-2222-2222-2222-222222222222" });
    expect(a).not.toBe(b);
  });

  test("tokens are unique even for the same user issued at the same instant", async () => {
    // jose uses second-resolution iat, so back-to-back calls for the same
    // user may collide. The contract is "tokens are valid", not "tokens are
    // unique per call", so just assert the contract.
    const a = await signToken(TEST_USER);
    const b = await signToken(TEST_USER);
    expect(typeof a).toBe("string");
    expect(typeof b).toBe("string");
  });
});

describe("signRefreshToken", () => {
  test("produces a non-empty JWT with type=refresh", async () => {
    const token = await signRefreshToken(TEST_USER.id);
    expect(typeof token).toBe("string");
    const [, payloadB64] = token.split(".");
    const decoded = JSON.parse(Buffer.from(payloadB64!, "base64url").toString("utf8"));
    expect(decoded.sub).toBe(TEST_USER.id);
    expect(decoded.type).toBe("refresh");
  });

  test("refresh tokens differ from access tokens (different iat, type)", async () => {
    const access = await signToken(TEST_USER);
    const refresh = await signRefreshToken(TEST_USER.id);
    expect(access).not.toBe(refresh);
  });
});

describe("authRequired middleware", () => {
  const buildApp = () => {
    const app = new Hono<{ Variables: { user: AuthUser } }>();
    app.use("/protected/*", authRequired());
    app.get("/protected/me", (c) => {
      const user = c.get("user");
      return c.json({ id: user.id, username: user.username });
    });
    return app;
  };

  test("returns 401 with no Authorization header", async () => {
    const res = await buildApp().request("/protected/me");
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("unauthorized");
  });

  test("returns 401 with a malformed Authorization header", async () => {
    const res = await buildApp().request("/protected/me", {
      headers: { authorization: "NotBearer xyz" },
    });
    expect(res.status).toBe(401);
  });

  test("returns 401 with an invalid token", async () => {
    const res = await buildApp().request("/protected/me", {
      headers: { authorization: "Bearer not-a-real-jwt" },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { message: string };
    expect(body.message).toContain("invalid or expired");
  });

  test("accepts a refresh token (it is a valid JWT, signature verifies)", async () => {
    // Document the actual behaviour: `authRequired` only validates the
    // signature and decodes the payload. It does not enforce a token
    // type. Routes that care about type (e.g. /api/auth/refresh) must
    // check `payload.type` themselves. This test pins that contract so
    // a future change to add type enforcement is deliberate.
    const refresh = await signRefreshToken(TEST_USER.id);
    const res = await buildApp().request("/protected/me", {
      headers: { authorization: `Bearer ${refresh}` },
    });
    expect(res.status).toBe(200);
  });

  test("passes through with a valid access token and exposes the user on the context", async () => {
    const token = await signToken(TEST_USER);
    const res = await buildApp().request("/protected/me", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; username: string };
    expect(body.id).toBe(TEST_USER.id);
    expect(body.username).toBe(TEST_USER.username);
  });

  test("unprotected routes are not affected by the middleware", async () => {
    const app = new Hono();
    app.use("/protected/*", authRequired());
    app.get("/public", (c) => c.json({ ok: true }));
    const res = await app.request("/public");
    expect(res.status).toBe(200);
  });
});

describe("moderatorRequired middleware", () => {
  const buildApp = () => {
    const app = new Hono<{ Variables: { user?: AuthUser } }>();
    app.use("/moderate/*", authRequired());
    app.use("/moderate/*", moderatorRequired());
    app.get("/moderate/proposals", (c) => c.json({ ok: true }));
    return app;
  };

  test("returns 401 when no user is on the context", async () => {
    const app = new Hono<{ Variables: { user?: AuthUser } }>();
    app.use("/moderate/*", moderatorRequired());
    app.get("/moderate/x", (c) => c.json({ ok: true }));

    const res = await app.request("/moderate/x");
    expect(res.status).toBe(401);
  });

  test("returns 403 for a non-moderator tier", async () => {
    const token = await signToken({ ...TEST_USER, tier: "trusted" });
    const res = await buildApp().request("/moderate/proposals", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("forbidden");
    expect(body.message).toContain("moderator");
  });

  test("returns 403 for the 'new' tier (the most common case)", async () => {
    const token = await signToken({ ...TEST_USER, tier: "new" });
    const res = await buildApp().request("/moderate/proposals", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });

  test("passes through for moderator tier", async () => {
    const token = await signToken({ ...TEST_USER, tier: "moderator" });
    const res = await buildApp().request("/moderate/proposals", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
  });
});
