import { Hono } from "hono";
import { desc, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { revisions } from "../db/schema.js";
import { adminOnly } from "../middleware/auth.js";

export const revisionsRoute = new Hono();

const baseRevisionSelect = {
  id: revisions.id,
  wiki_page_id: revisions.wikiPageId,
  content_md: revisions.contentMd,
  contributor_name: revisions.contributorName,
  author_id: revisions.authorId,
  edit_summary: revisions.editSummary,
  created_at: revisions.createdAt,
} as const;

revisionsRoute.get("/recent", adminOnly(), async (c) => {
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const pageSize = Math.min(50, Math.max(1, Number(c.req.query("pageSize") ?? 20)));
  const offset = (page - 1) * pageSize;

  const [items, totalRow] = await Promise.all([
    db
      .select(baseRevisionSelect)
      .from(revisions)
      .orderBy(desc(revisions.createdAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(revisions),
  ]);

  return c.json({ items, total: totalRow[0]?.count ?? 0, page, pageSize });
});
