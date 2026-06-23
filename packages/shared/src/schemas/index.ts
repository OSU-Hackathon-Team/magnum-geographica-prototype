import { z } from "zod";
import { DIFFICULTIES, SURFACE_TYPES, FEATURE_TYPES, WIKI_TARGET_TYPES } from "../constants.js";

const uuidSchema = z.string().uuid();
const isoDateSchema = z.string().datetime({ offset: true });
const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, digits, and dashes");

export const superSystemSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1).max(200),
  slug: slugSchema,
  official: z.boolean(),
  description: z.string().max(10_000).nullable().optional(),
  external_url: z.string().url().nullable().optional(),
  created_at: isoDateSchema,
  updated_at: isoDateSchema,
});

export const centerSchema = z
  .object({ lat: z.number(), lon: z.number() })
  .nullable()
  .optional();

export const systemSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1).max(200),
  slug: slugSchema,
  boundary: z.unknown().nullable().optional(),
  ownership_source: z.string().max(500).nullable().optional(),
  source_date: z.string().date().nullable().optional(),
  description: z.string().max(10_000).nullable().optional(),
  external_url: z.string().url().nullable().optional(),
  created_at: isoDateSchema,
  updated_at: isoDateSchema,
  center: centerSchema,
});

export const subSystemSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1).max(200),
  slug: slugSchema,
  system_id: uuidSchema,
  geometry: z.unknown().nullable().optional(),
  description: z.string().max(10_000).nullable().optional(),
  created_at: isoDateSchema,
  updated_at: isoDateSchema,
});

export const trailSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1).max(200),
  slug: slugSchema,
  geometry: z.unknown().nullable().optional(),
  description: z.string().max(10_000).nullable().optional(),
  difficulty: z.enum(DIFFICULTIES).nullable().optional(),
  length_meters: z.number().nonnegative().nullable().optional(),
  elevation_gain_meters: z.number().nonnegative().nullable().optional(),
  verified: z.boolean().optional(),
  created_at: isoDateSchema,
  updated_at: isoDateSchema,
  center: centerSchema,
});

export const trailSegmentSchema = z.object({
  id: uuidSchema,
  trail_id: uuidSchema,
  name: z.string().max(200).nullable().optional(),
  geometry: z.unknown(),
  sort_order: z.number().int().nonnegative(),
  surface_type: z.enum(SURFACE_TYPES).nullable().optional(),
  hazards: z.array(z.string()).default([]),
  is_road_connector: z.boolean(),
  steep_grade: z.boolean(),
  one_way: z.boolean(),
  description: z.string().max(10_000).nullable().optional(),
  length_meters: z.number().nonnegative().nullable().optional(),
  created_at: isoDateSchema,
  updated_at: isoDateSchema,
});

export const featureSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1).max(200),
  type_tag: z.enum(FEATURE_TYPES),
  point: z.unknown(),
  trail_id: uuidSchema.nullable().optional(),
  system_id: uuidSchema.nullable().optional(),
  description: z.string().max(10_000).nullable().optional(),
  created_at: isoDateSchema,
  updated_at: isoDateSchema,
  center: centerSchema,
});

export const wikiPageSchema = z.object({
  id: uuidSchema,
  target_type: z.enum(WIKI_TARGET_TYPES),
  target_id: uuidSchema,
  title: z.string().min(1).max(300),
  content_md: z.string().max(200_000),
  rendered_html: z.string().max(500_000),
  created_at: isoDateSchema,
  updated_at: isoDateSchema,
});

export const citationSchema = z.object({
  id: uuidSchema,
  wiki_page_id: uuidSchema,
  url: z.string().url().nullable().optional(),
  title: z.string().min(1).max(300),
  image_data: z.string().nullable().optional(),
  image_mime_type: z.string().nullable().optional(),
  created_at: isoDateSchema,
});

export const revisionSchema = z.object({
  id: uuidSchema,
  wiki_page_id: uuidSchema,
  content_md: z.string().max(200_000),
  contributor_name: z.string().min(1).max(120),
  author_id: uuidSchema.nullable().optional(),
  edit_summary: z.string().max(500).nullable().optional(),
  created_at: isoDateSchema,
});

export const mediaSchema = z.object({
  id: uuidSchema,
  feature_id: uuidSchema.nullable().optional(),
  trail_id: uuidSchema.nullable().optional(),
  system_id: uuidSchema.nullable().optional(),
  data: z.string(),
  mime_type: z.string().min(1).max(120),
  caption: z.string().max(500).nullable().optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  created_at: isoDateSchema,
});

export const offlinePackInfoSchema = z.object({
  system_id: uuidSchema,
  tile_size_bytes: z.number().int().nonnegative(),
  geojson_size_bytes: z.number().int().nonnegative(),
  wiki_size_bytes: z.number().int().nonnegative(),
  total_size_bytes: z.number().int().nonnegative(),
  generated_at: isoDateSchema.nullable(),
});

export const pendingContributionSchema = z.object({
  id: z.number().int().positive(),
  entity_type: z.string().min(1).max(60),
  entity_id: z.string().nullable(),
  action: z.enum(["create", "update", "delete"]),
  payload: z.record(z.string(), z.unknown()),
  contributor_name: z.string().min(1).max(120),
  created_at: z.string(),
  sync_status: z.enum(["pending", "syncing", "conflict", "synced"]),
  server_id: z.string().nullable().optional(),
  conflict_revision_id: z.string().nullable().optional(),
});

export const createSystemInputSchema = systemSchema
  .pick({ name: true, slug: true, description: true, external_url: true, ownership_source: true, source_date: true })
  .partial({ description: true, external_url: true, ownership_source: true, source_date: true });

export const createTrailInputSchema = trailSchema
  .pick({ name: true, slug: true, description: true, difficulty: true, length_meters: true, elevation_gain_meters: true })
  .partial({ description: true, difficulty: true, length_meters: true, elevation_gain_meters: true });

export const createFeatureInputSchema = featureSchema.pick({
  name: true,
  type_tag: true,
  point: true,
  trail_id: true,
  system_id: true,
  description: true,
});

export const updateWikiPageInputSchema = z.object({
  title: z.string().min(1).max(300),
  content_md: z.string().max(200_000),
  contributor_name: z.string().min(1).max(120).default("anonymous"),
  edit_summary: z.string().max(500).optional(),
  base_revision_id: uuidSchema.optional(),
});

export const createWikiPageInputSchema = z.object({
  target_type: z.enum(WIKI_TARGET_TYPES),
  target_id: uuidSchema,
  title: z.string().min(1).max(300),
  content_md: z.string().max(200_000).default(""),
  contributor_name: z.string().min(1).max(120).default("anonymous"),
  edit_summary: z.string().max(500).optional(),
});

export const revertWikiPageInputSchema = z.object({
  revision_id: uuidSchema,
  contributor_name: z.string().min(1).max(120).default("anonymous"),
  edit_summary: z.string().max(500).optional(),
});

export const createCitationInputSchema = z.object({
  wiki_page_id: uuidSchema,
  url: z.string().url().nullable().optional(),
  title: z.string().min(1).max(300),
  image_data: z.string().nullable().optional(),
  image_mime_type: z.string().nullable().optional(),
});

export const wikiPageQuerySchema = z.object({
  target_type: z.enum(WIKI_TARGET_TYPES),
  target_id: uuidSchema,
});

export const searchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  type: z.enum(["system", "trail", "feature", "all"]).default("all"),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const updateFeatureInputSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    type_tag: z.enum(FEATURE_TYPES).optional(),
    description: z.string().max(10_000).nullable().optional(),
    trail_id: uuidSchema.nullable().optional(),
    system_id: uuidSchema.nullable().optional(),
  })
  .strict();

export const createMediaInputSchema = z.object({
  feature_id: uuidSchema.optional(),
  trail_id: uuidSchema.optional(),
  system_id: uuidSchema.optional(),
  data: z.string().min(1),
  mime_type: z.string().min(1).max(120),
  caption: z.string().max(500).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

export const createSegmentInputSchema = z
  .object({
    name: z.string().max(200).nullable().optional(),
    geometry: z.unknown(),
    sort_order: z.number().int().nonnegative().optional(),
    surface_type: z.enum(SURFACE_TYPES).nullable().optional(),
    hazards: z.array(z.string().max(120)).max(20).optional(),
    is_road_connector: z.boolean().optional(),
    steep_grade: z.boolean().optional(),
    one_way: z.boolean().optional(),
    description: z.string().max(10_000).nullable().optional(),
  })
  .strict();

export const updateSegmentInputSchema = z
  .object({
    name: z.string().max(200).nullable().optional(),
    sort_order: z.number().int().nonnegative().optional(),
    surface_type: z.enum(SURFACE_TYPES).nullable().optional(),
    hazards: z.array(z.string().max(120)).max(20).optional(),
    is_road_connector: z.boolean().optional(),
    steep_grade: z.boolean().optional(),
    one_way: z.boolean().optional(),
    description: z.string().max(10_000).nullable().optional(),
  })
  .strict();

export const reorderSegmentsInputSchema = z.object({
  ordered_ids: z.array(uuidSchema).min(1),
});

export const splitSegmentInputSchema = z.object({
  segment_id: uuidSchema,
  split_at: z.number().min(0).max(1),
  name_a: z.string().max(200).optional(),
  name_b: z.string().max(200).optional(),
});

export const mergeSegmentsInputSchema = z.object({
  segment_id_a: uuidSchema,
  segment_id_b: uuidSchema,
  name: z.string().max(200).optional(),
});

export const mediaListResponseSchema = z.object({
  items: z.array(mediaSchema.omit({ data: true }).extend({ thumbnail_url: z.string() })),
  total: z.number().int().nonnegative(),
});
