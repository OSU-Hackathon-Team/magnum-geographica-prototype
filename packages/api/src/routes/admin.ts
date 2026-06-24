import { Hono } from "hono";
import { db } from "../db/index.js";
import { users, revisions, wikiPages, features } from "../db/schema.js";
import { eq, desc, and, sql, like, or } from "drizzle-orm";
import { adminOnly } from "../middleware/auth.js";
import { rateLimit, strictRateLimit } from "../middleware/rate-limit.js";

export const adminRoute = new Hono();

adminRoute.use("*", adminOnly());
adminRoute.use("*", strictRateLimit());

adminRoute.get("/revisions", async (c) => {
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(c.req.query("pageSize") ?? "30", 10)));
  const offset = (page - 1) * pageSize;
  const userId = c.req.query("userId");
  const targetType = c.req.query("targetType");

  const conditions = [];
  if (userId) conditions.push(eq(revisions.authorId, userId));
  if (targetType) {
    conditions.push(
      sql`${revisions.wikiPageId} IN (SELECT id FROM ${wikiPages} WHERE target_type = ${targetType})`,
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, total] = await Promise.all([
    db
      .select({
        id: revisions.id,
        wiki_page_id: revisions.wikiPageId,
        content_md: revisions.contentMd,
        contributor_name: revisions.contributorName,
        author_id: revisions.authorId,
        edit_summary: revisions.editSummary,
        created_at: revisions.createdAt,
        target_type: wikiPages.targetType,
        target_id: wikiPages.targetId,
      })
      .from(revisions)
      .leftJoin(wikiPages, eq(revisions.wikiPageId, wikiPages.id))
      .where(where)
      .orderBy(desc(revisions.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(revisions)
      .leftJoin(wikiPages, eq(revisions.wikiPageId, wikiPages.id))
      .where(where),
  ]);

  return c.json({
    items,
    total: Number(total[0]?.count ?? 0),
    page,
    pageSize,
  });
});

adminRoute.post("/revisions/:id/revert", async (c) => {
  const revisionId = c.req.param("id");
  const [revision] = await db
    .select()
    .from(revisions)
    .where(eq(revisions.id, revisionId))
    .limit(1);

  if (!revision) {
    return c.json({ error: "not_found", message: "revision not found" }, 404);
  }

  const [page] = await db
    .select()
    .from(wikiPages)
    .where(eq(wikiPages.id, revision.wikiPageId))
    .limit(1);

  if (!page) {
    return c.json({ error: "not_found", message: "wiki page not found" }, 404);
  }

  await db
    .update(wikiPages)
    .set({ contentMd: revision.contentMd, updatedAt: new Date() })
    .where(eq(wikiPages.id, page.id));

  await db.insert(revisions).values({
    wikiPageId: page.id,
    contentMd: revision.contentMd,
    contributorName: "admin-restore",
    editSummary: `Admin revert to revision ${revisionId}`,
    createdAt: new Date(),
  });

  return c.json({ ok: true });
});

adminRoute.delete("/wiki-pages/:id", async (c) => {
  const id = c.req.param("id");
  await db.delete(wikiPages).where(eq(wikiPages.id, id));
  return c.json({ ok: true });
});

adminRoute.delete("/features/:id", async (c) => {
  const id = c.req.param("id");
  await db.delete(features).where(eq(features.id, id));
  return c.json({ ok: true });
});

adminRoute.get("/users", async (c) => {
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(c.req.query("pageSize") ?? "20", 10)));
  const offset = (page - 1) * pageSize;
  const q = c.req.query("q");

  const conditions = [];
  if (q) conditions.push(or(like(users.username, `%${q}%`), like(users.email, `%${q}%`)));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, total] = await Promise.all([
    db
      .select({
        id: users.id,
        username: users.username,
        display_name: users.displayName,
        email: users.email,
        role: users.role,
        trust_score: users.trustScore,
        created_at: users.createdAt,
      })
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(where),
  ]);

  return c.json({
    items,
    total: Number(total[0]?.count ?? 0),
    page,
    pageSize,
  });
});

adminRoute.post("/users/:id/ban", async (c) => {
  const id = c.req.param("id");
  await db.update(users).set({ role: "banned", updatedAt: new Date() }).where(eq(users.id, id));
  return c.json({ ok: true });
});

adminRoute.post("/users/:id/unban", async (c) => {
  const id = c.req.param("id");
  await db.update(users).set({ role: "contributor", updatedAt: new Date() }).where(eq(users.id, id));
  return c.json({ ok: true });
});

adminRoute.get("/dashboard", async (c) => {
  const [userCount, revCount, trailCount, featureCount] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(users),
    db.select({ count: sql<number>`count(*)` }).from(revisions),
    db.select({ count: sql<number>`count(*)` }).from(sql`trails`),
    db.select({ count: sql<number>`count(*)` }).from(features),
  ]);

  return c.json({
    userCount: Number(userCount[0]?.count ?? 0),
    revisionCount: Number(revCount[0]?.count ?? 0),
    trailCount: Number(trailCount[0]?.count ?? 0),
    featureCount: Number(featureCount[0]?.count ?? 0),
  });
});
