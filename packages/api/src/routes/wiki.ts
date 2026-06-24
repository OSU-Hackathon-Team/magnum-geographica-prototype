import { Hono } from "hono";
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { wikiPages, revisions, citations } from "../db/schema.js";
import {
  createWikiPageInputSchema,
  updateWikiPageInputSchema,
  revertWikiPageInputSchema,
  wikiPageQuerySchema,
} from "@magnum/shared";
import { adminOnly, type AuthUser } from "../middleware/auth.js";

type Variables = { user?: AuthUser };

export const wikiRoute = new Hono<{ Variables: Variables }>();

const baseWikiSelect = {
  id: wikiPages.id,
  target_type: wikiPages.targetType,
  target_id: wikiPages.targetId,
  title: wikiPages.title,
  content_md: wikiPages.contentMd,
  rendered_html: wikiPages.renderedHtml,
  created_at: wikiPages.createdAt,
  updated_at: wikiPages.updatedAt,
} as const;

const baseRevisionSelect = {
  id: revisions.id,
  wiki_page_id: revisions.wikiPageId,
  content_md: revisions.contentMd,
  contributor_name: revisions.contributorName,
  author_id: revisions.authorId,
  edit_summary: revisions.editSummary,
  created_at: revisions.createdAt,
} as const;

const baseCitationSelect = {
  id: citations.id,
  wiki_page_id: citations.wikiPageId,
  url: citations.url,
  title: citations.title,
  image_data: citations.imageData,
  image_mime_type: citations.imageMimeType,
  created_at: citations.createdAt,
} as const;

wikiRoute.get("/", async (c) => {
  const parsed = wikiPageQuerySchema.safeParse({
    target_type: c.req.query("target_type"),
    target_id: c.req.query("target_id"),
  });
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_input",
        message: "target_type and target_id required",
        details: parsed.error.flatten(),
      },
      400,
    );
  }
  const { target_type, target_id } = parsed.data;

  const rows = await db
    .select(baseWikiSelect)
    .from(wikiPages)
    .where(and(eq(wikiPages.targetType, target_type), eq(wikiPages.targetId, target_id)))
    .limit(1);

  const page = rows[0];
  if (!page) {
    return c.json(
      { error: "not_found", message: `wiki page for ${target_type} ${target_id} not found` },
      404,
    );
  }
  return c.json(page);
});

wikiRoute.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createWikiPageInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", message: "validation failed", details: parsed.error.flatten() },
      400,
    );
  }

  const { target_type, target_id, title, content_md, contributor_name, edit_summary } = parsed.data;
  const authUser = c.get("user");

  const existing = await db
    .select({ id: wikiPages.id })
    .from(wikiPages)
    .where(and(eq(wikiPages.targetType, target_type), eq(wikiPages.targetId, target_id)))
    .limit(1);

  if (existing.length > 0) {
    return c.json(
      { error: "conflict", message: `wiki page already exists for ${target_type} ${target_id}` },
      409,
    );
  }

  const rows = await db
    .insert(wikiPages)
    .values({
      targetType: target_type,
      targetId: target_id,
      title,
      contentMd: content_md,
    })
    .returning();

  const wikiPage = rows[0];

  if (!wikiPage) {
    return c.json({ error: "internal", message: "failed to create wiki page" }, 500);
  }

  if (content_md) {
    await db.insert(revisions).values({
      wikiPageId: wikiPage.id,
      contentMd: content_md,
      contributorName: contributor_name,
      authorId: authUser?.id ?? null,
      editSummary: edit_summary ?? null,
    });
  }

  return c.json(wikiPage, 201);
});

wikiRoute.put("/:id", async (c) => {
  const wikiPageId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = updateWikiPageInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", message: "validation failed", details: parsed.error.flatten() },
      400,
    );
  }

  const { title, content_md, contributor_name, edit_summary, base_revision_id } = parsed.data;
  const authUser = c.get("user");

  const existing = await db
    .select({ id: wikiPages.id })
    .from(wikiPages)
    .where(eq(wikiPages.id, wikiPageId))
    .limit(1);
  if (existing.length === 0) {
    return c.json({ error: "not_found", message: `wiki page ${wikiPageId} not found` }, 404);
  }

  if (base_revision_id) {
    const currentHead = await db
      .select({ id: revisions.id })
      .from(revisions)
      .where(eq(revisions.wikiPageId, wikiPageId))
      .orderBy(desc(revisions.createdAt))
      .limit(1);
    if (currentHead.length > 0 && currentHead[0] && currentHead[0].id !== base_revision_id) {
      return c.json(
        {
          error: "conflict",
          message: "wiki page has been edited since",
          current_revision_id: currentHead[0].id,
        },
        409,
      );
    }
  }

  const rows = await db
    .update(wikiPages)
    .set({ title, contentMd: content_md, updatedAt: sql`now()` })
    .where(eq(wikiPages.id, wikiPageId))
    .returning();

  await db.insert(revisions).values({
    wikiPageId,
    contentMd: content_md,
    contributorName: contributor_name,
    authorId: authUser?.id ?? null,
    editSummary: edit_summary ?? null,
  });

  return c.json(rows[0]);
});

wikiRoute.get("/:id/revisions", async (c) => {
  const wikiPageId = c.req.param("id");
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(c.req.query("pageSize") ?? 20)));
  const offset = (page - 1) * pageSize;

  const wikiExists = await db
    .select({ id: wikiPages.id })
    .from(wikiPages)
    .where(eq(wikiPages.id, wikiPageId))
    .limit(1);
  if (wikiExists.length === 0) {
    return c.json({ error: "not_found", message: `wiki page ${wikiPageId} not found` }, 404);
  }

  const [items, totalRow] = await Promise.all([
    db
      .select(baseRevisionSelect)
      .from(revisions)
      .where(eq(revisions.wikiPageId, wikiPageId))
      .orderBy(desc(revisions.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(revisions)
      .where(eq(revisions.wikiPageId, wikiPageId)),
  ]);

  return c.json({ items, total: totalRow[0]?.count ?? 0, page, pageSize });
});

wikiRoute.get("/:id/revisions/:revId", async (c) => {
  const wikiPageId = c.req.param("id");
  const revId = c.req.param("revId");

  const rows = await db
    .select(baseRevisionSelect)
    .from(revisions)
    .where(and(eq(revisions.id, revId), eq(revisions.wikiPageId, wikiPageId)))
    .limit(1);

  const rev = rows[0];
  if (!rev) {
    return c.json({ error: "not_found", message: `revision ${revId} not found` }, 404);
  }
  return c.json(rev);
});

wikiRoute.post("/:id/revert", async (c) => {
  const wikiPageId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = revertWikiPageInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", message: "validation failed", details: parsed.error.flatten() },
      400,
    );
  }

  const { revision_id, contributor_name, edit_summary } = parsed.data;
  const authUser = c.get("user");

  const wikiExists = await db
    .select({ id: wikiPages.id })
    .from(wikiPages)
    .where(eq(wikiPages.id, wikiPageId))
    .limit(1);
  if (wikiExists.length === 0) {
    return c.json({ error: "not_found", message: `wiki page ${wikiPageId} not found` }, 404);
  }

  const revRows = await db
    .select({ contentMd: revisions.contentMd })
    .from(revisions)
    .where(and(eq(revisions.id, revision_id), eq(revisions.wikiPageId, wikiPageId)))
    .limit(1);

  const rev = revRows[0];
  if (!rev) {
    return c.json({ error: "not_found", message: `revision ${revision_id} not found` }, 404);
  }

  const rows = await db
    .update(wikiPages)
    .set({ contentMd: rev.contentMd, updatedAt: sql`now()` })
    .where(eq(wikiPages.id, wikiPageId))
    .returning();

  await db.insert(revisions).values({
    wikiPageId,
    contentMd: rev.contentMd,
    contributorName: contributor_name,
    authorId: authUser?.id ?? null,
    editSummary: edit_summary ?? `Reverted to revision ${revision_id}`,
  });

  return c.json(rows[0]);
});

wikiRoute.get("/:id/citations", async (c) => {
  const wikiPageId = c.req.param("id");

  const wikiExists = await db
    .select({ id: wikiPages.id })
    .from(wikiPages)
    .where(eq(wikiPages.id, wikiPageId))
    .limit(1);
  if (wikiExists.length === 0) {
    return c.json({ error: "not_found", message: `wiki page ${wikiPageId} not found` }, 404);
  }

  const items = await db
    .select(baseCitationSelect)
    .from(citations)
    .where(eq(citations.wikiPageId, wikiPageId));

  return c.json({ items, total: items.length });
});
