import { Hono } from "hono";
import { db } from "../db/index.js";
import { users, revisions } from "../db/schema.js";
import { eq, and, desc, sql } from "drizzle-orm";
import { userProfileSchema, userUpdateSchema } from "@magnum/shared/schemas";
import { authRequired, type AuthUser } from "../middleware/auth.js";

type Variables = { user: AuthUser };

export const usersRoute = new Hono<{ Variables: Variables }>();

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

async function getUserWithContributions(id: string) {
  const [userResult, contribCount] = await Promise.all([
    db.select().from(users).where(eq(users.id, id)).limit(1),
    db
      .select({ count: sql<number>`count(*)` })
      .from(revisions)
      .where(eq(revisions.authorId, id)),
  ]);

  const user = userResult[0];
  if (!user) return null;
  return {
    ...serializeUser(user as unknown as Record<string, unknown>),
    contribution_count: Number(contribCount[0]?.count ?? 0),
  };
}

usersRoute.get("/:id", async (c) => {
  const id = c.req.param("id");
  const result = await getUserWithContributions(id);
  if (!result) {
    return c.json({ error: "not_found", message: "user not found" }, 404);
  }
  return c.json(result);
});

usersRoute.get("/:id/contributions", async (c) => {
  const id = c.req.param("id");
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(c.req.query("pageSize") ?? "20", 10)));
  const offset = (page - 1) * pageSize;

  const [items, total] = await Promise.all([
    db
      .select()
      .from(revisions)
      .where(eq(revisions.authorId, id))
      .orderBy(desc(revisions.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(revisions)
      .where(eq(revisions.authorId, id)),
  ]);

  return c.json({
    items,
    total: Number(total[0]?.count ?? 0),
    page,
    pageSize,
  });
});

usersRoute.put("/:id", authRequired(), async (c) => {
  const authUser = c.get("user");
  const targetId = c.req.param("id");
  if (authUser.id !== targetId) {
    const currentUserRows = await db.select().from(users).where(eq(users.id, authUser.id)).limit(1);
    const currentUser = currentUserRows[0];
    const isAdmin = currentUser?.role === "admin" || currentUser?.role === "moderator";
    if (!isAdmin) {
      return c.json({ error: "unauthorized", message: "cannot update another user" }, 403);
    }
  }
  const body = await c.req.json().catch(() => null);
  const parsed = userUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", message: parsed.error.issues[0]?.message ?? "validation failed" },
      400,
    );
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.display_name !== undefined) updates.displayName = parsed.data.display_name;
  if (parsed.data.username !== undefined) {
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.username, parsed.data.username), sql`${users.id} != ${targetId}`))
      .limit(1);
    if (existing.length > 0) {
      return c.json({ error: "conflict", message: "username already taken" }, 409);
    }
    updates.username = parsed.data.username as string;
  }

  const updatedRows = await db
    .update(users)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(users.id, targetId))
    .returning();

  const updated = updatedRows[0];
  if (!updated) return c.json({ error: "not_found", message: "user not found" }, 404);

  return c.json(serializeUser(updated as unknown as Record<string, unknown>));
});
