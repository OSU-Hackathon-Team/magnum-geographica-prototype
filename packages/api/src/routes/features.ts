import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { features } from "../db/schema.js";

export const featuresRoute = new Hono();

featuresRoute.get("/:id", async (c) => {
  const id = c.req.param("id");
  const rows = await db.select().from(features).where(eq(features.id, id)).limit(1);
  const feat = rows[0];
  if (!feat) return c.json({ error: "not_found" }, 404);
  return c.json(feat);
});
