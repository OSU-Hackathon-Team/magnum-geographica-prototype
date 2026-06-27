import type { Context, MiddlewareHandler } from "hono";
import * as jose from "jose";
import { readClientIp } from "../services/identity.js";
import type { TrustTier } from "@magnum/shared/constants";

const JWT_SECRET_BYTES = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "dev-secret-change-me",
);
const JWT_ALG = "HS256";

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: string;
  karma: number;
  tier: TrustTier;
}

async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jose.jwtVerify<AuthUser & jose.JWTPayload>(token, JWT_SECRET_BYTES);
    return {
      id: payload.id,
      username: payload.username,
      email: payload.email,
      role: payload.role,
      karma: typeof payload.karma === "number" ? payload.karma : 0,
      tier: (payload.tier as TrustTier) ?? "new",
    };
  } catch {
    return null;
  }
}

export async function signToken(user: AuthUser): Promise<string> {
  return new jose.SignJWT({
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    karma: user.karma,
    tier: user.tier,
  } as AuthUser & jose.JWTPayload)
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(JWT_SECRET_BYTES);
}

export async function signRefreshToken(userId: string): Promise<string> {
  return new jose.SignJWT({ sub: userId, type: "refresh" })
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(JWT_SECRET_BYTES);
}

export function authRequired(): MiddlewareHandler {
  return async (c: Context, next) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return c.json({ error: "unauthorized", message: "authentication required" }, 401);
    }
    const token = authHeader.slice(7);
    const user = await verifyToken(token);
    if (!user) {
      return c.json({ error: "unauthorized", message: "invalid or expired token" }, 401);
    }
    c.set("user", user);
    await next();
  };
}

/**
 * Optional auth: verifies Bearer token if present and sets `c.get("user")`,
 * but never returns 401. Always continues to the next handler so routes
 * can accept both authenticated and IP-attributed requests.
 */
export function optionalAuth(): MiddlewareHandler {
  return async (c: Context, next) => {
    const authHeader = c.req.header("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const user = await verifyToken(token);
      if (user) {
        c.set("user", user);
      }
    }
    await next();
  };
}

/**
 * Requires a resolvable actor: either an authenticated user (set by
 * optionalAuth or authRequired) or an identifiable IP address.
 * Returns 401 only if neither is present — i.e. the request is from an
 * unresolvable source with no token. This replaces authRequired on
 * content-edit routes so IP users (Wikipedia-style) can contribute.
 */
export function actorRequired(): MiddlewareHandler {
  return async (c: Context, next) => {
    const user = c.get("user");
    if (user) {
      await next();
      return;
    }
    const ip = readClientIp(c);
    if (!ip || ip === "0.0.0.0") {
      return c.json(
        { error: "unauthorized", message: "login or identifiable IP required" },
        401,
      );
    }
    await next();
  };
}

export function adminOnly(): MiddlewareHandler {
  return async (c: Context, next) => {
    const authHeader = c.req.header("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const user = await verifyToken(token);
      if (user?.role === "admin" || user?.role === "moderator") {
        c.set("user", user);
        await next();
        return;
      }
    }
    const required = process.env.ADMIN_SECRET ?? "dev-secret-change-me";
    const provided = c.req.header("x-admin-secret");
    if (provided && provided === required) {
      await next();
      return;
    }
    return c.json({ error: "unauthorized", message: "admin access required" }, 401);
  };
}

/**
 * Moderator-or-higher guard. Self-contained: performs its own
 * Bearer-token verification and rejects anyone whose tier isn't at
 * least moderator. Does not depend on authRequired being called first.
 */
export function moderatorRequired(): MiddlewareHandler {
  return async (c: Context, next) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return c.json({ error: "unauthorized", message: "authentication required" }, 401);
    }
    const token = authHeader.slice(7);
    const user = await verifyToken(token);
    if (!user) {
      return c.json({ error: "unauthorized", message: "invalid or expired token" }, 401);
    }
    c.set("user", user);
    if (user.tier !== "moderator") {
      return c.json(
        { error: "forbidden", message: "moderator tier required" },
        403,
      );
    }
    await next();
  };
}
