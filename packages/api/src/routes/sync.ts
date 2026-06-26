import { Hono } from "hono";
import { eq, desc, sql, gt, asc } from "drizzle-orm";
import { db } from "../db/index.js";
import { wikiPages, revisions, features, trailSegments, media } from "../db/schema.js";
import { resolveContributorName } from "../services/identity.js";

export const syncRoute = new Hono();

syncRoute.post("/contributions", async (c) => {
  const body = await c.req.json().catch(() => ({ contributions: [] }));
  const contributions = (body as { contributions?: unknown[] }).contributions ?? [];

  if (!Array.isArray(contributions) || contributions.length === 0) {
    return c.json({ results: [] });
  }

  // The pending contribution was queued offline; whatever the client
  // stored in `contributor_name` is untrusted. Re-derive the
  // attribution from the current auth context (authenticated user
  // or the caller's IP) so a malicious client can't spoof it.
  const contributorName = resolveContributorName(c);

  const results: Array<{
    local_id: number;
    status: string;
    server_id?: string;
    conflict_revision_id?: string;
  }> = [];

  for (let i = 0; i < contributions.length; i++) {
    const contrib = contributions[i] as Record<string, unknown>;
    const localId = contrib.local_id as number;

    try {
      if (contrib.entity_type === "wiki_page") {
        if (contrib.action === "create") {
          const data = contrib.payload as {
            target_type: string;
            target_id: string;
            title: string;
            content_md: string;
          };
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
              action: "create",
              contributorName,
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
          if (
            contrib.base_revision_id &&
            headRev &&
            headRev.id !== (contrib.base_revision_id as string)
          ) {
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
            action: "update",
            contributorName,
          });

          if (updatedRow) {
            results.push({ local_id: localId, status: "synced", server_id: updatedRow.id });
          } else {
            results.push({ local_id: localId, status: "synced", server_id: entityId });
          }
        } else {
          results.push({
            local_id: localId,
            status: "synced",
            server_id: contrib.entity_id as string,
          });
        }
      } else if (contrib.entity_type === "feature") {
        if (contrib.action === "create") {
          const data = contrib.payload as {
            name: string;
            type_tag: string;
            description?: string;
            point: { coordinates: [number, number] };
            system_id?: string;
            trail_id?: string;
          };
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
          const data = contrib.payload as {
            name?: string;
            type_tag?: string;
            description?: string;
          };
          const updates: Record<string, unknown> = { updatedAt: sql`now()` };
          if (data.name) (updates as Record<string, string | null>).name = data.name;
          if (data.type_tag) (updates as Record<string, string | null>).typeTag = data.type_tag;
          if (data.description !== undefined)
            (updates as Record<string, string | null>).description = data.description || null;
          await db
            .update(features)
            .set(updates as never)
            .where(eq(features.id, entityId));
          results.push({ local_id: localId, status: "synced", server_id: entityId });
        } else {
          results.push({
            local_id: localId,
            status: "synced",
            server_id: contrib.entity_id as string,
          });
        }
      } else if (contrib.entity_type === "trail_segment") {
        if (contrib.action === "update" && contrib.entity_id) {
          const data = contrib.payload as {
            id: string;
            name?: string | null;
            surface_type?: string | null;
            hazards?: string[];
            is_road_connector?: boolean;
            steep_grade?: boolean;
            one_way?: boolean;
            description?: string | null;
          };
          const updates: Record<string, unknown> = { updatedAt: sql`now()` };
          if (data.name !== undefined) (updates as Record<string, unknown>).name = data.name;
          if (data.surface_type !== undefined)
            (updates as Record<string, unknown>).surfaceType = data.surface_type;
          if (data.hazards !== undefined)
            (updates as Record<string, unknown>).hazards = data.hazards;
          if (data.is_road_connector !== undefined)
            (updates as Record<string, unknown>).isRoadConnector = data.is_road_connector;
          if (data.steep_grade !== undefined)
            (updates as Record<string, unknown>).steepGrade = data.steep_grade;
          if (data.one_way !== undefined)
            (updates as Record<string, unknown>).oneWay = data.one_way;
          if (data.description !== undefined)
            (updates as Record<string, unknown>).description = data.description;
          await db
            .update(trailSegments)
            .set(updates as Partial<typeof trailSegments.$inferInsert>)
            .where(eq(trailSegments.id, data.id));
          results.push({ local_id: localId, status: "synced", server_id: data.id });
        } else if (contrib.action === "delete" && contrib.entity_id) {
          await db.delete(trailSegments).where(eq(trailSegments.id, contrib.entity_id as string));
          results.push({
            local_id: localId,
            status: "synced",
            server_id: contrib.entity_id as string,
          });
        } else if (contrib.action === "reorder" && contrib.payload) {
          const data = contrib.payload as { ordered_ids: string[] };
          for (let k = 0; k < data.ordered_ids.length; k++) {
            await db
              .update(trailSegments)
              .set({ sortOrder: k, updatedAt: sql`now()` })
              .where(eq(trailSegments.id, data.ordered_ids[k]!));
          }
          results.push({ local_id: localId, status: "synced", server_id: "reorder" });
        } else if (contrib.action === "split" && contrib.payload) {
          // Server-side split was attempted offline; resolve by reapplying
          // the split on the server. Geometry is regenerated from current
          // server state. We re-derive the sort order from the local list.
          const data = contrib.payload as {
            id: string;
            split_at: number;
            name_a?: string;
            name_b?: string;
          };
          const segRows = await db
            .select({
              id: trailSegments.id,
              sortOrder: trailSegments.sortOrder,
              hazards: trailSegments.hazards,
            })
            .from(trailSegments)
            .where(eq(trailSegments.id, data.id))
            .limit(1);
          const seg = segRows[0];
          if (!seg) {
            results.push({ local_id: localId, status: "error" });
            continue;
          }
          const wktA = await db
            .select({
              wkt: sql<string>`ST_AsText(ST_LineSubstring(${trailSegments.geometry}, 0, ${data.split_at}))`,
            })
            .from(trailSegments)
            .where(eq(trailSegments.id, data.id))
            .limit(1);
          const wktB = await db
            .select({
              wkt: sql<string>`ST_AsText(ST_LineSubstring(${trailSegments.geometry}, ${data.split_at}, 1))`,
            })
            .from(trailSegments)
            .where(eq(trailSegments.id, data.id))
            .limit(1);
          const textA = wktA[0]?.wkt;
          const textB = wktB[0]?.wkt;
          if (!textA || !textB) {
            results.push({ local_id: localId, status: "error" });
            continue;
          }
          await db
            .update(trailSegments)
            .set({
              geometry: sql`ST_Multi(ST_GeomFromText(${textA}, 4326))`,
              name: data.name_a ?? null,
              sortOrder: seg.sortOrder,
              updatedAt: sql`now()`,
            })
            .where(eq(trailSegments.id, data.id));
          await db.insert(trailSegments).values({
            trailId:
              (
                await db
                  .select({ trailId: trailSegments.trailId })
                  .from(trailSegments)
                  .where(eq(trailSegments.id, data.id))
                  .limit(1)
              )[0]?.trailId ?? "",
            geometry: sql`ST_Multi(ST_GeomFromText(${textB}, 4326))`,
            name: data.name_b ?? null,
            sortOrder: seg.sortOrder + 1,
            hazards: seg.hazards,
          });
          await db
            .update(trailSegments)
            .set({ sortOrder: sql`${trailSegments.sortOrder} + 1`, updatedAt: sql`now()` })
            .where(
              sql`${trailSegments.sortOrder} > ${seg.sortOrder} AND ${trailSegments.id} != ${data.id}`,
            );
          results.push({ local_id: localId, status: "synced", server_id: data.id });
        } else if (contrib.action === "merge" && contrib.payload) {
          const data = contrib.payload as { segment_id_a: string; segment_id_b: string };
          const a = (
            await db
              .select({
                id: trailSegments.id,
                sortOrder: trailSegments.sortOrder,
                isRoadConnector: trailSegments.isRoadConnector,
                steepGrade: trailSegments.steepGrade,
                oneWay: trailSegments.oneWay,
                hazards: trailSegments.hazards,
              })
              .from(trailSegments)
              .where(eq(trailSegments.id, data.segment_id_a))
              .limit(1)
          )[0];
          const b = (
            await db
              .select({
                id: trailSegments.id,
                sortOrder: trailSegments.sortOrder,
                isRoadConnector: trailSegments.isRoadConnector,
                steepGrade: trailSegments.steepGrade,
                oneWay: trailSegments.oneWay,
                hazards: trailSegments.hazards,
              })
              .from(trailSegments)
              .where(eq(trailSegments.id, data.segment_id_b))
              .limit(1)
          )[0];
          if (!a || !b || a.isRoadConnector || b.isRoadConnector) {
            results.push({ local_id: localId, status: "error" });
            continue;
          }
          const [lo, hi] = a.sortOrder < b.sortOrder ? [a, b] : [b, a];
          await db
            .update(trailSegments)
            .set({
              geometry: sql`ST_Multi(ST_LineMerge(ST_Union(${trailSegments.geometry}, (SELECT geometry FROM trail_segments WHERE id = ${hi.id}))))`,
              sortOrder: lo.sortOrder,
              steepGrade: a.steepGrade || b.steepGrade,
              oneWay: a.oneWay && b.oneWay,
              hazards: sql`(SELECT ARRAY(SELECT DISTINCT UNNEST(${a.hazards}::text[] || ${b.hazards}::text[])))`,
              updatedAt: sql`now()`,
            })
            .where(eq(trailSegments.id, lo.id));
          await db.delete(trailSegments).where(eq(trailSegments.id, hi.id));
          await db
            .update(trailSegments)
            .set({ sortOrder: sql`${trailSegments.sortOrder} - 1`, updatedAt: sql`now()` })
            .where(sql`${trailSegments.sortOrder} > ${lo.sortOrder}`);
          results.push({ local_id: localId, status: "synced", server_id: lo.id });
        } else {
          results.push({
            local_id: localId,
            status: "synced",
            server_id: contrib.entity_id as string,
          });
        }
      } else if (contrib.entity_type === "media") {
        if (contrib.action === "create" && contrib.payload) {
          const data = contrib.payload as {
            feature_id?: string;
            trail_id?: string;
            system_id?: string;
            data: string;
            mime_type: string;
            caption?: string;
          };
          const buffer = Buffer.from(data.data, "base64");
          const rows = await db
            .insert(media)
            .values({
              featureId: data.feature_id ?? null,
              trailId: data.trail_id ?? null,
              systemId: data.system_id ?? null,
              data: buffer,
              mimeType: data.mime_type,
              caption: data.caption ?? null,
            })
            .returning({ id: media.id });
          if (rows[0]) {
            results.push({ local_id: localId, status: "synced", server_id: rows[0].id });
          } else {
            results.push({ local_id: localId, status: "error" });
          }
        } else {
          results.push({
            local_id: localId,
            status: "synced",
            server_id: contrib.entity_id as string,
          });
        }
      } else {
        results.push({
          local_id: localId,
          status: "synced",
          server_id: contrib.entity_id as string,
        });
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
