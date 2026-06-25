import type { Context, MiddlewareHandler } from "hono";
import * as jose from "jose";

const JWT_SECRET_BYTES = new TextEncoder().encode(
  process.env.JWT_SECRET ?? process.env.ADMIN_SECRET ?? "dev-secret-change-me",
);
const JWT_ALG = "HS256";

export type TrustTier = "new" | "established" | "trusted" | "moderator";

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
 * Moderator-or-higher guard. Builds on `authRequired` (so the user
 * is on the context) and rejects anyone whose tier isn't at least
 * moderator. §21.6 phase 2 routes (synthesis, promote, premium
 * import) use this — the consensus is that synthesis actions are
 * moderator-level, not just authenticated.
 */
export function moderatorRequired(): MiddlewareHandler {
  return async (c: Context, next) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "unauthorized", message: "authentication required" }, 401);
    }
    if (user.tier !== "moderator") {
      return c.json(
        { error: "forbidden", message: "moderator tier required" },
        403,
      );
    }
    await next();
  };
}
