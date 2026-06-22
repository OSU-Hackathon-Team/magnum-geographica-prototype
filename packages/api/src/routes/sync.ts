import { Hono } from "hono";
import { eq, desc, sql, gt } from "drizzle-orm";
import { db } from "../db/index.js";
import { wikiPages, revisions, features } from "../db/schema.js";

export const syncRoute = new Hono();

syncRoute.post("/contributions", async (c) => {
  const body = await c.req.json().catch(() => ({ contributions: [] }));
  const contributions = (body as { contributions?: unknown[] }).contributions ?? [];

  if (!Array.isArray(contributions) || contributions.length === 0) {
    return c.json({ results: [] });
  }

  const results: Array<{ local_id: number; status: string; server_id?: string; conflict_revision_id?: string }> = [];

  for (let i = 0; i < contributions.length; i++) {
    const contrib = contributions[i] as Record<string, unknown>;
    const localId = contrib.local_id as number;

    try {
      if (contrib.entity_type === "wiki_page") {
        if (contrib.action === "create") {
          const data = contrib.payload as { target_type: string; target_id: string; title: string; content_md: string };
          const rows = await db
            .insert(wikiPages)
            .values({
              targetType: data.target_type,
              targetId: data.target_id,
              title: data.title,
              contentMd: data.content_md,
            })
            .returning();

          if (data.content_md && rows[0]) {
            await db.insert(revisions).values({
              wikiPageId: rows[0].id,
              contentMd: data.content_md,
              contributorName: (contrib.contributor_name as string) ?? "anonymous",
            });
          }

          if (rows[0]) {
            results.push({ local_id: localId, status: "synced", server_id: rows[0].id });
          } else {
            results.push({ local_id: localId, status: "error" });
          }
        } else if (contrib.action === "update" && contrib.entity_id) {
          const entityId = contrib.entity_id as string;
          const data = contrib.payload as { title: string; content_md: string };
          const currentHead = await db
            .select({ id: revisions.id })
            .from(revisions)
            .where(eq(revisions.wikiPageId, entityId))
            .orderBy(desc(revisions.createdAt))
            .limit(1);

          const headRev = currentHead[0];
          if (contrib.base_revision_id && headRev && headRev.id !== (contrib.base_revision_id as string)) {
            results.push({
              local_id: localId,
              status: "conflict",
              conflict_revision_id: headRev.id,
            });
            continue;
          }

          const rows = await db
            .update(wikiPages)
            .set({ title: data.title, contentMd: data.content_md, updatedAt: sql`now()` })
            .where(eq(wikiPages.id, entityId))
            .returning();

          const updatedRow = rows[0];

          await db.insert(revisions).values({
            wikiPageId: entityId,
            contentMd: data.content_md,
            contributorName: (contrib.contributor_name as string) ?? "anonymous",
          });

          if (updatedRow) {
            results.push({ local_id: localId, status: "synced", server_id: updatedRow.id });
          } else {
            results.push({ local_id: localId, status: "synced", server_id: entityId });
          }
        } else {
          results.push({ local_id: localId, status: "synced", server_id: contrib.entity_id as string });
        }
      } else if (contrib.entity_type === "feature") {
        if (contrib.action === "create") {
          const data = contrib.payload as { name: string; type_tag: string; description?: string; point: { coordinates: [number, number] }; system_id?: string; trail_id?: string };
          const [lon, lat] = data.point?.coordinates ?? [null, null];
          if (!lon || !lat) {
            results.push({ local_id: localId, status: "error" });
            continue;
          }
          const rows = await db
            .insert(features)
            .values({
              name: data.name,
              typeTag: data.type_tag,
              point: sql`ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)`,
              description: data.description ?? null,
              systemId: data.system_id ?? null,
              trailId: data.trail_id ?? null,
            })
            .returning();
          if (rows[0]) {
            results.push({ local_id: localId, status: "synced", server_id: rows[0].id });
          } else {
            results.push({ local_id: localId, status: "error" });
          }
        } else if (contrib.action === "update" && contrib.entity_id) {
          const entityId = contrib.entity_id as string;
          const data = contrib.payload as { name?: string; type_tag?: string; description?: string };
          const updates: Record<string, unknown> = { updatedAt: sql`now()` };
          if (data.name) (updates as Record<string, string | null>).name = data.name;
          if (data.type_tag) (updates as Record<string, string | null>).typeTag = data.type_tag;
          if (data.description !== undefined) (updates as Record<string, string | null>).description = data.description || null;
          await db
            .update(features)
            .set(updates as Parameters<typeof db.update>[1])
            .where(eq(features.id, entityId));
          results.push({ local_id: localId, status: "synced", server_id: entityId });
        } else {
          results.push({ local_id: localId, status: "synced", server_id: contrib.entity_id as string });
        }
      } else {
        results.push({ local_id: localId, status: "synced", server_id: contrib.entity_id as string });
      }
    } catch (e) {
      results.push({ local_id: localId, status: "error" });
    }
  }

  return c.json({ results });
});

syncRoute.get("/updates", async (c) => {
  const since = c.req.query("since") ?? new Date(0).toISOString();

  const revRows = await db
    .select({
      id: revisions.id,
      wiki_page_id: revisions.wikiPageId,
      content_md: revisions.contentMd,
      contributor_name: revisions.contributorName,
      edit_summary: revisions.editSummary,
      created_at: revisions.createdAt,
    })
    .from(revisions)
    .where(gt(revisions.createdAt, new Date(since)))
    .orderBy(desc(revisions.createdAt))
    .limit(100);

  return c.json({ updates: revRows });
});
