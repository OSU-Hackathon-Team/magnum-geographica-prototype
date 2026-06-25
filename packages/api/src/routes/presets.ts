import { Hono } from "hono";
import {
  presetQuerySchema,
  createPresetInputSchema,
  updatePresetInputSchema,
} from "@magnum/shared/schemas";
import {
  listPresets,
  getPresetById,
  getPresetByKey,
  createPreset,
  updatePreset,
  deletePreset,
} from "../services/presets.js";
import { adminOnly, type AuthUser } from "../middleware/auth.js";
import { recordRevision } from "../services/revisions.js";
import { evaluateAction } from "../services/patrol.js";

type Variables = { user?: AuthUser };

export const presetsRoute = new Hono<{ Variables: Variables }>();

/**
 * Public: list all presets (for the device sync + cache, and for the
 * Add-Feature bottom sheet's category filter).
 */
presetsRoute.get("/", async (c) => {
  const parsed = presetQuerySchema.safeParse({
    category: c.req.query("category") ?? undefined,
    upstreamable: c.req.query("upstreamable") ?? undefined,
  });
  if (!parsed.success) {
    return c.json({ error: "invalid_input", message: parsed.error.issues[0]?.message ?? "validation failed" }, 400);
  }
  const items = await listPresets({
    category: parsed.data.category,
    upstreamable: parsed.data.upstreamable,
  });
  return c.json({ items, total: items.length });
});

presetsRoute.get("/:id", async (c) => {
  const id = c.req.param("id");
  const p = await getPresetById(id);
  if (!p) return c.json({ error: "not_found" }, 404);
  return c.json(p);
});

presetsRoute.get("/by-key/:key", async (c) => {
  const key = c.req.param("key");
  const p = await getPresetByKey(key);
  if (!p) return c.json({ error: "not_found" }, 404);
  return c.json(p);
});

/**
 * Mod+ writes. All preset mutations are revision-logged so the
 * moderator patrol feed can review preset edits, and so a rollback
 * reverts icon/question changes cleanly.
 */
presetsRoute.post("/", adminOnly(), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createPresetInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", message: parsed.error.issues[0]?.message ?? "validation failed" },
      400,
    );
  }
  const authUser = c.get("user");
  const created = await createPreset({
    key: parsed.data.key,
    label: parsed.data.label,
    iconName: parsed.data.icon_name,
    iconColor: parsed.data.icon_color,
    category: parsed.data.category,
    osmTags: parsed.data.osm_tags ?? {},
    questions: parsed.data.questions ?? [],
    upstreamable: parsed.data.upstreamable ?? false,
    sortOrder: parsed.data.sort_order ?? 100,
    createdBy: authUser?.id ?? null,
  });
  if (authUser) {
    const revId = await recordRevision({
      targetType: "preset",
      targetId: created.id,
      action: "create",
      actorId: authUser.id,
      contributorName: authUser.username,
      editSummary: `Created preset ${created.key}`,
      payloadAfter: { key: created.key, label: created.label, category: created.category },
    });
    await evaluateAction({
      revisionId: revId,
      actorId: authUser.id,
      actorKarma: 0,
      actorRole: authUser.role,
      targetType: "preset",
      targetId: created.id,
      action: "create",
    });
  }
  return c.json(created, 201);
});

presetsRoute.put("/:id", adminOnly(), async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = updatePresetInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", message: parsed.error.issues[0]?.message ?? "validation failed" },
      400,
    );
  }
  const existing = await getPresetById(id);
  if (!existing) return c.json({ error: "not_found" }, 404);
  const updated = await updatePreset(id, {
    label: parsed.data.label,
    iconName: parsed.data.icon_name,
    iconColor: parsed.data.icon_color,
    category: parsed.data.category,
    osmTags: parsed.data.osm_tags,
    questions: parsed.data.questions,
    upstreamable: parsed.data.upstreamable,
    sortOrder: parsed.data.sort_order,
  });
  const authUser = c.get("user");
  if (updated && authUser) {
    const revId = await recordRevision({
      targetType: "preset",
      targetId: id,
      action: "update",
      actorId: authUser.id,
      contributorName: authUser.username,
      editSummary: "Updated preset",
      payloadBefore: { key: existing.key, label: existing.label },
      payloadAfter: { key: updated.key, label: updated.label },
    });
    await evaluateAction({
      revisionId: revId,
      actorId: authUser.id,
      actorKarma: 0,
      actorRole: authUser.role,
      targetType: "preset",
      targetId: id,
      action: "update",
    });
  }
  if (!updated) return c.json({ error: "not_found" }, 404);
  return c.json(updated);
});

presetsRoute.delete("/:id", adminOnly(), async (c) => {
  const id = c.req.param("id");
  const existing = await getPresetById(id);
  if (!existing) return c.json({ error: "not_found" }, 404);
  const ok = await deletePreset(id);
  if (!ok) return c.json({ error: "internal" }, 500);
  const authUser = c.get("user");
  if (authUser) {
    await recordRevision({
      targetType: "preset",
      targetId: id,
      action: "delete",
      actorId: authUser.id,
      contributorName: authUser.username,
      editSummary: `Deleted preset ${existing.key}`,
      payloadBefore: { key: existing.key, label: existing.label },
    });
  }
  return c.json({ ok: true });
});
