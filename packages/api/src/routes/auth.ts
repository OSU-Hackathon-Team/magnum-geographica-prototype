import { Hono } from "hono";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import {
  registerRequestSchema,
  loginRequestSchema,
  userProfileSchema,
} from "@magnum/shared/schemas";
import { signToken, signRefreshToken, authRequired, type AuthUser } from "../middleware/auth.js";

type Variables = { user: AuthUser };

export const authRoute = new Hono<{ Variables: Variables }>();

function serializeUser(user: Record<string, unknown>) {
  const { passwordHash: _ph, createdAt, updatedAt, trustScore, displayName, ...rest } = user;
  return userProfileSchema.parse({
    ...rest,
    trust_score: trustScore ?? 0,
    display_name: displayName ?? null,
    created_at: createdAt instanceof Date ? createdAt.toISOString() : createdAt,
    updated_at: updatedAt instanceof Date ? updatedAt.toISOString() : updatedAt,
  });
}

authRoute.post("/register", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "invalid_input", message: "request body required" }, 400);
  const parsed = registerRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_input", message: parsed.error.issues[0]?.message ?? "validation failed", details: parsed.error.issues }, 400);
  }
  const { username, email, password, display_name } = parsed.data;

  const [existingByEmail, existingByUsername] = await Promise.all([
    db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1),
    db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1),
  ]);

  if (existingByEmail.length > 0) {
    return c.json({ error: "conflict", message: "email already registered" }, 409);
  }
  if (existingByUsername.length > 0) {
    return c.json({ error: "conflict", message: "username already taken" }, 409);
  }

  const passwordHash = await Bun.password.hash(password);

  const rows = await db
    .insert(users)
    .values({
      username,
      email,
      passwordHash,
      displayName: display_name ?? null,
    })
    .returning();

  const user = rows[0];
  if (!user) {
    return c.json({ error: "internal", message: "failed to create user" }, 500);
  }

  const accessToken = await signToken({
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role ?? "contributor",
    karma: Number(user.trustScore ?? 0),
    tier: ((user as { tier?: "new" | "established" | "trusted" | "moderator" }).tier ?? "new"),
  });
  const refreshToken = await signRefreshToken(user.id);

  return c.json(
    {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 900,
      user: serializeUser(user as unknown as Record<string, unknown>),
    },
    201,
  );
});

authRoute.post("/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "invalid_input", message: "request body required" }, 400);
  const parsed = loginRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_input", message: parsed.error.issues[0]?.message ?? "validation failed" }, 400);
  }
  const { email, password } = parsed.data;

  const results = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = results[0];
  if (!user) {
    return c.json({ error: "unauthorized", message: "invalid email or password" }, 401);
  }

  if (user.role === "banned") {
    return c.json({ error: "unauthorized", message: "account is banned" }, 403);
  }

  const valid = await Bun.password.verify(password, user.passwordHash);
  if (!valid) {
    return c.json({ error: "unauthorized", message: "invalid email or password" }, 401);
  }

  const accessToken = await signToken({
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role ?? "contributor",
    karma: Number(user.trustScore ?? 0),
    tier: ((user as { tier?: "new" | "established" | "trusted" | "moderator" }).tier ?? "new"),
  });
  const refreshToken = await signRefreshToken(user.id);

  return c.json({
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: 900,
    user: serializeUser(user as unknown as Record<string, unknown>),
  });
});

authRoute.post("/refresh", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.refresh_token) {
    return c.json({ error: "invalid_input", message: "refresh_token required" }, 400);
  }
  try {
    const { payload } = await import("jose").then((j) =>
      j.jwtVerify(
        body.refresh_token,
        new TextEncoder().encode(process.env.JWT_SECRET ?? process.env.ADMIN_SECRET ?? "dev-secret-change-me"),
      ),
    );
    if (payload.type !== "refresh" || !payload.sub) {
      return c.json({ error: "unauthorized", message: "invalid refresh token" }, 401);
    }

    const results = await db
      .select({ id: users.id, username: users.username, email: users.email, role: users.role })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);

    const user = results[0];
    if (!user) {
      return c.json({ error: "unauthorized", message: "user not found" }, 401);
    }

    const accessToken = await signToken({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role ?? "contributor",
      karma: Number((user as { trustScore?: number }).trustScore ?? 0),
      tier: ((user as { tier?: "new" | "established" | "trusted" | "moderator" }).tier ?? "new"),
    });
    return c.json({ access_token: accessToken, expires_in: 900 });
  } catch {
    return c.json({ error: "unauthorized", message: "invalid refresh token" }, 401);
  }
});

authRoute.get("/me", authRequired(), async (c) => {
  const authUser = c.get("user");
  const results = await db.select().from(users).where(eq(users.id, authUser.id)).limit(1);
  const user = results[0];
  if (!user) {
    return c.json({ error: "not_found", message: "user not found" }, 404);
  }
  return c.json(serializeUser(user as unknown as Record<string, unknown>));
});
