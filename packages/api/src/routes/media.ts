import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { media } from "../db/schema.js";

export const mediaRoute = new Hono();

mediaRoute.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return c.json({ error: "invalid_input", message: "body required" }, 400);
  }

  const { feature_id, trail_id, system_id, data, mime_type, caption, width, height } =
    body as Record<string, unknown>;

  if (!data || typeof data !== "string") {
    return c.json({ error: "invalid_input", message: "data (base64) required" }, 400);
  }
  if (!mime_type || typeof mime_type !== "string") {
    return c.json({ error: "invalid_input", message: "mime_type required" }, 400);
  }

  if ([feature_id, trail_id, system_id].filter((v) => v != null).length !== 1) {
    return c.json(
      {
        error: "invalid_input",
        message: "exactly one of feature_id, trail_id, system_id required",
      },
      400,
    );
  }

  const buffer = Buffer.from(data, "base64");

  const rows = await db
    .insert(media)
    .values({
      featureId: feature_id ? String(feature_id) : null,
      trailId: trail_id ? String(trail_id) : null,
      systemId: system_id ? String(system_id) : null,
      data: buffer,
      mimeType: String(mime_type),
      caption: caption ? String(caption) : null,
      width: width ? Number(width) : null,
      height: height ? Number(height) : null,
    })
    .returning({
      id: media.id,
      feature_id: media.featureId,
      trail_id: media.trailId,
      system_id: media.systemId,
      mime_type: media.mimeType,
      caption: media.caption,
      width: media.width,
      height: media.height,
      created_at: media.createdAt,
    });

  const row = rows[0];
  if (!row) {
    return c.json({ error: "internal", message: "failed to create media" }, 500);
  }

  return c.json(row, 201);
});

mediaRoute.get("/:id", async (c) => {
  const id = c.req.param("id");
  const rows = await db
    .select({
      id: media.id,
      data: media.data,
      mime_type: media.mimeType,
    })
    .from(media)
    .where(eq(media.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) return c.json({ error: "not_found" }, 404);

  const base64 = Buffer.from(row.data).toString("base64");
  const dataUrl = `data:${row.mime_type};base64,${base64}`;

  return c.json({ id: row.id, data: dataUrl, mime_type: row.mime_type });
});

mediaRoute.get("/", async (c) => {
  const featureId = c.req.query("feature_id");
  const trailId = c.req.query("trail_id");
  const systemId = c.req.query("system_id");

  let query = db
    .select({
      id: media.id,
      feature_id: media.featureId,
      trail_id: media.trailId,
      system_id: media.systemId,
      mime_type: media.mimeType,
      caption: media.caption,
      width: media.width,
      height: media.height,
      data: media.data,
      created_at: media.createdAt,
    })
    .from(media)
    .$dynamic();

  if (featureId) query = query.where(eq(media.featureId, featureId));
  else if (trailId) query = query.where(eq(media.trailId, trailId));
  else if (systemId) query = query.where(eq(media.systemId, systemId));

  const items = await query;

  const result = items.map((item) => {
    const base64 = Buffer.from(item.data).toString("base64");
    const thumbnailUrl = `data:${item.mime_type};base64,${base64}`;
    const { data: _data, ...rest } = item;
    return { ...rest, thumbnail_url: thumbnailUrl };
  });

  return c.json({ items, total: items.length });
});

mediaRoute.delete("/:id", async (c) => {
  const id = c.req.param("id");
  await db.delete(media).where(eq(media.id, id));
  return c.json({ ok: true });
});
