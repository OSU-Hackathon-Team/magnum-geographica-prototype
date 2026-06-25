import { z } from "zod";
import {
  DIFFICULTIES,
  SURFACE_TYPES,
  FEATURE_TYPES,
  WIKI_TARGET_TYPES,
  USER_ROLES,
  TRUST_TIERS,
  PROTECTION_LEVELS,
  REVISION_TARGET_TYPES,
  REVISION_ACTIONS,
  VOTE_TARGET_TYPES,
  VOTE_VALUES,
  PATROL_FLAG_REASONS,
  TRAIL_TIERS,
  PRESET_CATEGORIES,
  PRESET_QUESTION_TYPES,
  PRESET_QUESTIONS_MAX,
  PRESET_SELECT_MAX_OPTIONS,
} from "../constants.js";

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

export const centerSchema = z.object({ lat: z.number(), lon: z.number() }).nullable().optional();

export const systemSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1).max(200),
  slug: slugSchema,
  color: z.string().min(1).max(7).optional(),
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
  // Legacy hardcoded tag (deprecated in favor of preset_id but still
  // accepted for backwards compat with rows that pre-date the preset
  // migration).
  type_tag: z.enum(FEATURE_TYPES).nullable().optional(),
  // §21.4 — the canonical identifier going forward. Mutually exclusive
  // with `type_tag` for new features but older features may have both.
  preset_id: uuidSchema.nullable().optional(),
  preset_key: z.string().min(1).max(60).nullable().optional(),
  preset_label: z.string().min(1).max(120).nullable().optional(),
  preset_icon_name: z.string().min(1).max(60).nullable().optional(),
  preset_icon_color: z.string().min(1).max(20).nullable().optional(),
  // Free-form user answers to the preset's questions. Validated server-side
  // against the preset's question schema.
  answers: z.record(z.string(), z.unknown()).nullable().optional(),
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
  .pick({
    name: true,
    slug: true,
    description: true,
    external_url: true,
    ownership_source: true,
    source_date: true,
  })
  .partial({ description: true, external_url: true, ownership_source: true, source_date: true });

export const createTrailInputSchema = trailSchema
  .pick({
    name: true,
    slug: true,
    description: true,
    difficulty: true,
    length_meters: true,
    elevation_gain_meters: true,
  })
  .partial({
    description: true,
    difficulty: true,
    length_meters: true,
    elevation_gain_meters: true,
  });

export const createFeatureInputSchema = z.object({
  name: z.string().min(1).max(200),
  // Either `preset_id` (preferred) or `type_tag` (legacy) must be supplied.
  preset_id: uuidSchema.optional(),
  type_tag: z.enum(FEATURE_TYPES).optional(),
  point: z.unknown(),
  trail_id: uuidSchema.nullable().optional(),
  system_id: uuidSchema.nullable().optional(),
  description: z.string().max(10_000).nullable().optional(),
  answers: z.record(z.string(), z.unknown()).optional(),
});

export const updateFeatureInputSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    preset_id: uuidSchema.nullable().optional(),
    type_tag: z.enum(FEATURE_TYPES).optional(),
    description: z.string().max(10_000).nullable().optional(),
    trail_id: uuidSchema.nullable().optional(),
    system_id: uuidSchema.nullable().optional(),
    answers: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

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

export const bboxDownloadRequestSchema = z
  .object({
    minLon: z.number().min(-180).max(180),
    minLat: z.number().min(-90).max(90),
    maxLon: z.number().min(-180).max(180),
    maxLat: z.number().min(-90).max(90),
    baseLayerId: z.string().min(1).max(60),
    minZoom: z.number().int().min(0).max(18),
    maxZoom: z.number().int().min(0).max(18),
  })
  .refine((d) => d.minLon < d.maxLon && d.minLat < d.maxLat && d.minZoom <= d.maxZoom, {
    message: "min must be less than max for lon, lat, and zoom",
  });

export const bboxInfoResponseSchema = z.object({
  tileCount: z.number().int().nonnegative(),
  estimatedTileBytes: z.number().int().nonnegative(),
  entityCounts: z.object({
    systems: z.number().int().nonnegative(),
    trails: z.number().int().nonnegative(),
    features: z.number().int().nonnegative(),
    wikiPages: z.number().int().nonnegative(),
  }),
  totalEstimatedBytes: z.number().int().nonnegative(),
});

export const offlineRegionSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1).max(200),
  baseLayerId: z.string().min(1).max(60),
  minLon: z.number(),
  minLat: z.number(),
  maxLon: z.number(),
  maxLat: z.number(),
  minZoom: z.number().int(),
  maxZoom: z.number().int(),
  totalTiles: z.number().int().nonnegative(),
  tileSizeBytes: z.number().int().nonnegative(),
  geojsonSizeBytes: z.number().int().nonnegative(),
  wikiSizeBytes: z.number().int().nonnegative(),
  tilesPath: z.string().nullable(),
  generatedAt: z.string().nullable(),
  lastSynced: z.string().nullable(),
  createdAt: z.string(),
});

export const bboxPackGenerateResponseSchema = z.object({
  packId: uuidSchema,
  tileCount: z.number().int().nonnegative(),
  tileSizeBytes: z.number().int().nonnegative(),
  geojsonSizeBytes: z.number().int().nonnegative(),
  wikiSizeBytes: z.number().int().nonnegative(),
  totalSizeBytes: z.number().int().nonnegative(),
  entityCounts: z.object({
    systems: z.number().int().nonnegative(),
    trails: z.number().int().nonnegative(),
    features: z.number().int().nonnegative(),
    wikiPages: z.number().int().nonnegative(),
  }),
});

export const userSchema = z.object({
  id: uuidSchema,
  username: z.string().min(1).max(80),
  display_name: z.string().max(120).nullable().optional(),
  email: z.string().email().max(254),
  password_hash: z.string(),
  role: z.enum(USER_ROLES),
  trust_score: z.number(),
  created_at: isoDateSchema,
  updated_at: isoDateSchema,
});

export const registerRequestSchema = z.object({
  username: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-zA-Z0-9_-]+$/, "username must be alphanumeric, dashes, underscores"),
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  display_name: z.string().max(120).optional(),
});

export const loginRequestSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

export const authTokensSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
  user: userSchema.omit({ password_hash: true }),
});

export const userProfileSchema = userSchema.omit({ password_hash: true });

export const userUpdateSchema = z.object({
  display_name: z.string().max(120).nullable().optional(),
  username: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional(),
});

// ========== Karma / trust tier §21.7 ==========

export const trustTierSchema = z.enum(TRUST_TIERS);

export const userKarmaSchema = z.object({
  user_id: uuidSchema,
  karma: z.number(),
  tier: trustTierSchema,
  tier_label: z.string(),
  upvotes_received: z.number().int().nonnegative(),
  downvotes_received: z.number().int().nonnegative(),
  trace_count: z.number().int().nonnegative().default(0),
  feature_count: z.number().int().nonnegative().default(0),
  revision_count: z.number().int().nonnegative().default(0),
});

// ========== Votes §21.7 ==========

export const voteTargetTypeSchema = z.enum(VOTE_TARGET_TYPES);

export const castVoteInputSchema = z.object({
  target_type: voteTargetTypeSchema,
  target_id: uuidSchema,
  value: z.union([z.literal(-1), z.literal(1)]),
});

export const voteRecordSchema = z.object({
  id: uuidSchema,
  target_type: voteTargetTypeSchema,
  target_id: uuidSchema,
  user_id: uuidSchema.nullable(),
  value: z.union([z.literal(-1), z.literal(1)]),
  created_at: isoDateSchema,
});

export const entityScoreSchema = z.object({
  target_type: voteTargetTypeSchema,
  target_id: uuidSchema,
  upvotes: z.number().int().nonnegative(),
  downvotes: z.number().int().nonnegative(),
  net: z.number().int(),
  hidden: z.boolean(),
  my_vote: z.union([z.literal(-1), z.literal(0), z.literal(1)]).optional(),
});

// ========== Protection §21.8 ==========

export const protectionLevelSchema = z.enum(PROTECTION_LEVELS);

export const entityProtectionSchema = z.object({
  target_type: voteTargetTypeSchema,
  target_id: uuidSchema,
  level: protectionLevelSchema,
  upvotes: z.number().int().nonnegative(),
  children: z.number().int().nonnegative(),
  reason: z.string().nullable(),
});

// ========== Revisions (generalized) §21.8 ==========

export const revisionTargetTypeSchema = z.enum(REVISION_TARGET_TYPES);
export const revisionActionSchema = z.enum(REVISION_ACTIONS);

export const revisionGeneralizedSchema = z.object({
  id: uuidSchema,
  target_type: revisionTargetTypeSchema,
  target_id: uuidSchema,
  // For wiki_page revisions only — the original schema's content_md is preserved
  // for backwards-compat. New entity revisions store `payload_after` instead.
  wiki_page_id: uuidSchema.nullable().optional(),
  content_md: z.string().nullable().optional(),
  payload_before: z.record(z.string(), z.unknown()).nullable().optional(),
  payload_after: z.record(z.string(), z.unknown()).nullable().optional(),
  action: revisionActionSchema,
  contributor_name: z.string().min(1).max(120),
  author_id: uuidSchema.nullable().optional(),
  edit_summary: z.string().max(500).nullable().optional(),
  reverted_from_id: uuidSchema.nullable().optional(),
  created_at: isoDateSchema,
});

export const revisionQuerySchema = z.object({
  target_type: revisionTargetTypeSchema.optional(),
  target_id: uuidSchema.optional(),
  author_id: uuidSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const revertRevisionInputSchema = z.object({
  contributor_name: z.string().min(1).max(120).default("anonymous"),
  edit_summary: z.string().max(500).optional(),
});

// ========== Patrol §21.8 ==========

export const patrolFlagReasonSchema = z.enum(PATROL_FLAG_REASONS);

export const patrolFlagSchema = z.object({
  id: uuidSchema,
  revision_id: uuidSchema,
  reason: patrolFlagReasonSchema,
  details: z.record(z.string(), z.unknown()).nullable().optional(),
  resolved: z.boolean(),
  resolved_by: uuidSchema.nullable().optional(),
  resolved_at: isoDateSchema.nullable().optional(),
  created_at: isoDateSchema,
});

export const patrolQuerySchema = z.object({
  reason: patrolFlagReasonSchema.optional(),
  user_id: uuidSchema.optional(),
  resolved: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const patrolActionSchema = z.object({
  flag_id: uuidSchema.optional(),
  revision_id: uuidSchema.optional(),
  action: z.enum(["resolve", "revert", "rollback"]),
});

// ========== Presets §21.4 ==========

const presetCategorySchema = z.enum(PRESET_CATEGORIES);
const presetQuestionTypeSchema = z.enum(PRESET_QUESTION_TYPES);

const presetOptionSchema = z.object({
  value: z.string().min(1).max(60),
  label: z.string().min(1).max(120),
});

const presetQuestionSchema = z
  .object({
    key: z
      .string()
      .min(1)
      .max(60)
      .regex(/^[a-z][a-z0-9_]*$/, "question key must be snake_case"),
    type: presetQuestionTypeSchema,
    label: z.string().min(1).max(200),
    // Required only for `select` questions. Hard-capped to 5 options.
    options: z.array(presetOptionSchema).max(PRESET_SELECT_MAX_OPTIONS).optional(),
  })
  .strict();

const presetQuestionsSchema = z
  .array(presetQuestionSchema)
  .max(PRESET_QUESTIONS_MAX)
  .default([]);

export const presetSchema = z.object({
  id: uuidSchema,
  key: z.string().min(1).max(60),
  label: z.string().min(1).max(120),
  icon_name: z.string().min(1).max(60),
  icon_color: z.string().min(1).max(20),
  category: presetCategorySchema,
  osm_tags: z.record(z.string(), z.string()).default({}),
  questions: presetQuestionsSchema,
  upstreamable: z.boolean().default(false),
  sort_order: z.number().int().min(0).max(10_000).default(100),
  created_by: uuidSchema.nullable().optional(),
  created_at: isoDateSchema,
  updated_at: isoDateSchema,
});

export const createPresetInputSchema = z
  .object({
    key: z
      .string()
      .min(1)
      .max(60)
      .regex(/^[a-z][a-z0-9_]*$/, "preset key must be snake_case"),
    label: z.string().min(1).max(120),
    icon_name: z.string().min(1).max(60),
    icon_color: z.string().min(1).max(20),
    category: presetCategorySchema,
    osm_tags: z.record(z.string(), z.string()).optional(),
    questions: presetQuestionsSchema.optional(),
    upstreamable: z.boolean().optional(),
    sort_order: z.number().int().min(0).max(10_000).optional(),
  })
  .strict();

export const updatePresetInputSchema = z
  .object({
    label: z.string().min(1).max(120).optional(),
    icon_name: z.string().min(1).max(60).optional(),
    icon_color: z.string().min(1).max(20).optional(),
    category: presetCategorySchema.optional(),
    osm_tags: z.record(z.string(), z.string()).optional(),
    questions: presetQuestionsSchema.optional(),
    upstreamable: z.boolean().optional(),
    sort_order: z.number().int().min(0).max(10_000).optional(),
  })
  .strict();

export const presetQuerySchema = z.object({
  category: presetCategorySchema.optional(),
  upstreamable: z.coerce.boolean().optional(),
});

/**
 * Validate a feature's `answers` against a preset's `questions`. The result
 * is a `{ ok, errors }` shape — we don't throw because callers want a
 * structured error to surface to the user.
 */
export function validateAnswers(
  questions: Array<{ key: string; type: "boolean" | "select"; options?: Array<{ value: string }> }>,
  answers: Record<string, unknown> | null | undefined,
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const ans = (answers ?? {}) as Record<string, unknown>;
  for (const q of questions) {
    const v = ans[q.key];
    if (v === undefined || v === null) continue; // optional answers are allowed
    if (q.type === "boolean" && typeof v !== "boolean") {
      errors.push(`answers.${q.key} must be a boolean`);
    }
    if (q.type === "select") {
      if (typeof v !== "string") {
        errors.push(`answers.${q.key} must be a string`);
        continue;
      }
      const allowed = (q.options ?? []).map((o) => o.value);
      if (allowed.length > 0 && !allowed.includes(v)) {
        errors.push(`answers.${q.key} must be one of: ${allowed.join(", ")}`);
      }
    }
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

// ========== Trail tiers §21.6 ==========

export const trailTierSchema = z.enum(TRAIL_TIERS);
