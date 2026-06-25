/**
 * Presets service (§21.4).
 *
 * A preset is a typed feature template: icon + label + category + a small
 * list of `boolean` / `select` questions. The presets table replaces the
 * hardcoded `FEATURE_TYPES` enum; `features.preset_id` references a preset
 * and `features.answers` holds the user's responses to its questions.
 *
 * Mod+ operations (create / update / delete) live in the route layer —
 * this service is the read+write surface and keeps DB concerns out of
 * the route handlers.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { presets, type Preset, type NewPreset } from "../db/schema.js";
import type { PresetCategory } from "@magnum/shared/constants";

export interface ListPresetsOptions {
  category?: PresetCategory;
  upstreamable?: boolean;
}

export async function listPresets(opts: ListPresetsOptions = {}): Promise<Preset[]> {
  const conditions = [];
  if (opts.category) conditions.push(eq(presets.category, opts.category));
  if (opts.upstreamable !== undefined) {
    conditions.push(eq(presets.upstreamable, opts.upstreamable));
  }
  const where = conditions.length ? and(...conditions) : undefined;
  return db
    .select()
    .from(presets)
    .where(where)
    .orderBy(asc(presets.sortOrder), asc(presets.label));
}

export async function getPresetById(id: string): Promise<Preset | null> {
  const rows = await db.select().from(presets).where(eq(presets.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getPresetByKey(key: string): Promise<Preset | null> {
  const rows = await db.select().from(presets).where(eq(presets.key, key)).limit(1);
  return rows[0] ?? null;
}

export async function createPreset(input: NewPreset): Promise<Preset> {
  const rows = await db.insert(presets).values(input).returning();
  const p = rows[0];
  if (!p) throw new Error("failed to insert preset");
  return p;
}

export interface UpdatePresetPatch {
  label?: string;
  iconName?: string;
  iconColor?: string;
  category?: PresetCategory;
  osmTags?: Record<string, string>;
  questions?: unknown;
  upstreamable?: boolean;
  sortOrder?: number;
}

export async function updatePreset(id: string, patch: UpdatePresetPatch): Promise<Preset | null> {
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.label !== undefined) updates.label = patch.label;
  if (patch.iconName !== undefined) updates.iconName = patch.iconName;
  if (patch.iconColor !== undefined) updates.iconColor = patch.iconColor;
  if (patch.category !== undefined) updates.category = patch.category;
  if (patch.osmTags !== undefined) updates.osmTags = patch.osmTags;
  if (patch.questions !== undefined) updates.questions = patch.questions;
  if (patch.upstreamable !== undefined) updates.upstreamable = patch.upstreamable;
  if (patch.sortOrder !== undefined) updates.sortOrder = patch.sortOrder;
  if (Object.keys(updates).length === 1) {
    // No real changes besides the timestamp; still return current.
    return getPresetById(id);
  }
  const rows = await db
    .update(presets)
    .set(updates as Partial<NewPreset>)
    .where(eq(presets.id, id))
    .returning();
  return rows[0] ?? null;
}

export async function deletePreset(id: string): Promise<boolean> {
  // Set null on referencing features first so the FK doesn't block.
  await db.execute(sql`UPDATE features SET preset_id = NULL WHERE preset_id = ${id}`);
  const result = await db.delete(presets).where(eq(presets.id, id)).returning({ id: presets.id });
  return result.length > 0;
}
