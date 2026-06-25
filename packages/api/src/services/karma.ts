/**
 * Karma & trust tier helpers (§21.7).
 *
 * Karma is the lifetime cumulative score a user earns from upvotes on their
 * contributions. Trust tier is derived from karma and gates privileges
 * (creating systems, reverting, promoting trails, etc.).
 *
 * `users.trust_score` is a denormalized cache. We update it incrementally on
 * each vote insert/delete. This service is the single source of truth for
 * tier-from-karma and tier-weight math.
 */
import {
  TRUST_TIER_THRESHOLDS,
  TIER_WEIGHTS,
  TIER_LABELS,
  type TrustTier,
  type VoteTargetType,
  ENTITY_HIDE_NET_SCORE_THRESHOLD,
  TRACE_WEIGHT_FLOOR,
} from "@magnum/shared/constants";

export function tierFromKarma(karma: number): TrustTier {
  if (karma >= TRUST_TIER_THRESHOLDS.trusted) return "trusted";
  if (karma >= TRUST_TIER_THRESHOLDS.established) return "established";
  return "new";
}

export function tierLabel(tier: TrustTier): string {
  return TIER_LABELS[tier];
}

export function tierWeight(tier: TrustTier): number {
  return TIER_WEIGHTS[tier];
}

/**
 * Compute Wilson-style trace weight (§21.6).
 * `weight = (up + 1 - down) / (up + down + 2)`.
 */
export function traceWeight(up: number, down: number): number {
  const u = Math.max(0, up);
  const d = Math.max(0, down);
  return (u + 1 - d) / (u + d + 2);
}

export function isTraceIgnored(weight: number): boolean {
  return weight < TRACE_WEIGHT_FLOOR;
}

/**
 * Whether an entity's net score is low enough to auto-hide (§21.7).
 * Hiding means the entity is still in the DB but filtered out of default
 * listings; a moderator can restore it.
 */
export function isEntityHidden(netScore: number): boolean {
  return netScore <= ENTITY_HIDE_NET_SCORE_THRESHOLD;
}

/**
 * Karma delta when a vote with `value` (+1 or -1) is cast by a voter in tier
 * `tier`. Tier weight is applied to the voter's tier to resist sockpuppet
 * farming: a New-tier upvote is worth 1, a Trusted upvote is worth 3.
 */
export function karmaDelta(value: 1 | -1, voterTier: TrustTier): number {
  return value * tierWeight(voterTier);
}

/**
 * Map a target_type to the table that stores the entity. Used by the
 * `findTargetAuthor` helper to look up the author of an entity for karma
 * attribution. Add new target types here as they come online.
 */
const TARGET_TABLE: Record<VoteTargetType, string> = {
  feature: "features",
  trace: "gps_traces", // phase 4
  preset: "presets", // phase 2
  system: "systems",
  wiki_page: "wiki_pages",
  trail: "trails",
};

export function targetTable(targetType: VoteTargetType): string {
  return TARGET_TABLE[targetType];
}

/**
 * Compute the user_id of the author/creator of a target entity. Returns
 * null if the entity has no recorded author (e.g. a legacy feature created
 * before this column existed). Anonymous upvotes still tally, but the karma
 * recipient is null and no trust_score change is made.
 *
 * The actual DB lookup is the caller's job — this just documents the contract
 * so routes can use a single source of truth.
 */
export function authorColumn(targetType: VoteTargetType): string | null {
  switch (targetType) {
    case "feature":
    case "system":
    case "trail":
      return "created_by_user_id";
    case "wiki_page":
      return null; // wiki pages don't have an author — karma is split by revisions.
    case "preset":
      return "created_by";
    case "trace":
      return "user_id";
    default:
      return null;
  }
}

export function contributorNameColumn(targetType: VoteTargetType): string | null {
  switch (targetType) {
    case "feature":
    case "system":
    case "trace":
      return "contributor_name";
    case "trail":
    case "wiki_page":
    case "preset":
      return null;
    default:
      return null;
  }
}
