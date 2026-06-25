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

// ========== Hierarchy actions (§21.5) ==========

export const HIERARCHY_ACTIONS = [
  "move_to_super",
  "move_out_of_super",
  "promote_to_system",
  "demote_to_sub_system",
  "merge_into",
  "assign_trail",
  "unassign_trail",
] as const;
export type HierarchyAction = (typeof HIERARCHY_ACTIONS)[number];

// Required provenance fields for a system boundary per outline.md.
// `ownership_source` and `source_date` are NOT NULL; the route layer
// rejects new systems that don't supply both.
export const PROVENANCE_SOURCES = [
  "PAD-US",
  "USGS",
  "USDA-FS",
  "OSM",
  "state-gis",
  "county-gis",
  "user-drawn",
  "imported",
] as const;
export type ProvenanceSource = (typeof PROVENANCE_SOURCES)[number];

// ========== GPS traces (§21.6) ==========

export const TRACE_SOURCES = ["import", "recorded"] as const;
export type TraceSource = (typeof TRACE_SOURCES)[number];

export const TRACE_STATUSES = ["active", "ignored", "removed"] as const;
export type TraceStatus = (typeof TRACE_STATUSES)[number];

// Hard limits — a 24h recording is more than enough, 50k points is
// well past the upper bound of a 30s-interval walkathon trace.
export const TRACE_MAX_POINTS = 50_000;
export const TRACE_MAX_DURATION_HOURS = 24;
// Per §21.6 — segments are cut at significant vertices. The simplify
// tolerance is in meters; a small number preserves shape, a larger
// number smooths aggressively. The default is tuned for foot-traces.
export const TRACE_SIMPLIFY_TOLERANCE_M = 5;

/**
 * Wilson-style weight floor (§21.6 trace lifecycle). A trace whose
 * weight drops below this gets `status='ignored'` and is excluded
 * from future synthesis runs; the vote history is preserved.
 */
export const TRACE_WEIGHT_IGNORED_FLOOR = 0.3;

/**
 * Wilson-style confidence weight for a single trace's votes:
 *   (u + 1 − d) / (u + d + 2)
 * Bounded to [0, 1] — single early downvotes already demote.
 */
export function computeTraceWeight(upvotes: number, downvotes: number): number {
  return Math.max(0, Math.min(1, (upvotes + 1 - downvotes) / (upvotes + downvotes + 2)));
}

/** Polyline simplification (Ramer–Douglas–Peucker) on a list of
 * `[lon, lat]` vertices. Distance is approximated in meters via the
 * equirectangular projection at the centroid latitude. This is good
 * enough for trace-cleaning at the scales we care about (5m error at
 * the equator is negligible for our use case).
 */
export function simplifyRdp(
  points: Array<[number, number]>,
  toleranceMeters: number,
): Array<[number, number]> {
  if (points.length <= 2 || toleranceMeters <= 0) return points;
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const popped = stack.pop();
    if (!popped) break;
    const [start, end] = popped;
    const a = points[start]!;
    const b = points[end]!;
    let maxDist = 0;
    let maxIdx = -1;
    for (let i = start + 1; i < end; i++) {
      const d = perpDistanceMeters(points[i]!, a, b);
      if (d > maxDist) {
        maxDist = d;
        maxIdx = i;
      }
    }
    if (maxDist > toleranceMeters && maxIdx > -1) {
      keep[maxIdx] = true;
      stack.push([start, maxIdx]);
      stack.push([maxIdx, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function perpDistanceMeters(
  p: [number, number],
  a: [number, number],
  b: [number, number],
): number {
  // Equirectangular projection at the segment's centroid latitude.
  const [lon, lat] = p;
  const [aLon, aLat] = a;
  const [bLon, bLat] = b;
  const lat0 = (aLat + bLat) / 2;
  const cosLat = Math.cos((lat0 * Math.PI) / 180);
  const ax = (aLon - lon) * cosLat;
  const ay = aLat - lat;
  const bx = (bLon - lon) * cosLat;
  const by = bLat - lat;
  // |AB|^2 in lon/lat space (not strictly the projection but close
  // enough at our scales).
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(ax, ay) * 111_320;
  const t = Math.max(0, Math.min(1, (-(ax * dx) - ay * dy) / (dx * dx + dy * dy)));
  const px = ax + dx * t;
  const py = ay + dy * t;
  return Math.hypot(px, py) * 111_320;
}

/**
 * Total planar length of a polyline in meters.
 */
export function traceLengthMeters(points: Array<[number, number]>): number {
  if (points.length < 2) return 0;
  let total = 0;
  const cosLat = Math.cos((points[0]![1] * Math.PI) / 180);
  for (let i = 1; i < points.length; i++) {
    const [lon1, lat1] = points[i - 1]!;
    const [lon2, lat2] = points[i]!;
    const dx = (lon2 - lon1) * cosLat;
    const dy = lat2 - lat1;
    total += Math.hypot(dx, dy) * 111_320;
  }
  return total;
}

/**
 * Split a polyline into segments at "significant" vertices — points
 * where the heading changes by more than `angleThresholdDeg` from the
 * average. Returns the list of sub-polylines.
 */
export function splitAtTurns(
  points: Array<[number, number]>,
  angleThresholdDeg: number,
): Array<Array<[number, number]>> {
  if (points.length < 3) return [points];
  const out: Array<Array<[number, number]>> = [];
  let current: Array<[number, number]> = [points[0]!];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]!;
    const here = points[i]!;
    const next = points[i + 1]!;
    const headingIn = Math.atan2(here[1] - prev[1], here[0] - prev[0]);
    const headingOut = Math.atan2(next[1] - here[1], next[0] - here[0]);
    let d = Math.abs(headingOut - headingIn) * (180 / Math.PI);
    if (d > 180) d = 360 - d;
    current.push(here);
    if (d > angleThresholdDeg) {
      out.push(current);
      current = [here];
    }
  }
  current.push(points[points.length - 1]!);
  out.push(current);
  return out;
}

/**
 * Parse a GPX file into a list of `[lon, lat]` vertices. We accept
 * any `<trkpt>` regardless of namespace; the rest of the GPX is
 * ignored. The parser is intentionally lenient — bad input throws so
 * the route can surface a useful 400.
 */
export function parseGpx(gpx: string): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  const trkptRegex = /<trkpt\b[^>]*lat="([^"]+)"\s*lon="([^"]+)"/gi;
  let match: RegExpExecArray | null;
  while ((match = trkptRegex.exec(gpx)) !== null) {
    const lat = Number(match[1]);
    const lon = Number(match[2]);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      points.push([lon, lat]);
    }
  }
  if (points.length === 0) {
    throw new Error("GPX has no <trkpt> entries");
  }
  return points;
}

/**
 * Parse a GeoJSON LineString/MultiLineString into a list of vertices.
 * Only `LineString` and `MultiLineString` are accepted; throws on
 * anything else.
 */
export function parseGeoJsonTrace(input: unknown): Array<[number, number]> {
  if (!input || typeof input !== "object") {
    throw new Error("GeoJSON must be an object");
  }
  const gj = input as { type?: string; coordinates?: unknown };
  if (gj.type === "LineString") {
    if (!Array.isArray(gj.coordinates)) throw new Error("LineString missing coordinates");
    return gj.coordinates.map((c) => {
      if (!Array.isArray(c) || c.length < 2) throw new Error("invalid coordinate");
      const [lon, lat] = c;
      if (typeof lon !== "number" || typeof lat !== "number") {
        throw new Error("coordinate must be [lon, lat] numbers");
      }
      return [lon, lat] as [number, number];
    });
  }
  if (gj.type === "MultiLineString") {
    if (!Array.isArray(gj.coordinates)) throw new Error("MultiLineString missing coordinates");
    const out: Array<[number, number]> = [];
    for (const line of gj.coordinates) {
      if (!Array.isArray(line)) throw new Error("invalid MultiLineString ring");
      for (const c of line) {
        if (!Array.isArray(c) || c.length < 2) throw new Error("invalid coordinate");
        const [lon, lat] = c;
        if (typeof lon !== "number" || typeof lat !== "number") {
          throw new Error("coordinate must be [lon, lat] numbers");
        }
        out.push([lon, lat]);
      }
    }
    return out;
  }
  throw new Error(`GeoJSON type '${String(gj.type)}' is not a trace (LineString or MultiLineString)`);
}
