import { Hono } from "hono";
import { ilike } from "drizzle-orm";
import { db } from "../db/index.js";
import { systems, trails, features } from "../db/schema.js";
import { searchQuerySchema } from "@magnum/shared";

export const searchRoute = new Hono();

searchRoute.get("/", async (c) => {
  const parsed = searchQuerySchema.safeParse({
    q: c.req.query("q") ?? "",
    type: c.req.query("type") ?? "all",
    limit: c.req.query("limit") ?? 20,
  });
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", message: "validation failed", details: parsed.error.flatten() },
      400,
    );
  }
  const { q, type, limit } = parsed.data;
  const pattern = `%${q}%`;

  const wantSystems = type === "all" || type === "system";
  const wantTrails = type === "all" || type === "trail";
  const wantFeatures = type === "all" || type === "feature";

  const [systemRows, trailRows, featureRows] = await Promise.all([
    wantSystems
      ? db
          .select({
            id: systems.id,
            name: systems.name,
            slug: systems.slug,
            description: systems.description,
            external_url: systems.externalUrl,
            created_at: systems.createdAt,
            updated_at: systems.updatedAt,
          })
          .from(systems)
          .where(ilike(systems.name, pattern))
          .limit(limit)
      : Promise.resolve([] as never[]),
    wantTrails
      ? db
          .select({
            id: trails.id,
            name: trails.name,
            slug: trails.slug,
            description: trails.description,
            difficulty: trails.difficulty,
            length_meters: trails.lengthMeters,
            verified: trails.verified,
            created_at: trails.createdAt,
            updated_at: trails.updatedAt,
          })
          .from(trails)
          .where(ilike(trails.name, pattern))
          .limit(limit)
      : Promise.resolve([] as never[]),
    wantFeatures
      ? db
          .select({
            id: features.id,
            name: features.name,
            type_tag: features.typeTag,
            description: features.description,
            trail_id: features.trailId,
            system_id: features.systemId,
            created_at: features.createdAt,
            updated_at: features.updatedAt,
          })
          .from(features)
          .where(ilike(features.name, pattern))
          .limit(limit)
      : Promise.resolve([] as never[]),
  ]);

  return c.json({ systems: systemRows, trails: trailRows, features: featureRows });
});
