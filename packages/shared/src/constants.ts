export const FEATURE_TYPES = [
  "trailhead",
  "shelter",
  "water_source",
  "scenic_point",
  "restroom",
  "parking",
  "campground",
  "bridge",
  "tunnel",
  "sign",
  "intersection",
  "other",
] as const;

export const DIFFICULTIES = ["easy", "moderate", "hard", "expert"] as const;

export const SURFACE_TYPES = ["natural", "gravel", "paved", "boardwalk", "road_connector"] as const;

export const WIKI_TARGET_TYPES = [
  "super_system",
  "system",
  "sub_system",
  "trail",
  "feature",
] as const;

export const SYNC_ACTIONS = ["create", "update", "delete"] as const;
export const SYNC_STATUSES = ["pending", "syncing", "conflict", "synced"] as const;

export const SURFACE_COLORS: Record<(typeof SURFACE_TYPES)[number], string> = {
  natural: "#8B4513",
  gravel: "#C2B280",
  paved: "#4A4A4A",
  boardwalk: "#A0522D",
  road_connector: "#888888",
};

export const DIFFICULTY_COLORS: Record<(typeof DIFFICULTIES)[number], string> = {
  easy: "#22c55e",
  moderate: "#eab308",
  hard: "#f97316",
  expert: "#ef4444",
};

export const FEATURE_ICONS: Record<(typeof FEATURE_TYPES)[number], string> = {
  trailhead: "P",
  shelter: "S",
  water_source: "W",
  scenic_point: "V",
  restroom: "R",
  parking: "K",
  campground: "C",
  bridge: "B",
  tunnel: "T",
  sign: "I",
  intersection: "X",
  other: "?",
};

export const STORAGE_SOFT_WARN_BYTES = 400 * 1024 * 1024;
export const STORAGE_HARD_CAP_BYTES = 500 * 1024 * 1024;
export const OFFLINE_TILE_ZOOM_DETAIL_MAX = 14;
export const OFFLINE_TILE_ZOOM_OVERVIEW_MAX = 9;

export type QualityLevelKey = "basic" | "standard" | "high" | "maximum";

export interface QualityLevel {
  key: QualityLevelKey;
  label: string;
  minZoom: number;
  maxZoom: number;
}

export const QUALITY_LEVELS: Record<QualityLevelKey, QualityLevel> = {
  basic: { key: "basic", label: "Basic", minZoom: 2, maxZoom: 8 },
  standard: { key: "standard", label: "Standard", minZoom: 2, maxZoom: 10 },
  high: { key: "high", label: "High", minZoom: 2, maxZoom: 12 },
  maximum: { key: "maximum", label: "Maximum", minZoom: 2, maxZoom: 14 },
};

export const QUALITY_LEVEL_ORDER: QualityLevelKey[] = ["basic", "standard", "high", "maximum"];

export const DEFAULT_OFFLINE_QUALITY: QualityLevelKey = "high";

export const DEFAULT_OFFLINE_MIN_ZOOM = 2;

export const USER_ROLES = ["contributor", "moderator", "admin", "banned"] as const;
export const ATTESTATION_QUORUM_DEFAULT = 3;
export const ATTESTATION_TRACK_OVERLAP_THRESHOLD = 0.8;

// ========== Presets (§21.4) ==========

export const PRESET_CATEGORIES = [
  "rest_shelter",
  "water_sanitation",
  "navigation",
  "hazards_obstacles",
  "landmarks",
] as const;
export type PresetCategory = (typeof PRESET_CATEGORIES)[number];

export const PRESET_CATEGORY_LABELS: Record<PresetCategory, string> = {
  rest_shelter: "Rest & Shelter",
  water_sanitation: "Water & Sanitation",
  navigation: "Navigation",
  hazards_obstacles: "Hazards & Obstacles",
  landmarks: "Landmarks",
};

export const PRESET_QUESTION_TYPES = ["boolean", "select"] as const;
export type PresetQuestionType = (typeof PRESET_QUESTION_TYPES)[number];

/**
 * Hard cap on a single select question's options (per §21.4 spec).
 */
export const PRESET_SELECT_MAX_OPTIONS = 5;
/**
 * Hard cap on questions per preset. 5 is the working budget for the
 * hiker-optimized sheet (no typing required).
 */
export const PRESET_QUESTIONS_MAX = 5;

// Default presets shipped in the seed migration. Keys match the legacy
// `FEATURE_TYPES` enum so existing rows backfill cleanly.
export const DEFAULT_PRESET_KEYS = [
  // Rest & Shelter
  "bench",
  "picnic_table",
  "shelter",
  "campsite",
  // Water & Sanitation
  "drinking_water",
  "spring",
  "restroom",
  "waste_basket",
  // Navigation
  "trailhead",
  "map_board",
  "guidepost",
  "sign",
  "intersection",
  // Hazards & Obstacles
  "fallen_tree",
  "washout",
  "steep_section",
  "road_connector",
  // Landmarks
  "viewpoint",
  "notable_tree",
  "waterfall",
  "cave_entrance",
  "bridge",
  "tunnel",
] as const;
export type DefaultPresetKey = (typeof DEFAULT_PRESET_KEYS)[number];

// ========== Karma / trust tiers (§21.7) ==========

export const TRUST_TIERS = ["new", "established", "trusted", "moderator"] as const;
export type TrustTier = (typeof TRUST_TIERS)[number];

export const TRUST_TIER_THRESHOLDS: Record<TrustTier, number> = {
  new: 0,
  established: 50,
  trusted: 500,
  moderator: Number.POSITIVE_INFINITY,
};

export const TIER_WEIGHTS: Record<TrustTier, number> = {
  new: 1,
  established: 2,
  trusted: 3,
  moderator: 3,
};

export const TIER_LABELS: Record<TrustTier, string> = {
  new: "New",
  established: "Established",
  trusted: "Trusted",
  moderator: "Moderator",
};

export const TIER_COLORS: Record<TrustTier, string> = {
  new: "#9ca3af",
  established: "#3b82f6",
  trusted: "#22c55e",
  moderator: "#a855f7",
};

// Net score threshold below which a feature/preset/system is auto-hidden (§21.7)
export const ENTITY_HIDE_NET_SCORE_THRESHOLD = -3;

// Wilson-style trace weight floor (§21.6). weight = (up+1 - down) / (up+down+2).
// Below this the trace is `ignored` by synthesis.
export const TRACE_WEIGHT_FLOOR = 0.3;

// ========== Protection tiers (§21.8) ==========

export const PROTECTION_LEVELS = ["normal", "semi", "full"] as const;
export type ProtectionLevel = (typeof PROTECTION_LEVELS)[number];

// Auto-promote to "semi" when an entity has at least this many net upvotes OR
// at least this many direct children (other entities referencing it).
export const PROTECTION_SEMI_UPVOTE_THRESHOLD = 10;
export const PROTECTION_SEMI_CHILDREN_THRESHOLD = 3;
export const PROTECTION_FULL_UPVOTE_THRESHOLD = 100;

// ========== Patrol (§21.8) ==========

export const PATROL_FLAG_REASONS = [
  "new_tier_semi_edit",
  "new_tier_revert_burst",
  "negative_karma_delete_revert",
  "mass_revert_popular",
  "mod_override",
] as const;
export type PatrolFlagReason = (typeof PATROL_FLAG_REASONS)[number];

// "More than N reversions in T minutes" threshold for `new_tier_revert_burst`.
export const PATROL_REVERT_BURST_COUNT = 5;
export const PATROL_REVERT_BURST_WINDOW_MIN = 10;

// ========== Revisions — generalized target types (§21.8) ==========

export const REVISION_TARGET_TYPES = [
  "wiki_page",
  "system",
  "super_system",
  "sub_system",
  "preset",
  "feature",
  "trace",
  "trail",
] as const;
export type RevisionTargetType = (typeof REVISION_TARGET_TYPES)[number];

export const REVISION_ACTIONS = [
  "create",
  "update",
  "delete",
  "revert",
  "assign",
  "reassign",
] as const;
export type RevisionAction = (typeof REVISION_ACTIONS)[number];

// ========== Votes (§21.7) ==========

export const VOTE_TARGET_TYPES = [
  "feature",
  "trace",
  "preset",
  "system",
  "wiki_page",
  "trail",
] as const;
export type VoteTargetType = (typeof VOTE_TARGET_TYPES)[number];

export const VOTE_VALUES = [-1, 1] as const;
export type VoteValue = (typeof VOTE_VALUES)[number];

// ========== Trail tiers (§21.6) ==========

export const TRAIL_TIERS = ["premium", "elevated", "synthesized"] as const;
export type TrailTier = (typeof TRAIL_TIERS)[number];

export const TRAIL_TIER_LABELS: Record<TrailTier, string> = {
  premium: "Premium",
  elevated: "Elevated",
  synthesized: "Synthesized",
};

export const TRAIL_TIER_COLORS: Record<TrailTier, string> = {
  premium: "#a855f7",
  elevated: "#22c55e",
  synthesized: "#3b82f6",
};
