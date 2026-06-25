/**
 * Generalized revisions (§21.8).
 *
 * Wiki-page revisions have always been a row in `revisions` with
 * `wiki_page_id` and `content_md`. As of §21.8, every entity mutation
 * (system, feature, trace, preset, trail, etc.) writes a revision with
 * `target_type` + `target_id` and a `payload_after` JSONB. This service
 * centralizes that write path so mutations everywhere get revision logging
 * for free.
 *
 * Reverts are also a revision (`action='revert'`, with `reverted_from_id`
 * pointing at the revision being undone). The caller (route) is responsible
 * for actually applying the data change.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { revisions, type Revision } from "../db/schema.js";
import type {
  RevisionAction,
  RevisionTargetType,
} from "@magnum/shared/constants";

export interface RecordRevisionInput {
  targetType: RevisionTargetType | "wiki_page";
  targetId: string;
  action: RevisionAction;
  actorId: string | null;
  contributorName: string;
  editSummary?: string | null;
  payloadBefore?: Record<string, unknown> | null;
  payloadAfter?: Record<string, unknown> | null;
  wikiPageId?: string;
  contentMd?: string;
  revertedFromId?: string;
}

/**
 * Insert a revision row. Returns the new revision id.
 */
export async function recordRevision(input: RecordRevisionInput): Promise<string> {
  const rows = await db
    .insert(revisions)
    .values({
      targetType: input.targetType,
      targetId: input.targetId,
      action: input.action,
      authorId: input.actorId,
      contributorName: input.contributorName,
      editSummary: input.editSummary ?? null,
      payloadBefore: input.payloadBefore ?? null,
      payloadAfter: input.payloadAfter ?? null,
      wikiPageId: input.wikiPageId ?? null,
      contentMd: input.contentMd ?? null,
      revertedFromId: input.revertedFromId ?? null,
    })
    .returning({ id: revisions.id });
  const id = rows[0]?.id;
  if (!id) throw new Error("failed to insert revision");
  return id;
}

/**
 * Fetch the revision history for a target. Used by both wiki-page
 * `/api/wiki-pages/:id/revisions` and the generalized
 * `/api/revisions?target_type=...` endpoint.
 */
export async function listRevisionsForTarget(
  targetType: RevisionTargetType,
  targetId: string,
  opts: { page: number; pageSize: number },
): Promise<{ items: Revision[]; total: number }> {
  const page = Math.max(1, opts.page);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize));
  const offset = (page - 1) * pageSize;
  const [items, totalRow] = await Promise.all([
    db
      .select()
      .from(revisions)
      .where(
        and(eq(revisions.targetType, targetType), eq(revisions.targetId, targetId)),
      )
      .orderBy(desc(revisions.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(revisions)
      .where(
        and(eq(revisions.targetType, targetType), eq(revisions.targetId, targetId)),
      ),
  ]);
  return { items, total: Number(totalRow[0]?.count ?? 0) };
}

/**
 * Generalized revision query (target_type, target_id, author_id filters).
 * Used by the `/api/revisions` endpoint.
 */
export async function queryRevisions(opts: {
  targetType?: RevisionTargetType;
  targetId?: string;
  authorId?: string;
  page: number;
  pageSize: number;
}): Promise<{ items: Revision[]; total: number }> {
  const page = Math.max(1, opts.page);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize));
  const offset = (page - 1) * pageSize;
  const conditions = [];
  if (opts.targetType) conditions.push(eq(revisions.targetType, opts.targetType));
  if (opts.targetId) conditions.push(eq(revisions.targetId, opts.targetId));
  if (opts.authorId) conditions.push(eq(revisions.authorId, opts.authorId));
  const where = conditions.length ? and(...conditions) : undefined;
  const [items, totalRow] = await Promise.all([
    db
      .select()
      .from(revisions)
      .where(where)
      .orderBy(desc(revisions.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(revisions)
      .where(where),
  ]);
  return { items, total: Number(totalRow[0]?.count ?? 0) };
}

/**
 * Load the most recent revision of a given target with a given action.
 * Used by the revert endpoint to look up "the current state" for
 * before/after diff display.
 */
export async function getLatestRevision(
  targetType: RevisionTargetType,
  targetId: string,
  action?: RevisionAction,
): Promise<Revision | null> {
  const conditions = [
    eq(revisions.targetType, targetType),
    eq(revisions.targetId, targetId),
  ];
  if (action) conditions.push(eq(revisions.action, action));
  const rows = await db
    .select()
    .from(revisions)
    .where(and(...conditions))
    .orderBy(desc(revisions.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function getRevisionById(id: string): Promise<Revision | null> {
  const rows = await db.select().from(revisions).where(eq(revisions.id, id)).limit(1);
  return rows[0] ?? null;
}
