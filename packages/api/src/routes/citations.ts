import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { citations } from "../db/schema.js";
import { createCitationInputSchema } from "@magnum/shared";
import { authRequired, optionalAuth, actorRequired } from "../middleware/auth.js";

export const citationsRoute = new Hono();

citationsRoute.post("/", optionalAuth(), actorRequired(), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createCitationInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", message: "validation failed", details: parsed.error.flatten() },
      400,
    );
  }

  const { wiki_page_id, url, title, image_data, image_mime_type } = parsed.data;

  const rows = await db
    .insert(citations)
    .values({
      wikiPageId: wiki_page_id,
      url: url ?? null,
      title,
      imageData: image_data ? Buffer.from(image_data, "base64") : null,
      imageMimeType: image_mime_type ?? null,
    })
    .returning();

  return c.json(rows[0], 201);
});

citationsRoute.delete("/:id", authRequired(), async (c) => {
  const id = c.req.param("id");

  const existing = await db
    .select({ id: citations.id })
    .from(citations)
    .where(eq(citations.id, id))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: "not_found", message: `citation ${id} not found` }, 404);
  }

  await db.delete(citations).where(eq(citations.id, id));

  return c.json({ ok: true });
});
