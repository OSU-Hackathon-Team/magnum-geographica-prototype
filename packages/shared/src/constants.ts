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

export const SURFACE_TYPES = [
  "natural",
  "gravel",
  "paved",
  "boardwalk",
  "road_connector",
] as const;

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

export const ATTESTATION_QUORUM_DEFAULT = 3;
export const ATTESTATION_TRACK_OVERLAP_THRESHOLD = 0.8;
