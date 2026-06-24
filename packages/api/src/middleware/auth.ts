import type { Context, MiddlewareHandler } from "hono";
import * as jose from "jose";

const JWT_SECRET_BYTES = new TextEncoder().encode(
  process.env.JWT_SECRET ?? process.env.ADMIN_SECRET ?? "dev-secret-change-me",
);
const JWT_ALG = "HS256";

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: string;
}

async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jose.jwtVerify<AuthUser & jose.JWTPayload>(token, JWT_SECRET_BYTES);
    return { id: payload.id, username: payload.username, email: payload.email, role: payload.role };
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
