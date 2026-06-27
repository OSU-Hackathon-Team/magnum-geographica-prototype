import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { features, presets, users } from "../db/schema.js";
import {
  createFeatureInputSchema,
  updateFeatureInputSchema,
  validateAnswers,
} from "@magnum/shared";
import { getPresetById } from "../services/presets.js";
import { authRequired, optionalAuth, actorRequired, type AuthUser } from "../middleware/auth.js";
import { resolveContributorName, resolveActor } from "../services/identity.js";
import { canWrite, getProtection, refreshProtection } from "../services/protection.js";

type Variables = { user?: AuthUser };

function toCoordinate(x: number | string | null | undefined): number | null {
  if (x === null || x === undefined) return null;
  const n = typeof x === "string" ? parseFloat(x) : x;
  return Number.isFinite(n) ? n : null;
}

function extractLatLon(point: unknown): { lon: number | null; lat: number | null } {
  let lon: number | null = null;
  let lat: number | null = null;
  if (!point || typeof point !== "object") return { lon, lat };
  const p = point as { type?: string; coordinates?: unknown; lat?: unknown; lon?: unknown };
  if (
    p.type === "Point" &&
    Array.isArray(p.coordinates) &&
    p.coordinates.length >= 2
  ) {
    lon = toCoordinate(p.coordinates[0] as number | string);
    lat = toCoordinate(p.coordinates[1] as number | string);
  } else if (typeof p.lon === "number" || typeof p.lat === "number") {
    lon = toCoordinate(p.lon as number | string);
    lat = toCoordinate(p.lat as number | string);
  }
  return { lon, lat };
}

const baseFeatureSelect = {
  id: features.id,
  name: features.name,
  type_tag: features.typeTag,
  description: features.description,
  trail_id: features.trailId,
  system_id: features.systemId,
  preset_id: features.presetId,
  answers: features.answers,
  created_at: features.createdAt,
  updated_at: features.updatedAt,
  lon: sql<number | null>`ST_X(${features.point}::geometry)`,
  lat: sql<number | null>`ST_Y(${features.point}::geometry)`,
} as const;

const presetJoin = {
  preset_key: presets.key,
  preset_label: presets.label,
  preset_icon_name: presets.iconName,
  preset_icon_color: presets.iconColor,
  preset_category: presets.category,
  preset_questions: presets.questions,
} as const;

export const featuresRoute = new Hono<{ Variables: Variables }>();

featuresRoute.get("/:id", async (c) => {
  const id = c.req.param("id");
  const rows = await db
    .select({ ...baseFeatureSelect, ...presetJoin })
    .from(features)
    .leftJoin(presets, eq(features.presetId, presets.id))
    .where(eq(features.id, id))
    .limit(1);
  const feat = rows[0];
  if (!feat) return c.json({ error: "not_found" }, 404);
  const { lon, lat, ...rest } = feat;
  const center = lon != null && lat != null ? { lat, lon } : null;
  return c.json({ ...rest, center });
});

featuresRoute.post("/", optionalAuth(), actorRequired(), async (c) => {
  const authUser = c.get("user");
  const body = await c.req.json().catch(() => null);
  const parsed = createFeatureInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", message: "validation failed", details: parsed.error.flatten() },
      400,
    );
  }
  const { name, type_tag, preset_id, point, trail_id, system_id, description, answers } = parsed.data;

  if (!type_tag && !preset_id) {
    return c.json(
      { error: "invalid_input", message: "either preset_id or type_tag is required" },
      400,
    );
  }

  const { lon, lat } = extractLatLon(point);
  if (lon === null || lat === null) {
    return c.json(
      { error: "invalid_input", message: "could not extract coordinates from point" },
      400,
    );
  }

  // Validate answers against the preset's question schema.
  let resolvedPresetId: string | null = preset_id ?? null;
  let resolvedTypeTag: string | null = type_tag ?? null;
  if (preset_id) {
    const preset = await getPresetById(preset_id);
    if (!preset) {
      return c.json({ error: "invalid_input", message: "preset_id not found" }, 400);
    }
    const v = validateAnswers(
      preset.questions as Array<{ key: string; type: "boolean" | "select"; options?: { value: string }[] }>,
      answers,
    );
    if (!v.ok) {
      return c.json(
        { error: "invalid_answers", message: "answer validation failed", details: v.errors },
        400,
      );
    }
    resolvedPresetId = preset.id;
    resolvedTypeTag = preset.key;
  }

  // Attribution via resolveActor — IP users get "IP:<addr>", auth users get their username.
  const actor = resolveActor(c);
  const authorId = authUser
    ? (await db.select({ id: users.id, username: users.username }).from(users).where(eq(users.id, authUser.id)).limit(1))[0]?.id ?? null
    : null;

  const rows = await db
    .insert(features)
    .values({
      name,
      typeTag: resolvedTypeTag,
      presetId: resolvedPresetId,
      answers: answers ?? null,
      point: sql`ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)`,
      trailId: trail_id ?? null,
      systemId: system_id ?? null,
      description: description ?? null,
      createdByUserId: authorId ?? null,
      contributorName: actor.contributorName,
    })
    .returning();

  const feat = rows[0];
  if (!feat) {
    return c.json({ error: "internal", message: "failed to create feature" }, 500);
  }

  return c.json(
    {
      id: feat.id,
      name: feat.name,
      type_tag: feat.typeTag,
      preset_id: feat.presetId,
      answers: feat.answers,
      description: feat.description,
      trail_id: feat.trailId,
      system_id: feat.systemId,
      created_at: feat.createdAt,
      updated_at: feat.updatedAt,
      center: { lat, lon },
    },
    201,
  );
});

featuresRoute.put("/:id", optionalAuth(), actorRequired(), async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = updateFeatureInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", message: "validation failed", details: parsed.error.flatten() },
      400,
    );
  }
  const { name, preset_id, type_tag, description, trail_id, system_id, answers } = parsed.data;

  // Protection gate.
  await refreshProtection("feature", id);
  const prot = await getProtection("feature", id);
  const actor = resolveActor(c);
  let role: string | undefined;
  let karma = 0;
  if (actor.kind === "user" && actor.userId) {
    const actorRow = await db
      .select({ karma: users.trustScore, role: users.role })
      .from(users)
      .where(eq(users.id, actor.userId))
      .limit(1);
    role = actorRow[0]?.role ?? undefined;
    karma = Number(actorRow[0]?.karma ?? 0);
  }
  const allowed = canWrite(prot.level, {
    role: role ?? null,
    karma,
    loggedIn: actor.kind === "user",
    kind: actor.kind,
  });
  if (!allowed) {
    return c.json(
      { error: "forbidden", message: `protection level requires higher trust tier`, protection: prot.level },
      403,
    );
  }

  // Validate answers against the resolved preset (incoming or existing).
  if (answers !== undefined) {
    let preset;
    if (preset_id) {
      preset = await getPresetById(preset_id);
    } else {
      const existing = await db
        .select({ preset_id: features.presetId })
        .from(features)
        .where(eq(features.id, id))
        .limit(1);
      if (existing[0]?.preset_id) preset = await getPresetById(existing[0].preset_id);
    }
    if (preset) {
      const v = validateAnswers(
        preset.questions as Array<{ key: string; type: "boolean" | "select"; options?: { value: string }[] }>,
        answers,
      );
      if (!v.ok) {
        return c.json(
          { error: "invalid_answers", message: "answer validation failed", details: v.errors },
          400,
        );
      }
    }
  }

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (preset_id !== undefined) updates.presetId = preset_id;
  if (type_tag !== undefined) updates.typeTag = type_tag;
  if (description !== undefined) updates.description = description || null;
  if (trail_id !== undefined) updates.trailId = trail_id || null;
  if (system_id !== undefined) updates.systemId = system_id || null;
  if (answers !== undefined) updates.answers = answers;

  const pointData = body?.point as
    | { type?: string; coordinates?: [number, number]; lat?: number; lon?: number }
    | undefined;
  if (pointData) {
    const { lon, lat } = extractLatLon(pointData);
    if (lon !== null && lat !== null) {
      updates.point = sql`ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)`;
    }
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ error: "invalid_input", message: "no fields to update" }, 400);
  }
  updates.updatedAt = sql`now()`;

  const rows = await db
    .update(features)
    .set(updates as never)
    .where(eq(features.id, id))
    .returning();

  const feat = rows[0];
  if (!feat) return c.json({ error: "not_found" }, 404);

  return c.json({
    id: feat.id,
    name: feat.name,
    type_tag: feat.typeTag,
    preset_id: feat.presetId,
    answers: feat.answers,
    description: feat.description,
    trail_id: feat.trailId,
    system_id: feat.systemId,
    created_at: feat.createdAt,
    updated_at: feat.updatedAt,
  });
});

featuresRoute.delete("/:id", authRequired(), async (c) => {
  const authUser = c.get("user");
  if (!authUser) return c.json({ error: "unauthorized" }, 401);
  const id = c.req.param("id");
  // Protection gate.
  await refreshProtection("feature", id);
  const prot = await getProtection("feature", id);
  const actorRow = await db
    .select({ karma: users.trustScore, role: users.role })
    .from(users)
    .where(eq(users.id, authUser.id))
    .limit(1);
  const allowed = canWrite(prot.level, {
    role: actorRow[0]?.role ?? null,
    karma: Number(actorRow[0]?.karma ?? 0),
    loggedIn: true,
  });
  if (!allowed) {
    return c.json(
      { error: "forbidden", message: `protection level requires higher trust tier`, protection: prot.level },
      403,
    );
  }
  await db.delete(features).where(eq(features.id, id));
  return c.json({ ok: true });
});
