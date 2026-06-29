import type { Page, Route } from "@playwright/test";
import {
  MOCK_API_HOST,
  SYSTEMS,
  TRAILS,
  TRAILS_BY_SYSTEM,
  SEGMENTS_BY_TRAIL,
  FEATURES_BY_TRAIL,
  FEATURES,
  SEED_USERS,
} from "../fixtures/data.js";

// Deep-clone the initial fixture data so `resetApiMock()` can restore it
// after tests mutate the segment/feature state.
const INITIAL_SEGMENTS_BY_TRAIL: Record<string, unknown[]> = Object.fromEntries(
  Object.entries(SEGMENTS_BY_TRAIL).map(([k, v]) => [k, v.map((s) => ({ ...s }))]),
);
const INITIAL_FEATURES: Record<string, unknown> = Object.fromEntries(
  Object.entries(FEATURES).map(([k, v]) => [k, { ...v }]),
);
const INITIAL_FEATURES_BY_TRAIL: Record<string, unknown[]> = Object.fromEntries(
  Object.entries(FEATURES_BY_TRAIL).map(([k, v]) => [k, v.map((f) => ({ ...f }))]),
);

type Json = unknown;
type Handler = (params: {
  url: URL;
  method: string;
  body: Json;
  query: Record<string, string>;
  headers: Record<string, string>;
}) => { status?: number; body: Json } | undefined;

/** Parse the bearer token from an Authorization header. */
function bearerUser(headers: Record<string, string>): { id: string } | null {
  const auth = headers["authorization"] ?? headers["Authorization"];
  if (!auth?.startsWith("Bearer mock-access-")) return null;
  const id = auth.slice("Bearer mock-access-".length);
  return { id };
}

/**
 * Gate the moderator-tier routes (§21.6 phase 2 — synthesis, premium
 * import, trail promotion). The real impl checks `user.tier`, but the
 * mock maps "admin" and "moderator" roles to the moderator tier; high
 * trust_score (>= 500) also unlocks it for test users seeded via the
 * register form.
 */
function requireModerator(
  headers: Record<string, string>,
): { status: number; body: unknown } | null {
  const token = bearerUser(headers);
  if (!token) return { status: 401, body: { error: "unauthorized" } };
  const u = MOCK_USERS[token.id];
  if (!u) return { status: 401, body: { error: "unauthorized" } };
  if (u.role !== "admin" && u.role !== "moderator" && u.trust_score < 500) {
    return { status: 403, body: { error: "forbidden", message: "moderator tier required" } };
  }
  return null;
}

function ok(body: Json, status = 200) {
  return { status, body };
}

function notFound(message = "not found") {
  return { status: 404, body: { error: "not_found", message } };
}

function conflict(message = "conflict") {
  return { status: 409, body: { error: "conflict", message } };
}

const WIKI_PAGES: Record<
  string,
  { id: string; title: string; content_md: string; contributor_name: string; updated_at: string }
> = {};
const WIKI_REVISIONS: Record<
  string,
  {
    id: string;
    wiki_page_id: string;
    content_md: string;
    contributor_name: string;
    edit_summary: string;
    created_at: string;
  }[]
> = {};
const CITATIONS: Record<string, { id: string; title: string; url: string | null }[]> = {};
const MEDIA_ITEMS: {
  id: string;
  feature_id: string | null;
  trail_id: string | null;
  caption: string | null;
}[] = [];

let nextWikiId = 100;
let nextRevId = 200;
let nextCitationId = 300;
let nextMediaId = 400;
let nextFeatureId = 500;

const DOWNLOADED_PACKS: string[] = [];
const PENDING_CONTRIBUTIONS: { id: number; entity_type: string; action: string; payload: Json }[] =
  [];
let nextPendingId = 1;

const MOCK_USERS: Record<string, { id: string; username: string; email: string; role: string; trust_score: number }> = {};
let nextUserId = 900;

// Seeds an admin user with a fixed id so tests can authenticate as
// admin by driving the register form with `role=admin` or by relying
// on the auto-seeded admin in `resetApiMock()`.
const ADMIN_ID = "admin-1";

function ensureAdminSeeded() {
  if (!MOCK_USERS[ADMIN_ID]) {
    MOCK_USERS[ADMIN_ID] = {
      id: ADMIN_ID,
      username: "admin",
      email: "admin@example.com",
      role: "admin",
      trust_score: 999,
    };
  }
}

// Re-seeds the fixture-defined users (e.g. the author of seeded
// features) so vote-karma attribution and `/api/votes/users/:id/karma`
// always resolve to a real user.
function ensureFixtureUsersSeeded() {
  for (const u of SEED_USERS) {
    if (!MOCK_USERS[u.id]) {
      MOCK_USERS[u.id] = { ...u };
    }
  }
}

// --- §21.4 presets ----------------------------------------------------
const PRESETS: Array<{
  id: string;
  key: string;
  label: string;
  icon_name: string;
  icon_color: string;
  category: string;
  osm_tags: Record<string, string>;
  questions: Array<{
    key: string;
    type: "boolean" | "select";
    label: string;
    options?: Array<{ value: string; label: string }>;
  }>;
  upstreamable: boolean;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}> = [];
let nextPresetId = 1;

// --- §21.5 hierarchy --------------------------------------------------
const SUPER_SYSTEMS: Array<{
  id: string;
  name: string;
  slug: string;
  official: boolean;
  description: string | null;
  external_url: string | null;
  created_at: string;
  updated_at: string;
}> = [];
const SUB_SYSTEMS: Array<{
  id: string;
  name: string;
  slug: string;
  system_id: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}> = [];
const SYSTEM_SUPER_MEMBERSHIPS: Array<{ system_id: string; super_system_id: string }> = [];
let nextSuperId = 1;
let nextSubId = 1;

// --- §21.7 votes ------------------------------------------------------
const VOTES: Array<{
  id: string;
  target_type: string;
  target_id: string;
  user_id: string | null;
  value: 1 | -1;
  voter_karma: number;
  voter_tier: string;
  created_at: string;
  updated_at: string;
}> = [];
const ENTITY_SCORES: Record<string, { upvotes: number; downvotes: number; net: number; hidden: boolean }> = {};
let nextVoteId = 1;

function scoreKey(targetType: string, targetId: string): string {
  return `${targetType}:${targetId}`;
}

function tierWeight(tier: string): number {
  if (tier === "trusted" || tier === "moderator") return 3;
  if (tier === "established") return 2;
  return 1;
}

function tierFromKarma(karma: number): string {
  if (karma >= 500) return "trusted";
  if (karma >= 50) return "established";
  return "new";
}

function getOrCreateScore(targetType: string, targetId: string) {
  const key = scoreKey(targetType, targetId);
  if (!ENTITY_SCORES[key]) {
    ENTITY_SCORES[key] = { upvotes: 0, downvotes: 0, net: 0, hidden: false };
  }
  return ENTITY_SCORES[key];
}

function authorForTarget(targetType: string, targetId: string): string | null {
  // Look up the author of a votable target so we can award karma.
  if (targetType === "feature") {
    return ((FEATURES[targetId] as { created_by_user_id?: string } | undefined)
      ?.created_by_user_id) ?? null;
  }
  if (targetType === "system") {
    const sys = SYSTEMS.find((s) => s.id === targetId) as
      | { created_by_user_id?: string }
      | undefined;
    return sys?.created_by_user_id ?? null;
  }
  return null;
}

// --- Mock-only helpers for the trace handlers -----------------------

/** Extract lon/lat pairs from a GPX string. Minimal but matches the
 *  shape of an `expo-document-picker` / `<input type=file>` payload. */
function extractGpxCoords(gpx: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const re = /<trkpt[^>]*lat="([^"]+)"[^>]*lon="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(gpx)) !== null) {
    const lat = Number(m[1]);
    const lon = Number(m[2]);
    if (Number.isFinite(lat) && Number.isFinite(lon)) out.push([lon, lat]);
  }
  return out;
}

/** Greedy bounding-box check against fixture system centers. The
 *  real impl does point-in-polygon against `systems.boundary`; the
 *  mock uses the same center+epsilon check as `/api/systems/contains`. */
function pickSystemForTrace(coords: Array<[number, number]>): string | null {
  const EPS = 0.5;
  for (const [lon, lat] of coords) {
    const match = SYSTEMS.find((s) => {
      const c = s.center as { lon: number; lat: number } | undefined;
      return c ? Math.abs(c.lon - lon) < EPS && Math.abs(c.lat - lat) < EPS : false;
    });
    if (match) return match.id;
  }
  return null;
}

/** Approximate LineString length in meters. Haversine — close enough
 *  for the mock's happy-path length check. */
function traceLengthMeters(coords: Array<[number, number]>): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lon1, lat1] = coords[i - 1]!;
    const [lon2, lat2] = coords[i]!;
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    total += 2 * R * Math.asin(Math.sqrt(a));
  }
  return total;
}

// --- §21.6 — GPS traces ---------------------------------------------
const TRACES: Array<{
  id: string;
  user_id: string | null;
  contributor_name: string;
  geometry: { type: "LineString"; coordinates: Array<[number, number]> };
  source: "import" | "recorded";
  weight: number;
  upvotes: number;
  downvotes: number;
  status: "active" | "ignored" | "removed";
  recorded_at: string | null;
  created_at: string;
  derived_from_segments: number;
  last_synthesized_at: string | null;
}> = [];
let nextTraceId = 1;

const TRACE_SEGMENTS: Array<{
  id: string;
  trace_id: string;
  geometry: { type: "LineString"; coordinates: Array<[number, number]> };
  cluster_id: number | null;
  proposed_trail_id: string | null;
}> = [];
let nextTraceSegmentId = 1;

const TRACE_SYSTEMS: Array<{ trace_id: string; system_id: string }> = [];

const TRACE_VOTES: Array<{
  id: string;
  trace_id: string;
  user_id: string;
  value: 1 | -1;
  created_at: string;
}> = [];

const TRACE_SEGMENT_VOTES: Array<{
  id: string;
  segment_id: string;
  user_id: string;
  trail_id: string | null;
  vote: 1 | -1;
  created_at: string;
}> = [];

function traceWeight(up: number, down: number): number {
  return (up + 1 - down) / (up + down + 2);
}

function seedTraceFixtures() {
  TRACES.length = 0;
  TRACE_SEGMENTS.length = 0;
  TRACE_SYSTEMS.length = 0;
  TRACE_VOTES.length = 0;
  TRACE_SEGMENT_VOTES.length = 0;
  nextTraceId = 1;
  nextTraceSegmentId = 1;
  // Two seeded traces inside sys-1 (Hocking Hills). trace-1 is the
  // source of the synthesis proposals (prop-1, prop-2).
  const now = "2026-06-21T00:00:00.000Z";
  // Seed voters (fictional user ids) so the trace's initial upvote /
  // downvote counts are backed by real TRACE_VOTES rows. The vote
  // handler recomputes counts from TRACE_VOTES, so without these the
  // seed counts would be clobbered on the first vote.
  for (let i = 0; i < 3; i++) {
    MOCK_USERS[`seed-voter-${i}`] = {
      id: `seed-voter-${i}`,
      username: `seedvoter${i}`,
      email: `seedvoter${i}@example.com`,
      role: "contributor",
      trust_score: 10,
    };
  }
  TRACES.push(
    {
      id: "trace-1",
      user_id: "user-100",
      contributor_name: "hiker1",
      geometry: {
        type: "LineString",
        coordinates: [
          [-82.5412, 39.4342],
          [-82.5405, 39.4355],
          [-82.5398, 39.4368],
        ],
      },
      source: "recorded",
      weight: 1.0,
      upvotes: 3,
      downvotes: 0,
      status: "active",
      recorded_at: now,
      created_at: now,
      derived_from_segments: 0,
      last_synthesized_at: null,
    },
    {
      id: "trace-2",
      user_id: "user-100",
      contributor_name: "hiker1",
      geometry: {
        type: "LineString",
        coordinates: [
          [-82.5412, 39.4342],
          [-82.5420, 39.4350],
          [-82.5428, 39.4358],
        ],
      },
      source: "import",
      weight: 0.8,
      upvotes: 1,
      downvotes: 0,
      status: "active",
      recorded_at: now,
      created_at: now,
      derived_from_segments: 0,
      last_synthesized_at: null,
    },
  );
  for (let i = 0; i < 3; i++) {
    TRACE_VOTES.push({
      id: `seed-vote-${i}`,
      trace_id: "trace-1",
      user_id: `seed-voter-${i}`,
      value: 1,
      created_at: now,
    });
  }
  TRACE_VOTES.push({
    id: "seed-vote-3",
    trace_id: "trace-2",
    user_id: "seed-voter-0",
    value: 1,
    created_at: now,
  });
  nextTraceId = 3;
  TRACE_SEGMENTS.push(
    {
      id: "seg-prop-1",
      trace_id: "trace-1",
      geometry: TRACES[0]!.geometry,
      cluster_id: 1,
      proposed_trail_id: null,
    },
    {
      id: "seg-prop-2",
      trace_id: "trace-1",
      geometry: TRACES[0]!.geometry,
      cluster_id: 1,
      proposed_trail_id: null,
    },
  );
  nextTraceSegmentId = 3;
  TRACE_SYSTEMS.push(
    { trace_id: "trace-1", system_id: "sys-1" },
    { trace_id: "trace-2", system_id: "sys-1" },
  );
}

// --- §21.8 patrol ----------------------------------------------------
const PATROL_FLAGS: Array<{
  id: string;
  revision_id: string;
  reason: string;
  resolved: boolean;
  created_at: string;
  details: Record<string, unknown> | null;
}> = [];
let nextPatrolId = 1;

// --- §21.6 phase 2 — synthesis + premium import --------------------
const SYNTHESIS_PROPOSALS: Array<{
  id: string;
  trace_id: string;
  segment_id: string;
  cluster_id: number | null;
  reason: "no_nearby_trail";
}> = [];
let nextProposalId = 1;
const SYNTHETIC_TRAILS: Array<{
  id: string;
  name: string;
  slug: string;
  tier: "synthesized" | "frozen" | "premium";
  system_id: string | null;
  difficulty: string | null;
}> = [];
let nextSyntheticTrailId = 1;

function seedSynthesisFixtures() {
  SYNTHESIS_PROPOSALS.length = 0;
  SYNTHESIS_PROPOSALS.push(
    {
      id: "prop-1",
      trace_id: "trace-1",
      segment_id: "seg-prop-1",
      cluster_id: 1,
      reason: "no_nearby_trail",
    },
    {
      id: "prop-2",
      trace_id: "trace-1",
      segment_id: "seg-prop-2",
      cluster_id: 1,
      reason: "no_nearby_trail",
    },
  );
  nextProposalId = 3;
  SYNTHETIC_TRAILS.length = 0;
  SYNTHETIC_TRAILS.push({
    id: "trail-synth-1",
    name: "Old Man's Loop",
    slug: "old-mans-loop",
    tier: "synthesized",
    system_id: "sys-1",
    difficulty: "easy",
  });
  nextSyntheticTrailId = 2;
}

// --- Fixture seeders (called from resetApiMock) -------------------------
//
// The redux §21 schemas ship with default fixtures (23 presets, 2
// super-systems, 2 sub-systems, memberships) that mirror the SQL seed
// in `0004_presets.sql`. These are re-seeded on every `resetApiMock()` so
// tests get a clean slate but the lookup data is always present.
function seedPresetsFixtures() {
  const now = "2026-06-21T00:00:00.000Z";
  const presets: Array<{
    key: string;
    label: string;
    icon_name: string;
    icon_color: string;
    category: string;
    osm_tags: Record<string, string>;
    questions: Array<{
      key: string;
      type: "boolean" | "select";
      label: string;
      options?: Array<{ value: string; label: string }>;
    }>;
    upstreamable: boolean;
    sort_order: number;
  }> = [
    { key: "bench", label: "Bench", icon_name: "cafe", icon_color: "#8B4513", category: "rest_shelter", osm_tags: { amenity: "bench" }, questions: [{ key: "material", type: "select", label: "Material", options: [{ value: "wood", label: "Wood" }, { value: "stone", label: "Stone" }, { value: "metal", label: "Metal" }] }, { key: "backrest", type: "boolean", label: "Has backrest" }], upstreamable: true, sort_order: 10 },
    { key: "picnic_table", label: "Picnic Table", icon_name: "restaurant", icon_color: "#8B4513", category: "rest_shelter", osm_tags: { leisure: "picnic_table" }, questions: [{ key: "covered", type: "boolean", label: "Covered" }], upstreamable: true, sort_order: 20 },
    { key: "shelter", label: "Shelter", icon_name: "home", icon_color: "#059669", category: "rest_shelter", osm_tags: { amenity: "shelter" }, questions: [{ key: "type", type: "select", label: "Type", options: [{ value: "lean_to", label: "Lean-to" }, { value: "cabin", label: "Cabin" }] }], upstreamable: true, sort_order: 30 },
    { key: "campsite", label: "Campsite", icon_name: "bonfire", icon_color: "#059669", category: "rest_shelter", osm_tags: { tourism: "camp_site" }, questions: [], upstreamable: true, sort_order: 40 },
    { key: "drinking_water", label: "Drinking Water", icon_name: "water", icon_color: "#3b82f6", category: "water_sanitation", osm_tags: { amenity: "drinking_water" }, questions: [{ key: "potable", type: "select", label: "Potable", options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }] }], upstreamable: true, sort_order: 50 },
    { key: "spring", label: "Spring", icon_name: "water", icon_color: "#3b82f6", category: "water_sanitation", osm_tags: { natural: "spring" }, questions: [], upstreamable: false, sort_order: 60 },
    { key: "restroom", label: "Restroom", icon_name: "man", icon_color: "#6366f1", category: "water_sanitation", osm_tags: { amenity: "toilets" }, questions: [], upstreamable: true, sort_order: 70 },
    { key: "waste_basket", label: "Waste Basket", icon_name: "trash", icon_color: "#6366f1", category: "water_sanitation", osm_tags: { amenity: "waste_basket" }, questions: [], upstreamable: false, sort_order: 80 },
    { key: "trailhead", label: "Trailhead", icon_name: "flag", icon_color: "#22c55e", category: "navigation", osm_tags: { highway: "trailhead" }, questions: [], upstreamable: true, sort_order: 90 },
    { key: "map_board", label: "Map Board", icon_name: "map", icon_color: "#22c55e", category: "navigation", osm_tags: { information: "map" }, questions: [], upstreamable: true, sort_order: 100 },
    { key: "guidepost", label: "Guidepost", icon_name: "navigate", icon_color: "#22c55e", category: "navigation", osm_tags: { information: "guidepost" }, questions: [], upstreamable: true, sort_order: 110 },
    { key: "sign", label: "Sign", icon_name: "information-circle", icon_color: "#dc2626", category: "navigation", osm_tags: { information: "sign" }, questions: [], upstreamable: false, sort_order: 120 },
    { key: "intersection", label: "Intersection", icon_name: "git-merge", icon_color: "#f97316", category: "navigation", osm_tags: { highway: "crossing" }, questions: [], upstreamable: false, sort_order: 130 },
    { key: "fallen_tree", label: "Fallen Tree", icon_name: "warning", icon_color: "#dc2626", category: "hazards_obstacles", osm_tags: { hazard: "fallen_tree" }, questions: [{ key: "passable", type: "select", label: "Passable", options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }] }], upstreamable: true, sort_order: 140 },
    { key: "washout", label: "Washout", icon_name: "warning", icon_color: "#dc2626", category: "hazards_obstacles", osm_tags: { hazard: "washout" }, questions: [], upstreamable: true, sort_order: 150 },
    { key: "steep_section", label: "Steep Section", icon_name: "trending-up", icon_color: "#f59e0b", category: "hazards_obstacles", osm_tags: { hazard: "steep" }, questions: [], upstreamable: true, sort_order: 160 },
    { key: "road_connector", label: "Road Connector", icon_name: "car-sport", icon_color: "#888888", category: "hazards_obstacles", osm_tags: { highway: "residential" }, questions: [], upstreamable: false, sort_order: 170 },
    { key: "viewpoint", label: "Viewpoint", icon_name: "eye", icon_color: "#f59e0b", category: "landmarks", osm_tags: { tourism: "viewpoint" }, questions: [{ key: "panoramic", type: "boolean", label: "Panoramic" }, { key: "covered", type: "boolean", label: "Covered" }], upstreamable: true, sort_order: 180 },
    { key: "notable_tree", label: "Notable Tree", icon_name: "leaf", icon_color: "#16a34a", category: "landmarks", osm_tags: { natural: "tree" }, questions: [], upstreamable: true, sort_order: 190 },
    { key: "waterfall", label: "Waterfall", icon_name: "rainy", icon_color: "#3b82f6", category: "landmarks", osm_tags: { waterway: "waterfall" }, questions: [], upstreamable: true, sort_order: 200 },
    { key: "cave_entrance", label: "Cave Entrance", icon_name: "moon", icon_color: "#475569", category: "landmarks", osm_tags: { natural: "cave_entrance" }, questions: [], upstreamable: true, sort_order: 210 },
    { key: "bridge", label: "Bridge", icon_name: "git-network", icon_color: "#7c3aed", category: "landmarks", osm_tags: { bridge: "yes" }, questions: [], upstreamable: true, sort_order: 220 },
    { key: "tunnel", label: "Tunnel", icon_name: "subway", icon_color: "#475569", category: "landmarks", osm_tags: { tunnel: "yes" }, questions: [], upstreamable: true, sort_order: 230 },
  ];
  for (let i = 0; i < presets.length; i++) {
    const p = presets[i]!;
    PRESETS.push({
      id: `preset-${i + 1}`,
      key: p.key,
      label: p.label,
      icon_name: p.icon_name,
      icon_color: p.icon_color,
      category: p.category,
      osm_tags: p.osm_tags,
      questions: p.questions,
      upstreamable: p.upstreamable,
      sort_order: p.sort_order,
      created_by: null,
      created_at: now,
      updated_at: now,
    });
  }
}

function seedHierarchyFixtures() {
  const now = "2026-06-21T00:00:00.000Z";
  SUPER_SYSTEMS.push(
    {
      id: "super-1",
      name: "Ohio Erie Trail",
      slug: "ohio-erie-trail",
      official: true,
      description: "A long-distance trail concept linking Ohio's Lake Erie shore.",
      external_url: null,
      created_at: now,
      updated_at: now,
    },
    {
      id: "super-2",
      name: "US Bike Route 50",
      slug: "us-bike-route-50",
      official: false, // Unofficial self-organized
      description: "Unofficial US Bike Route 50 alignment through Ohio.",
      external_url: null,
      created_at: now,
      updated_at: now,
    },
  );
  SUB_SYSTEMS.push(
    {
      id: "sub-1",
      name: "Old Man's Cave Area",
      slug: "old-mans-cave-area",
      system_id: "sys-1",
      description: "Sub-region around Old Man's Cave.",
      created_at: now,
      updated_at: now,
    },
    {
      id: "sub-2",
      name: "Ash Cave Area",
      slug: "ash-cave-area",
      system_id: "sys-1",
      description: "Sub-region around Ash Cave.",
      created_at: now,
      updated_at: now,
    },
  );
  SYSTEM_SUPER_MEMBERSHIPS.push(
    { system_id: "sys-1", super_system_id: "super-1" },
    { system_id: "sys-2", super_system_id: "super-1" },
  );
}

// --- §21.8 generalized revisions -------------------------------------
const REVISIONS: Array<{
  id: string;
  target_type: string;
  target_id: string;
  wiki_page_id: string | null;
  content_md: string | null;
  payload_before: Record<string, unknown> | null;
  payload_after: Record<string, unknown> | null;
  action: string;
  contributor_name: string;
  author_id: string | null;
  edit_summary: string | null;
  reverted_from_id: string | null;
  created_at: string;
}> = [];
let nextRevisionId = 1;

// Wiki page key: `${targetType}:${targetId}`
function wikiKey(targetType: string, targetId: string) {
  return `${targetType}:${targetId}`;
}

const handlers: Array<{ pattern: RegExp; handler: Handler }> = [
  {
    pattern: /\/api\/health$/,
    handler: () =>
      ok({ status: "ok", version: "0.0.1", time: new Date().toISOString(), database: "ok" }),
  },
  // --- Auth ---
  {
    pattern: /\/api\/auth\/register$/,
    handler: ({ method, body }) => {
      if (method !== "POST") return undefined;
      const b = body as {
        username?: string;
        email?: string;
        password?: string;
        // The route accepts an optional role + trust_score so tests can
        // seed an admin or a high-trust contributor. Production never
        // honors these — they exist only for the e2e mock.
        role?: string;
        trust_score?: number;
      };
      if (!b?.username || !b?.email || !b?.password)
        return { status: 400, body: { error: "invalid_input", message: "all fields required" } };
      if (Object.values(MOCK_USERS).some((u) => u.email === b.email))
        return conflict("email already registered");
      const id = String(nextUserId++);
      const user = {
        id,
        username: b.username,
        email: b.email,
        role: b.role ?? "contributor",
        trust_score: b.trust_score ?? 0,
      };
      MOCK_USERS[id] = user;
      return ok(
        {
          access_token: `mock-access-${id}`,
          refresh_token: `mock-refresh-${id}`,
          expires_in: 900,
          user,
        },
        201,
      );
    },
  },
  {
    pattern: /\/api\/auth\/login$/,
    handler: ({ method, body }) => {
      if (method !== "POST") return undefined;
      const b = body as { email?: string; password?: string };
      if (!b?.email || !b?.password)
        return { status: 400, body: { error: "invalid_input", message: "email and password required" } };
      const user = Object.values(MOCK_USERS).find((u) => u.email === b.email);
      if (!user) return { status: 401, body: { error: "unauthorized", message: "invalid email or password" } };
      return ok({
        access_token: `mock-access-${user.id}`,
        refresh_token: `mock-refresh-${user.id}`,
        expires_in: 900,
        user,
      });
    },
  },
  {
    pattern: /\/api\/auth\/me$/,
    handler: ({ method, headers }) => {
      if (method !== "GET") return undefined;
      // Token-based lookup so multiple seeded users can coexist without
      // the "first user wins" bug. Falls back to 401 when no token is
      // present (or the token doesn't resolve to a known user).
      const token = bearerUser(headers);
      if (token) {
        const user = MOCK_USERS[token.id];
        if (user) return ok(user);
      }
      return { status: 401, body: { error: "unauthorized", message: "authentication required" } };
    },
  },
  {
    pattern: /\/api\/auth\/refresh$/,
    handler: () => ok({ access_token: "mock-access-refreshed", expires_in: 900 }),
  },
  {
    pattern: /\/api\/systems\/by-slug\/([^/]+)$/,
    handler: ({ url }) => {
      const slug = url.pathname.split("/").pop();
      const system = SYSTEMS.find((s) => s.slug === slug);
      return system ? ok(system) : notFound(`system '${slug}' not found`);
    },
  },
  {
    // Match /api/systems/<id> but skip reserved path segments like
    // "tree", "contains", "by-slug" that have their own handlers.
    pattern: /\/api\/systems\/([^/?]+)$/,
    handler: ({ url }) => {
      const id = url.pathname.split("/").pop();
      // Reserved words are handled by other routes; skip here.
      if (!id || id === "tree" || id === "contains" || id === "by-slug") return undefined;
      const system = SYSTEMS.find((s) => s.id === id);
      return system ? ok(system) : notFound(`system ${id} not found`);
    },
  },
  {
    pattern: /\/api\/systems\/([^/]+)\/trails$/,
    handler: ({ url }) => {
      const id = url.pathname.split("/").at(-2);
      const trails = id ? (TRAILS_BY_SYSTEM[id] ?? []) : [];
      return ok({ items: trails, total: trails.length });
    },
  },
  {
    pattern: /\/api\/systems\/([^/]+)\/features$/,
    handler: () => ok({ items: [], total: 0 }),
  },
  {
    pattern: /\/api\/trails\/by-slug\/([^/]+)$/,
    handler: ({ url }) => {
      const slug = url.pathname.split("/").pop();
      const trail = TRAILS.find((t) => t.slug === slug);
      if (trail) {
        // Enrich with tier info from SYNTHETIC_TRAILS if the id matches.
        // Default to "synthesized" so the badge renders (the real DB
        // tags every trail with a tier; the test fixtures don't).
        const synth = SYNTHETIC_TRAILS.find((t) => t.id === trail.id);
        return ok({
          ...trail,
          tier: (trail as { tier?: string }).tier ?? synth?.tier ?? "synthesized",
        });
      }
      // Synthesized trails (created via the approval flow) live in
      // SYNTHETIC_TRAILS rather than the TRAILS fixture. Look them up
      // by slug so /trail/<slug> can render the detail page.
      const synth = SYNTHETIC_TRAILS.find((t) => t.slug === slug);
      if (synth) {
        return ok({
          id: synth.id,
          name: synth.name,
          slug: synth.slug,
          tier: synth.tier,
          system_id: synth.system_id,
          difficulty: synth.difficulty,
          derived_from_segments: 1,
          last_synthesized_at: "2026-06-21T00:00:00.000Z",
        });
      }
      return notFound(`trail '${slug}' not found`);
    },
  },
  {
    pattern: /\/api\/trails\/([^/]+)$/,
    handler: ({ url }) => {
      const id = url.pathname.split("/").pop();
      const trail = TRAILS.find((t) => t.id === id);
      if (trail) {
        const synth = SYNTHETIC_TRAILS.find((t) => t.id === trail.id);
        return ok({
          ...trail,
          tier: (trail as { tier?: string }).tier ?? synth?.tier ?? "synthesized",
        });
      }
      // Synthesized trails (created via the approval flow) live in
      // SYNTHETIC_TRAILS rather than the TRAILS fixture.
      const synth = SYNTHETIC_TRAILS.find((t) => t.id === id);
      if (synth) {
        return ok({
          id: synth.id,
          name: synth.name,
          slug: synth.slug,
          tier: synth.tier,
          system_id: synth.system_id,
          difficulty: synth.difficulty,
          derived_from_segments: 1,
          last_synthesized_at: "2026-06-21T00:00:00.000Z",
        });
      }
      return notFound(`trail ${id} not found`);
    },
  },
  {
    pattern: /\/api\/trails\/([^/]+)\/segments$/,
    handler: ({ url }) => {
      const id = url.pathname.split("/").at(-2);
      const items = id ? (SEGMENTS_BY_TRAIL[id] ?? []) : [];
      return ok({ items, total: items.length });
    },
  },
  {
    pattern: /\/api\/trails\/([^/]+)\/features$/,
    handler: ({ url }) => {
      const id = url.pathname.split("/").at(-2);
      const items = id ? (FEATURES_BY_TRAIL[id] ?? []) : [];
      return ok({ items, total: items.length });
    },
  },
  {
    pattern: /\/api\/trails$/,
    handler: ({ query }) => {
      const q = query.q?.toLowerCase() ?? "";
      const items = q ? TRAILS.filter((t) => t.name.toLowerCase().includes(q)) : [...TRAILS];
      return ok({ items, total: items.length, page: 1, pageSize: 20 });
    },
  },
  {
    pattern: /\/api\/features\/([^/]+)$/,
    handler: ({ url }) => {
      const id = url.pathname.split("/").pop();
      const feature = id ? (FEATURES[id] as Record<string, unknown> | undefined) : undefined;
      if (!feature) return notFound(`feature ${id} not found`);
      // Enrich with preset_questions from the linked preset so the
      // feature detail screen can render answer badges (§21.4.4).
      const presetId = feature.preset_id as string | undefined;
      const preset = presetId ? PRESETS.find((p) => p.id === presetId) : undefined;
      return ok({
        ...feature,
        preset_questions: preset?.questions ?? null,
        preset_label: preset?.label ?? feature.preset_label ?? null,
        preset_key: preset?.key ?? feature.preset_key ?? null,
        preset_icon_name: preset?.icon_name ?? feature.preset_icon_name ?? null,
        preset_icon_color: preset?.icon_color ?? feature.preset_icon_color ?? null,
      });
    },
  },
  // --- Wiki pages: GET by target_type + target_id ---
  {
    pattern: /\/api\/wiki-pages$/,
    handler: ({ query, method, body }) => {
      if (method === "POST") {
        const b = body as {
          target_type?: string;
          target_id?: string;
          title?: string;
          content_md?: string;
          contributor_name?: string;
          edit_summary?: string;
        };
        if (!b?.target_type || !b?.target_id)
          return { status: 400, body: { error: "missing target_type/target_id" } };
        const key = wikiKey(b.target_type, b.target_id);
        if (WIKI_PAGES[key]) return conflict("wiki page already exists for this target");
        const id = String(nextWikiId++);
        const now = new Date().toISOString();
        WIKI_PAGES[key] = {
          id,
          title: b.title ?? "",
          content_md: b.content_md ?? "",
          contributor_name: b.contributor_name ?? "anonymous",
          updated_at: now,
        };
        WIKI_REVISIONS[id] = [
          {
            id: String(nextRevId++),
            wiki_page_id: id,
            content_md: b.content_md ?? "",
            contributor_name: b.contributor_name ?? "anonymous",
            edit_summary: b.edit_summary ?? "",
            created_at: now,
          },
        ];
        CITATIONS[id] = [];
        return ok(
          {
            id,
            title: b.title ?? "",
            content_md: b.content_md ?? "",
            contributor_name: b.contributor_name ?? "anonymous",
            updated_at: now,
            citation_count: 0,
            revision_count: 1,
          },
          201,
        );
      }
      const targetType = query.target_type;
      const targetId = query.target_id;
      if (!targetType || !targetId)
        return { status: 400, body: { error: "missing target_type/target_id" } };
      const key = wikiKey(targetType, targetId);
      const page = WIKI_PAGES[key];
      if (!page) return notFound("wiki page not found");
      return ok({
        ...page,
        citation_count: (CITATIONS[page.id] ?? []).length,
        revision_count: (WIKI_REVISIONS[page.id] ?? []).length,
      });
    },
  },
  // --- Wiki pages: PUT by id ---
  {
    pattern: /\/api\/wiki-pages\/(\d+)$/,
    handler: ({ url, method, body }) => {
      const id = url.pathname.split("/").pop()!;
      if (method === "PUT") {
        const b = body as {
          content_md?: string;
          contributor_name?: string;
          edit_summary?: string;
          base_revision_id?: string;
        };
        const page = Object.values(WIKI_PAGES).find((p) => p.id === id);
        if (!page) return notFound("wiki page not found");
        if (b.base_revision_id) {
          const revs = WIKI_REVISIONS[id] ?? [];
          const head = revs.length > 0 ? revs[revs.length - 1].id : "none";
          if (b.base_revision_id !== head)
            return conflict("wiki page has been updated since you last loaded it");
        }
        page.content_md = b.content_md ?? page.content_md;
        page.contributor_name = b.contributor_name ?? page.contributor_name;
        page.updated_at = new Date().toISOString();
        const revId = String(nextRevId++);
        if (!WIKI_REVISIONS[id]) WIKI_REVISIONS[id] = [];
        WIKI_REVISIONS[id].push({
          id: revId,
          wiki_page_id: id,
          content_md: page.content_md,
          contributor_name: page.contributor_name,
          edit_summary: b.edit_summary ?? "",
          created_at: page.updated_at,
        });
        return ok({
          ...page,
          citation_count: (CITATIONS[id] ?? []).length,
          revision_count: WIKI_REVISIONS[id].length,
        });
      }
      return notFound("method not allowed");
    },
  },
  // --- Wiki revisions ---
  {
    pattern: /\/api\/wiki-pages\/(\d+)\/revisions\/(\w+)$/,
    handler: ({ url }) => {
      const parts = url.pathname.split("/");
      const pageId = parts[3];
      const revId = parts[5];
      const revs = WIKI_REVISIONS[pageId] ?? [];
      const rev = revs.find((r) => r.id === revId);
      return rev ? ok(rev) : notFound("revision not found");
    },
  },
  {
    pattern: /\/api\/wiki-pages\/(\d+)\/revisions$/,
    handler: ({ url }) => {
      const pageId = url.pathname.split("/")[3];
      const revs = WIKI_REVISIONS[pageId] ?? [];
      return ok({ items: [...revs].reverse(), total: revs.length });
    },
  },
  {
    pattern: /\/api\/wiki-pages\/(\d+)\/revert$/,
    handler: ({ url, body }) => {
      const pageId = url.pathname.split("/")[3];
      const b = body as { revision_id?: string; contributor_name?: string; edit_summary?: string };
      if (!b?.revision_id) return { status: 400, body: { error: "missing revision_id" } };
      const revs = WIKI_REVISIONS[pageId] ?? [];
      const target = revs.find((r) => r.id === b.revision_id);
      if (!target) return notFound("revision not found");
      const page = Object.values(WIKI_PAGES).find((p) => p.id === pageId);
      if (!page) return notFound("wiki page not found");
      page.content_md = target.content_md;
      page.updated_at = new Date().toISOString();
      const revId = String(nextRevId++);
      WIKI_REVISIONS[pageId].push({
        id: revId,
        wiki_page_id: pageId,
        content_md: page.content_md,
        contributor_name: b.contributor_name ?? "anonymous",
        edit_summary: b.edit_summary ?? `Revert to revision ${b.revision_id}`,
        created_at: page.updated_at,
      });
      return ok({
        ...page,
        citation_count: (CITATIONS[pageId] ?? []).length,
        revision_count: WIKI_REVISIONS[pageId].length,
      });
    },
  },
  // --- Wiki citations ---
  {
    pattern: /\/api\/wiki-pages\/(\d+)\/citations$/,
    handler: ({ url }) => {
      const pageId = url.pathname.split("/")[3];
      return ok({ items: CITATIONS[pageId] ?? [], total: (CITATIONS[pageId] ?? []).length });
    },
  },
  {
    pattern: /\/api\/citations\/(\w+)$/,
    handler: ({ url, method }) => {
      const id = url.pathname.split("/").pop()!;
      if (method === "DELETE") {
        for (const [pageId, cites] of Object.entries(CITATIONS)) {
          const idx = cites.findIndex((c) => c.id === id);
          if (idx >= 0) {
            cites.splice(idx, 1);
            return ok({ deleted: true });
          }
        }
        return notFound("citation not found");
      }
      return notFound();
    },
  },
  {
    pattern: /\/api\/citations$/,
    handler: ({ body, method }) => {
      if (method === "POST") {
        const b = body as { wiki_page_id?: string; title?: string; url?: string };
        if (!b?.wiki_page_id || !b?.title)
          return { status: 400, body: { error: "missing wiki_page_id/title" } };
        const id = String(nextCitationId++);
        const cite = { id, title: b.title, url: b.url ?? null };
        if (!CITATIONS[b.wiki_page_id]) CITATIONS[b.wiki_page_id] = [];
        CITATIONS[b.wiki_page_id].push(cite);
        return ok(cite, 201);
      }
      return notFound();
    },
  },
  // --- Wikis on other targets (e.g., /api/wiki-pages?target_type=trail&target_id=trail-1) ---
  // Already handled by the first wiki handler above
  // --- Media ---
  {
    pattern: /\/api\/media\/(\w+)$/,
    handler: ({ url, method }) => {
      const id = url.pathname.split("/").pop()!;
      if (method === "DELETE") {
        const idx = MEDIA_ITEMS.findIndex((m) => m.id === id);
        if (idx >= 0) {
          MEDIA_ITEMS.splice(idx, 1);
          return ok({ deleted: true });
        }
        return notFound("media not found");
      }
      if (method === "GET") {
        const item = MEDIA_ITEMS.find((m) => m.id === id);
        return item
          ? ok({ ...item, data_url: "data:image/png;base64,iVBORw0KGgo=" })
          : notFound("media not found");
      }
      return notFound();
    },
  },
  {
    pattern: /\/api\/media$/,
    handler: ({ query, method, body }) => {
      if (method === "POST") {
        const b = body as {
          feature_id?: string;
          trail_id?: string;
          caption?: string;
          data?: string;
        };
        if (!b?.feature_id && !b?.trail_id)
          return { status: 400, body: { error: "missing feature_id or trail_id" } };
        const id = String(nextMediaId++);
        MEDIA_ITEMS.push({
          id,
          feature_id: b.feature_id ?? null,
          trail_id: b.trail_id ?? null,
          caption: b.caption ?? null,
        });
        return ok({ id, feature_id: b.feature_id, trail_id: b.trail_id, caption: b.caption }, 201);
      }
      if (method === "GET") {
        const featureId = query.feature_id;
        const trailId = query.trail_id;
        const items = MEDIA_ITEMS.filter(
          (m) => (featureId && m.feature_id === featureId) || (trailId && m.trail_id === trailId),
        );
        return ok({ items, total: items.length });
      }
      return notFound();
    },
  },
  // --- Feature CRUD ---
  {
    pattern: /\/api\/features$/,
    handler: ({ body, method }) => {
      if (method === "POST") {
        const b = body as {
          name?: string;
          type_tag?: string;
          preset_id?: string;
          lat?: number;
          lon?: number;
          point?: { type: string; coordinates: [number, number] };
          description?: string;
          trail_id?: string;
          system_id?: string;
          contributor_name?: string;
          answers?: Record<string, unknown>;
        };
        if (!b?.name) return { status: 400, body: { error: "missing name" } };
        // Either preset_id or type_tag is required.
        if (!b.preset_id && !b.type_tag) {
          return { status: 400, body: { error: "missing type_tag" } };
        }
        // Resolve type_tag from preset_id if needed.
        let typeTag = b.type_tag;
        if (!typeTag && b.preset_id) {
          const preset = PRESETS.find((p) => p.id === b.preset_id);
          typeTag = preset?.key ?? "feature";
        }
        const id = `f-${nextFeatureId++}`;
        // Extract lat/lon from point if present.
        const point = b.point?.coordinates ?? null;
        const lon = point ? point[0] : (b.lon ?? -83.0);
        const lat = point ? point[1] : (b.lat ?? 39.0);
        const feature = {
          id,
          name: b.name,
          type_tag: typeTag,
          preset_id: b.preset_id ?? null,
          description: b.description ?? null,
          trail_id: b.trail_id ?? null,
          system_id: b.system_id ?? null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          center: { lat, lon },
        };
        (FEATURES as Record<string, unknown>)[id] = feature;
        const trailId = b.trail_id ?? "trail-1";
        if (!FEATURES_BY_TRAIL[trailId]) FEATURES_BY_TRAIL[trailId] = [];
        FEATURES_BY_TRAIL[trailId].push(feature);
        return ok(feature, 201);
      }
      return notFound();
    },
  },
  // --- Offline packs ---
  {
    pattern: /\/api\/offline-packs\/([^/]+)\/info$/,
    handler: ({ url }) => {
      const systemId = url.pathname.split("/")[3];
      return ok({ system_id: systemId, estimated_size_mb: 42, generated_at: null });
    },
  },
  {
    pattern: /\/api\/offline-packs\/generate\/([^/]+)$/,
    handler: ({ url }) => {
      const systemId = url.pathname.split("/")[4];
      DOWNLOADED_PACKS.push(systemId);
      return ok({
        system_id: systemId,
        size_bytes: 42000000,
        generated_at: new Date().toISOString(),
      });
    },
  },
  {
    pattern: /\/api\/offline-packs\/([^/]+)\/download$/,
    handler: ({ url }) => {
      const systemId = url.pathname.split("/")[3];
      return ok({
        system_id: systemId,
        trails: TRAILS_BY_SYSTEM[systemId] ?? [],
        features: [],
        wiki_pages: {},
      });
    },
  },
  // --- Sync ---
  {
    pattern: /\/api\/sync\/contributions$/,
    handler: ({ body }) => {
      const b = body as {
        contributions?: { entity_type: string; action: string; payload: Json }[];
      };
      const results: Json[] = [];
      for (const c of b?.contributions ?? []) {
        if (c.payload && (c.payload as { _conflict?: boolean })._conflict) {
          results.push({
            status: "conflict",
            server_revision: {
              id: "rev-conflict",
              content_md: "Server version content",
              contributor_name: "other-user",
              created_at: new Date().toISOString(),
            },
          });
        } else {
          PENDING_CONTRIBUTIONS.push({
            id: nextPendingId++,
            entity_type: c.entity_type,
            action: c.action,
            payload: c.payload,
          });
          results.push({ status: "synced", server_id: `server-${nextPendingId}` });
        }
      }
      return ok({ results });
    },
  },
  {
    pattern: /\/api\/sync\/updates$/,
    handler: () => ok({ revisions: [], cursor: new Date().toISOString() }),
  },
  // --- Revisions recent (admin) ---
  {
    pattern: /\/api\/revisions\/recent$/,
    handler: () => ok({ items: [], total: 0 }),
  },
  // --- Segments ---
  {
    pattern: /\/api\/segments\/([^/]+)$/,
    handler: ({ url, method, body }) => {
      const id = url.pathname.split("/").pop()!;
      if (method === "DELETE") {
        for (const [trailId, segs] of Object.entries(SEGMENTS_BY_TRAIL)) {
          const arr = segs as Array<{ id: string }>;
          const idx = arr.findIndex((s) => s.id === id);
          if (idx >= 0) {
            arr.splice(idx, 1);
            SEGMENTS_BY_TRAIL[trailId] = arr;
            return ok({ ok: true });
          }
        }
        return notFound("segment not found");
      }
      if (method === "PUT") {
        const b = body as {
          name?: string | null;
          surface_type?: string | null;
          hazards?: string[];
          is_road_connector?: boolean;
          steep_grade?: boolean;
          one_way?: boolean;
          description?: string | null;
        };
        for (const [trailId, segs] of Object.entries(SEGMENTS_BY_TRAIL)) {
          const arr = segs as Array<Record<string, unknown>>;
          const seg = arr.find((s) => s.id === id);
          if (seg) {
            if (b.name !== undefined) seg.name = b.name;
            if (b.surface_type !== undefined) seg.surface_type = b.surface_type;
            if (b.hazards !== undefined) seg.hazards = b.hazards;
            if (b.is_road_connector !== undefined) seg.is_road_connector = b.is_road_connector;
            if (b.steep_grade !== undefined) seg.steep_grade = b.steep_grade;
            if (b.one_way !== undefined) seg.one_way = b.one_way;
            if (b.description !== undefined) seg.description = b.description;
            seg.updated_at = new Date().toISOString();
            SEGMENTS_BY_TRAIL[trailId] = arr;
            return ok(seg);
          }
        }
        return notFound("segment not found");
      }
      for (const segs of Object.values(SEGMENTS_BY_TRAIL)) {
        const seg = (segs as { id: string }[]).find((s) => s.id === id);
        if (seg) return ok(seg);
      }
      return notFound(`segment ${id} not found`);
    },
  },
  // --- Trail segment operations ---
  {
    pattern: /\/api\/trails\/([^/]+)\/segments\/reorder$/,
    handler: ({ url, body }) => {
      const trailId = url.pathname.split("/")[3];
      const b = body as { ordered_ids?: string[] };
      if (!b?.ordered_ids) return { status: 400, body: { error: "missing ordered_ids" } };
      const segs = (SEGMENTS_BY_TRAIL[trailId] ?? []) as Array<Record<string, unknown>>;
      const byId = new Map(segs.map((s) => [s.id as string, s]));
      const reordered: Array<Record<string, unknown>> = [];
      for (let i = 0; i < b.ordered_ids.length; i++) {
        const seg = byId.get(b.ordered_ids[i]!);
        if (!seg) return { status: 400, body: { error: "unknown id" } };
        seg.sort_order = i;
        reordered.push(seg);
      }
      SEGMENTS_BY_TRAIL[trailId] = reordered;
      return ok({ items: reordered, total: reordered.length });
    },
  },
  {
    pattern: /\/api\/trails\/([^/]+)\/segments\/split$/,
    handler: ({ url, body }) => {
      const trailId = url.pathname.split("/")[3];
      const b = body as {
        segment_id?: string;
        split_at?: number;
        name_a?: string;
        name_b?: string;
      };
      if (!b?.segment_id) return { status: 400, body: { error: "missing segment_id" } };
      const segs = (SEGMENTS_BY_TRAIL[trailId] ?? []) as Array<Record<string, unknown>>;
      const target = segs.find((s) => s.id === b.segment_id);
      if (!target) return notFound("segment not found");
      const at = b.split_at ?? 0.5;
      const idA = String(target.id);
      const idB = `seg-split-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const newSeg = {
        ...target,
        id: idB,
        name: b.name_b ?? null,
        sort_order: (Number(target.sort_order ?? 0) || 0) + 1,
        length_meters: Number(target.length_meters ?? 0) * (1 - at),
        updated_at: new Date().toISOString(),
      };
      target.name = b.name_a ?? null;
      target.length_meters = Number(target.length_meters ?? 0) * at;
      target.sort_order = Number(target.sort_order ?? 0) || 0;
      target.updated_at = new Date().toISOString();
      const insertAt = segs.findIndex((s) => s.id === idA) + 1;
      segs.splice(insertAt, 0, newSeg);
      for (let i = 0; i < segs.length; i++) segs[i]!.sort_order = i;
      SEGMENTS_BY_TRAIL[trailId] = segs;
      return ok({ items: segs, total: segs.length });
    },
  },
  {
    pattern: /\/api\/trails\/([^/]+)\/segments\/merge$/,
    handler: ({ url, body }) => {
      const trailId = url.pathname.split("/")[3];
      const b = body as { segment_id_a?: string; segment_id_b?: string; name?: string };
      if (!b?.segment_id_a || !b?.segment_id_b)
        return { status: 400, body: { error: "missing segment ids" } };
      const segs = (SEGMENTS_BY_TRAIL[trailId] ?? []) as Array<Record<string, unknown>>;
      const a = segs.find((s) => s.id === b.segment_id_a);
      const bSeg = segs.find((s) => s.id === b.segment_id_b);
      if (!a || !bSeg) return notFound("segment not found");
      if (a.is_road_connector || bSeg.is_road_connector) {
        return { status: 400, body: { error: "cannot merge road connectors" } };
      }
      const [lo, hi] =
        (a.sort_order as number) < (bSeg.sort_order as number) ? [a, bSeg] : [bSeg, a];
      lo.name = b.name ?? lo.name;
      lo.steep_grade = Boolean(lo.steep_grade) || Boolean(hi.steep_grade);
      lo.one_way = Boolean(lo.one_way) && Boolean(hi.one_way);
      const hazardsA = (lo.hazards as string[] | undefined) ?? [];
      const hazardsB = (hi.hazards as string[] | undefined) ?? [];
      lo.hazards = Array.from(new Set([...hazardsA, ...hazardsB]));
      lo.length_meters = Number(lo.length_meters ?? 0) + Number(hi.length_meters ?? 0);
      lo.updated_at = new Date().toISOString();
      const idx = segs.findIndex((s) => s.id === hi.id);
      if (idx >= 0) segs.splice(idx, 1);
      for (let i = 0; i < segs.length; i++) segs[i]!.sort_order = i;
      SEGMENTS_BY_TRAIL[trailId] = segs;
      return ok(lo);
    },
  },
  {
    pattern: /\/api\/trails\/([^/]+)\/segments$/,
    handler: ({ url, method, body }) => {
      const trailId = url.pathname.split("/")[3];
      if (method === "POST") {
        const b = body as {
          name?: string | null;
          surface_type?: string | null;
          hazards?: string[];
          is_road_connector?: boolean;
          steep_grade?: boolean;
          one_way?: boolean;
          description?: string | null;
          geometry?: unknown;
        };
        if (!b?.geometry) return { status: 400, body: { error: "missing geometry" } };
        const id = `seg-new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const segs = (SEGMENTS_BY_TRAIL[trailId] ?? []) as Array<Record<string, unknown>>;
        const seg = {
          id,
          trail_id: trailId,
          name: b.name ?? null,
          sort_order: segs.length,
          surface_type: b.surface_type ?? null,
          hazards: b.hazards ?? [],
          is_road_connector: b.is_road_connector ?? false,
          steep_grade: b.steep_grade ?? false,
          one_way: b.one_way ?? false,
          description: b.description ?? null,
          length_meters: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        segs.push(seg);
        SEGMENTS_BY_TRAIL[trailId] = segs;
        return ok(seg, 201);
      }
      // GET is handled by the earlier patterns. Returning nothing here
      // lets the route handler chain fall through.
      return undefined;
    },
  },
  // ===========================================================================
  // §21.4 — presets
  // ===========================================================================
  {
    pattern: /\/api\/presets\/by-key\/([^/]+)$/,
    handler: ({ url }) => {
      const key = url.pathname.split("/").pop();
      const p = PRESETS.find((x) => x.key === key);
      return p ? ok(p) : notFound(`preset '${key}' not found`);
    },
  },
  {
    pattern: /\/api\/presets\/([^/]+)$/,
    handler: ({ url, method, body, headers }) => {
      const id = url.pathname.split("/").pop()!;
      if (method === "GET") {
        const p = PRESETS.find((x) => x.id === id);
        return p ? ok(p) : notFound(`preset ${id} not found`);
      }
      // Mod+ required.
      const token = bearerUser(headers);
      if (!token || MOCK_USERS[token.id]?.role !== "admin") {
        return { status: 401, body: { error: "unauthorized", message: "admin access required" } };
      }
      if (method === "PUT") {
        const idx = PRESETS.findIndex((x) => x.id === id);
        if (idx < 0) return notFound("preset not found");
        const b = body as {
          label?: string;
          icon_name?: string;
          icon_color?: string;
          category?: string;
          osm_tags?: Record<string, string>;
          questions?: unknown;
          upstreamable?: boolean;
          sort_order?: number;
        };
        PRESETS[idx] = { ...PRESETS[idx], ...b, updated_at: new Date().toISOString() };
        return ok(PRESETS[idx]);
      }
      if (method === "DELETE") {
        const idx = PRESETS.findIndex((x) => x.id === id);
        if (idx < 0) return notFound("preset not found");
        PRESETS.splice(idx, 1);
        return ok({ ok: true });
      }
      return undefined;
    },
  },
  {
    pattern: /\/api\/presets$/,
    handler: ({ method, body, query, headers }) => {
      if (method === "GET") {
        const category = query.category;
        const filtered = category
          ? PRESETS.filter((p) => p.category === category)
          : PRESETS;
        return ok({ items: filtered, total: filtered.length });
      }
      if (method === "POST") {
        const token = bearerUser(headers);
        if (!token || MOCK_USERS[token.id]?.role !== "admin") {
          return { status: 401, body: { error: "unauthorized", message: "admin access required" } };
        }
        const b = body as {
          key: string;
          label: string;
          icon_name: string;
          icon_color: string;
          category: string;
          osm_tags?: Record<string, string>;
          questions?: Array<{ key: string; type: "boolean" | "select"; label: string; options?: Array<{ value: string; label: string }> }>;
          upstreamable?: boolean;
          sort_order?: number;
        };
        if (!b?.key || !b?.label || !b?.icon_name || !b?.icon_color || !b?.category) {
          return { status: 400, body: { error: "invalid_input", message: "missing required fields" } };
        }
        const now = new Date().toISOString();
        const preset = {
          id: `preset-${nextPresetId++}`,
          key: b.key,
          label: b.label,
          icon_name: b.icon_name,
          icon_color: b.icon_color,
          category: b.category,
          osm_tags: b.osm_tags ?? {},
          questions: b.questions ?? [],
          upstreamable: b.upstreamable ?? false,
          sort_order: b.sort_order ?? 100,
          created_by: token.id,
          created_at: now,
          updated_at: now,
        };
        PRESETS.push(preset);
        return ok(preset, 201);
      }
      return undefined;
    },
  },
  // ===========================================================================
  // §21.5 — super-systems + sub-systems + move
  // ===========================================================================
  {
    pattern: /\/api\/super-systems\/([^/]+)$/,
    handler: ({ url, method, headers }) => {
      const id = url.pathname.split("/").pop()!;
      if (method === "GET") {
        const s = SUPER_SYSTEMS.find((x) => x.id === id);
        return s ? ok(s) : notFound(`super-system ${id} not found`);
      }
      const token = bearerUser(headers);
      if (!token) return { status: 401, body: { error: "unauthorized" } };
      if (method === "DELETE") {
        const idx = SUPER_SYSTEMS.findIndex((x) => x.id === id);
        if (idx < 0) return notFound();
        SUPER_SYSTEMS.splice(idx, 1);
        // Detach memberships
        for (let i = SYSTEM_SUPER_MEMBERSHIPS.length - 1; i >= 0; i--) {
          if (SYSTEM_SUPER_MEMBERSHIPS[i]?.super_system_id === id) {
            SYSTEM_SUPER_MEMBERSHIPS.splice(i, 1);
          }
        }
        return ok({ ok: true });
      }
      return undefined;
    },
  },
  {
    pattern: /\/api\/super-systems$/,
    handler: ({ method, body, headers }) => {
      if (method === "GET") {
        return ok({ items: SUPER_SYSTEMS, total: SUPER_SYSTEMS.length });
      }
      if (method === "POST") {
        const token = bearerUser(headers);
        if (!token) return { status: 401, body: { error: "unauthorized" } };
        const b = body as { name: string; slug: string; official?: boolean; description?: string; external_url?: string };
        if (!b?.name || !b?.slug) return { status: 400, body: { error: "invalid_input" } };
        const now = new Date().toISOString();
        const sup = {
          id: `super-${nextSuperId++}`,
          name: b.name,
          slug: b.slug,
          official: b.official ?? true,
          description: b.description ?? null,
          external_url: b.external_url ?? null,
          created_at: now,
          updated_at: now,
        };
        SUPER_SYSTEMS.push(sup);
        return ok(sup, 201);
      }
      return undefined;
    },
  },
  {
    pattern: /\/api\/sub-systems\/([^/]+)$/,
    handler: ({ url, method, headers }) => {
      const id = url.pathname.split("/").pop()!;
      if (method === "GET") {
        const s = SUB_SYSTEMS.find((x) => x.id === id);
        return s ? ok(s) : notFound(`sub-system ${id} not found`);
      }
      const token = bearerUser(headers);
      if (!token) return { status: 401, body: { error: "unauthorized" } };
      if (method === "DELETE") {
        const idx = SUB_SYSTEMS.findIndex((x) => x.id === id);
        if (idx < 0) return notFound();
        SUB_SYSTEMS.splice(idx, 1);
        return ok({ ok: true });
      }
      return undefined;
    },
  },
  {
    pattern: /\/api\/sub-systems$/,
    handler: ({ method, body, query, headers }) => {
      if (method === "GET") {
        const systemId = query.system_id;
        const items = systemId
          ? SUB_SYSTEMS.filter((s) => s.system_id === systemId)
          : SUB_SYSTEMS;
        return ok({ items, total: items.length });
      }
      if (method === "POST") {
        const token = bearerUser(headers);
        if (!token) return { status: 401, body: { error: "unauthorized" } };
        const b = body as { system_id: string; name: string; slug: string; description?: string };
        if (!b?.system_id || !b?.name || !b?.slug) {
          return { status: 400, body: { error: "invalid_input" } };
        }
        const now = new Date().toISOString();
        const sub = {
          id: `sub-${nextSubId++}`,
          name: b.name,
          slug: b.slug,
          system_id: b.system_id,
          description: b.description ?? null,
          created_at: now,
          updated_at: now,
        };
        SUB_SYSTEMS.push(sub);
        return ok(sub, 201);
      }
      return undefined;
    },
  },
  {
    pattern: /\/api\/systems\/tree$/,
    handler: () => {
      // Build the hierarchy tree. Loosely-attached systems (no super)
      // go under a synthetic "loose" bucket.
      const nodes: Array<{
        id: string;
        name: string;
        slug: string;
        tier: "super" | "system" | "sub";
        children: Array<{
          id: string;
          name: string;
          slug: string;
          tier: "system" | "sub";
          children: Array<{ id: string; name: string; slug: string; tier: "sub" }>;
        }>;
      }> = [];
      for (const sup of SUPER_SYSTEMS) {
        const childSystems = SYSTEMS.filter((s) =>
          SYSTEM_SUPER_MEMBERSHIPS.some(
            (m) => m.super_system_id === sup.id && m.system_id === s.id,
          ),
        ).map((s) => ({
          id: s.id,
          name: s.name,
          slug: s.slug,
          tier: "system" as const,
          children: SUB_SYSTEMS.filter((sub) => sub.system_id === s.id).map((sub) => ({
            id: sub.id,
            name: sub.name,
            slug: sub.slug,
            tier: "sub" as const,
          })),
        }));
        nodes.push({
          id: sup.id,
          name: sup.name,
          slug: sup.slug,
          tier: "super",
          children: childSystems,
        });
      }
      const looseSystemIds = new Set(
        SYSTEMS
          .filter((s) => !SYSTEM_SUPER_MEMBERSHIPS.some((m) => m.system_id === s.id))
          .map((s) => s.id),
      );
      if (looseSystemIds.size > 0) {
        nodes.push({
          id: "__loose__",
          name: "Loose systems",
          slug: "loose",
          tier: "super",
          children: SYSTEMS.filter((s) => looseSystemIds.has(s.id)).map((s) => ({
            id: s.id,
            name: s.name,
            slug: s.slug,
            tier: "system" as const,
            children: SUB_SYSTEMS.filter((sub) => sub.system_id === s.id).map((sub) => ({
              id: sub.id,
              name: sub.name,
              slug: sub.slug,
              tier: "sub" as const,
            })),
          })),
        });
      }
      return ok({ nodes, total: nodes.length });
    },
  },
  {
    pattern: /\/api\/systems\/contains$/,
    handler: ({ query }) => {
      // Simple bounding-box check against fixture centers. Falls back
      // to nearest if no containment (mirrors the real endpoint).
      const lon = Number(query.lon);
      const lat = Number(query.lat);
      const EPS = 0.5; // ~50km at the equator
      const inside = SYSTEMS.filter((s) => {
        const c = s.center as { lon: number; lat: number } | undefined;
        if (!c) return false;
        return Math.abs(c.lon - lon) < EPS && Math.abs(c.lat - lat) < EPS;
      });
      if (inside.length > 0) {
        return ok({
          systems: inside.map((s) => ({
            id: s.id,
            name: s.name,
            slug: s.slug,
            distance_m: 0,
          })),
          fallback: "point_in_polygon",
        });
      }
      return ok({
        systems: [],
        fallback: "nearest",
      });
    },
  },
  {
    pattern: /\/api\/systems\/([^/]+)\/move$/,
    handler: ({ url, method, body, headers }) => {
      const token = bearerUser(headers);
      if (!token) return { status: 401, body: { error: "unauthorized" } };
      const sourceSystemId = url.pathname.split("/")[3];
      if (method !== "POST") return undefined;
      const b = body as {
        action: string;
        target_super_id?: string;
        target_system_id?: string;
        sub_system_id?: string;
        trail_ids?: string[];
      };
      if (!b?.action) return { status: 400, body: { error: "invalid_input" } };
      const actor = MOCK_USERS[token.id];
      // Simple protection gate: New tier (karma < 50) gets 403 on
      // any non-trivial system action.
      if (b.action === "merge_into") {
        if (!b.target_system_id) {
          return { status: 400, body: { error: "invalid_input", message: "target_system_id required" } };
        }
        if (sourceSystemId === b.target_system_id) {
          return { status: 400, body: { error: "invalid_input", message: "cannot merge into self" } };
        }
        const srcIdx = SYSTEMS.findIndex((s) => s.id === sourceSystemId);
        if (srcIdx < 0) return notFound("source system not found");
        SYSTEMS.splice(srcIdx, 1);
        return ok({ ok: true, action: b.action, affected: 0 });
      }
      if (b.action === "move_to_super") {
        if (!b.target_super_id) {
          return { status: 400, body: { error: "invalid_input" } };
        }
        // Protection: new-tier users get 403
        if (actor && actor.trust_score < 50) {
          return { status: 403, body: { error: "forbidden", message: "protection level 'normal' requires higher trust tier" } };
        }
        const exists = SYSTEM_SUPER_MEMBERSHIPS.some(
          (m) => m.system_id === sourceSystemId && m.super_system_id === b.target_super_id,
        );
        if (!exists) {
          SYSTEM_SUPER_MEMBERSHIPS.push({ system_id: sourceSystemId, super_system_id: b.target_super_id });
        }
        return ok({ ok: true, action: b.action, affected: 1 });
      }
      if (b.action === "move_out_of_super") {
        if (!b.target_super_id) {
          return { status: 400, body: { error: "invalid_input" } };
        }
        for (let i = SYSTEM_SUPER_MEMBERSHIPS.length - 1; i >= 0; i--) {
          if (
            SYSTEM_SUPER_MEMBERSHIPS[i]?.system_id === sourceSystemId &&
            SYSTEM_SUPER_MEMBERSHIPS[i]?.super_system_id === b.target_super_id
          ) {
            SYSTEM_SUPER_MEMBERSHIPS.splice(i, 1);
          }
        }
        return ok({ ok: true, action: b.action, affected: 1 });
      }
      if (b.action === "promote_to_system") {
        if (!b.sub_system_id) {
          return { status: 400, body: { error: "invalid_input" } };
        }
        const sub = SUB_SYSTEMS.find((s) => s.id === b.sub_system_id);
        if (!sub) return notFound("sub-system not found");
        const sys = {
          ...SYSTEMS[0]!,
          id: `sys-new-${Date.now().toString(36)}`,
          name: sub.name,
          slug: `${sub.slug}-promoted-${Math.random().toString(36).slice(2, 6)}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        SYSTEMS.push(sys);
        return ok({ ok: true, action: b.action, affected: 1 });
      }
      return { status: 400, body: { error: "invalid_input", message: `unknown action ${b.action}` } };
    },
  },
  // ===========================================================================
  // §21.7 — votes
  // ===========================================================================
  {
    pattern: /\/api\/votes\/users\/([^/]+)\/karma$/,
    handler: ({ url, method }) => {
      if (method !== "GET") return undefined;
      const userId = url.pathname.split("/")[4];
      const user = MOCK_USERS[userId];
      if (!user) return notFound("user not found");
      // Compute trace_count / feature_count from fixtures (mock
      // simplification — real impl queries gps_traces).
      const traceCount = 0;
      const featureCount = Object.values(FEATURES).filter(
        (f) => (f as { created_by_user_id?: string }).created_by_user_id === userId,
      ).length;
      const revisionCount = REVISIONS.filter((r) => r.author_id === userId).length;
      // Ups: sum of upvotes on features the user authored.
      let up = 0;
      let down = 0;
      for (const f of Object.values(FEATURES)) {
        const author = (f as { created_by_user_id?: string }).created_by_user_id;
        if (author === userId) {
          const key = scoreKey("feature", (f as { id: string }).id);
          const s = ENTITY_SCORES[key];
          if (s) {
            up += s.upvotes;
            down += s.downvotes;
          }
        }
      }
      return ok({
        user_id: userId,
        karma: user.trust_score,
        tier: tierFromKarma(user.trust_score),
        tier_label: tierFromKarma(user.trust_score),
        upvotes_received: up,
        downvotes_received: down,
        trace_count: traceCount,
        feature_count: featureCount,
        revision_count: revisionCount,
      });
    },
  },
  {
    pattern: /\/api\/votes\/([^/]+)\/([^/]+)$/,
    handler: ({ url, method, headers }) => {
      const targetType = url.pathname.split("/")[3];
      const targetId = url.pathname.split("/")[4];
      if (method === "GET") {
        const score = getOrCreateScore(targetType, targetId);
        const token = bearerUser(headers);
        const myVote = token
          ? VOTES.find(
              (v) =>
                v.user_id === token.id &&
                v.target_type === targetType &&
                v.target_id === targetId,
            )
          : undefined;
        return ok({
          ...score,
          my_vote: myVote ? (myVote.value === 1 ? 1 : -1) : 0,
        });
      }
      if (method === "DELETE") {
        const token = bearerUser(headers);
        if (!token) return { status: 401, body: { error: "unauthorized" } };
        const idx = VOTES.findIndex(
          (v) => v.user_id === token.id && v.target_type === targetType && v.target_id === targetId,
        );
        if (idx < 0) {
          return ok({
            upvotes: 0,
            downvotes: 0,
            net: 0,
            hidden: false,
            my_vote: 0,
            karma_awarded: 0,
          });
        }
        const existing = VOTES[idx]!;
        VOTES.splice(idx, 1);
        const s = getOrCreateScore(targetType, targetId);
        if (existing.value === 1) s.upvotes = Math.max(0, s.upvotes - 1);
        else s.downvotes = Math.max(0, s.downvotes - 1);
        s.net = s.upvotes - s.downvotes;
        s.hidden = s.net <= -3;
        // Reverse karma
        const authorId = authorForTarget(targetType, targetId);
        if (authorId) {
          const author = MOCK_USERS[authorId];
          if (author) {
            const tier = tierFromKarma(existing.voter_karma);
            const delta = -1 * tierWeight(tier) * existing.value;
            author.trust_score = Math.max(0, author.trust_score + delta);
          }
        }
        return ok({
          ...s,
          my_vote: 0,
          karma_awarded: 0,
        });
      }
      return undefined;
    },
  },
  {
    pattern: /\/api\/votes$/,
    handler: ({ method, body, headers }) => {
      if (method !== "POST") return undefined;
      const token = bearerUser(headers);
      if (!token) return { status: 401, body: { error: "unauthorized" } };
      const b = body as { target_type: string; target_id: string; value: 1 | -1 };
      if (!b?.target_type || !b?.target_id || (b.value !== 1 && b.value !== -1)) {
        return { status: 400, body: { error: "invalid_input" } };
      }
      const voter = MOCK_USERS[token.id];
      if (!voter) return { status: 401, body: { error: "unauthorized" } };
      // Look for an existing vote by this user on this target.
      const idx = VOTES.findIndex(
        (v) => v.user_id === token.id && v.target_type === b.target_type && v.target_id === b.target_id,
      );
      const previous = idx >= 0 ? VOTES[idx] : null;
      // Capture the previous value before mutating it — the tally
      // math below checks the prior value to reverse its contribution.
      const previousValue = previous?.value;
      const previousVoterTier = previous?.voter_tier;
      const now = new Date().toISOString();
      if (previous) {
        previous.value = b.value;
        previous.voter_karma = voter.trust_score;
        previous.voter_tier = tierFromKarma(voter.trust_score);
        previous.updated_at = now;
      } else {
        VOTES.push({
          id: `vote-${nextVoteId++}`,
          target_type: b.target_type,
          target_id: b.target_id,
          user_id: token.id,
          value: b.value,
          voter_karma: voter.trust_score,
          voter_tier: tierFromKarma(voter.trust_score),
          created_at: now,
          updated_at: now,
        });
      }
      const s = getOrCreateScore(b.target_type, b.target_id);
      // Reverse previous then apply new. Use the captured value, not
      // the (now-mutated) previous.value, to reverse the right bucket.
      if (previousValue === 1) s.upvotes = Math.max(0, s.upvotes - 1);
      if (previousValue === -1) s.downvotes = Math.max(0, s.downvotes - 1);
      if (b.value === 1) s.upvotes += 1;
      if (b.value === -1) s.downvotes += 1;
      s.net = s.upvotes - s.downvotes;
      s.hidden = s.net <= -3;
      // Karma attribution: target author gets tier-weighted delta.
      let karmaAwarded = 0;
      const authorId = authorForTarget(b.target_type, b.target_id);
      if (authorId) {
        const author = MOCK_USERS[authorId];
        if (author) {
          const voterTier = tierFromKarma(voter.trust_score);
          const tw = tierWeight(voterTier);
          // Reverse prior vote's contribution to this user. Use the
          // captured values (not the now-mutated previous.voter_tier
          // / previous.value) so a switch from +1 to -1 reverses the
          // original +1 contribution before applying -1.
          if (previous) {
            const priorTw = tierWeight(previousVoterTier ?? "new");
            author.trust_score = Math.max(
              0,
              author.trust_score - priorTw * (previousValue ?? 0),
            );
          }
          const delta = tw * b.value;
          author.trust_score = Math.max(0, author.trust_score + delta);
          karmaAwarded = delta;
        }
      }
      return ok({
        ...s,
        my_vote: b.value,
        karma_awarded: karmaAwarded,
      });
    },
  },
  // ===========================================================================
  // §21.8 — patrol + generalized revisions
  // ===========================================================================
  {
    pattern: /\/api\/admin\/patrol\/act$/,
    handler: ({ method, body, headers }) => {
      const token = bearerUser(headers);
      if (!token || MOCK_USERS[token.id]?.role !== "admin") {
        return { status: 401, body: { error: "unauthorized" } };
      }
      if (method !== "POST") return undefined;
      const b = body as {
        flag_id?: string;
        revision_id?: string;
        action: string;
        reason?: string;
        revision_target_type?: string;
        revision_target_id?: string;
        revision_action?: string;
        revision_author_id?: string;
        revision_summary?: string;
      };
      if (b.action === "resolve" && b.flag_id) {
        const idx = PATROL_FLAGS.findIndex((f) => f.id === b.flag_id);
        if (idx >= 0) {
          PATROL_FLAGS[idx]!.resolved = true;
        }
        return ok({ ok: true, action: "resolve" });
      }
      if (b.action === "seed") {
        // Test-only seed: insert a flag and return its id. Lets spec
        // files populate the feed and verify resolve + filter
        // behavior without having to drive a real edit burst.
        const id = `flag-seed-${nextPatrolId++}`;
        PATROL_FLAGS.push({
          id,
          revision_id: b.revision_id ?? `rev-seed-${id}`,
          reason: (b.reason as never) ?? "new_tier_semi_edit",
          resolved: false,
          created_at: new Date().toISOString(),
          details: {
            target_type: b.revision_target_type,
            target_id: b.revision_target_id,
            action: b.revision_action,
            author_id: b.revision_author_id,
            summary: b.revision_summary,
          },
        });
        return ok({ id, action: "seed" });
      }
      return ok({ ok: true });
    },
  },
  {
    pattern: /\/api\/admin\/patrol$/,
    handler: ({ method, query, headers }) => {
      const token = bearerUser(headers);
      if (!token || MOCK_USERS[token.id]?.role !== "admin") {
        return { status: 401, body: { error: "unauthorized" } };
      }
      if (method !== "GET") return undefined;
      const resolved = query.resolved;
      let items = PATROL_FLAGS;
      if (resolved === "false") items = items.filter((f) => !f.resolved);
      if (resolved === "true") items = items.filter((f) => f.resolved);
      return ok({
        items: items.map((f) => ({
          id: f.id,
          revision_id: f.revision_id,
          reason: f.reason,
          resolved: f.resolved,
          created_at: f.created_at,
          // The patrol page renders these — include them so the
          // resolved-action + detail tests can assert on the
          // rendered text.
          revision_target_type: (f.details?.target_type as string) ?? "system",
          revision_target_id: (f.details?.target_id as string) ?? f.revision_id,
          revision_action: (f.details?.action as string) ?? "edit",
          revision_author_id: (f.details?.author_id as string) ?? null,
          revision_summary: (f.details?.summary as string) ?? null,
        })),
        total: items.length,
      });
    },
  },
  {
    pattern: /\/api\/admin\/dashboard$/,
    handler: ({ headers }) => {
      const token = bearerUser(headers);
      if (!token || MOCK_USERS[token.id]?.role !== "admin") {
        return { status: 401, body: { error: "unauthorized" } };
      }
      return ok({
        userCount: Object.keys(MOCK_USERS).length,
        revisionCount: REVISIONS.length,
        trailCount: TRAILS.length,
        featureCount: Object.keys(FEATURES).length,
        presetCount: PRESETS.length,
        voteCount: VOTES.length,
      });
    },
  },
  {
    pattern: /\/api\/revisions\/recent$/,
    handler: ({ method, query, headers }) => {
      if (method !== "GET") return undefined;
      const token = bearerUser(headers);
      if (!token || MOCK_USERS[token.id]?.role !== "admin") {
        return { status: 401, body: { error: "unauthorized" } };
      }
      const targetType = query.target_type;
      let items = REVISIONS;
      if (targetType) items = items.filter((r) => r.target_type === targetType);
      // Most recent first
      return ok({
        items: [...items].sort((a, b) => b.created_at.localeCompare(a.created_at)),
        total: items.length,
      });
    },
  },
  {
    pattern: /\/api\/revisions\/target\/([^/]+)\/([^/]+)$/,
    handler: ({ url, method }) => {
      if (method !== "GET") return undefined;
      const targetType = url.pathname.split("/")[3];
      const targetId = url.pathname.split("/")[4];
      const items = REVISIONS.filter(
        (r) => r.target_type === targetType && r.target_id === targetId,
      );
      return ok({
        items: [...items].sort((a, b) => b.created_at.localeCompare(a.created_at)),
        total: items.length,
      });
    },
  },
  // ===========================================================================
  // POST /api/systems (new system)
  // ===========================================================================
  {
    pattern: /\/api\/systems$/,
    handler: ({ method, body, headers, query }) => {
      // /api/systems?tree and /api/systems/contains and /api/systems are
      // handled by their specific patterns above. This catch-all only
      // matches the bare list / create endpoint.
      if (method === "GET" && !query.tree && !query.contains) {
        const q = query.q?.toLowerCase() ?? "";
        const items = q ? SYSTEMS.filter((s) => s.name.toLowerCase().includes(q)) : [...SYSTEMS];
        return ok({ items, total: items.length, page: 1, pageSize: 20 });
      }
      if (method === "POST") {
        const token = bearerUser(headers);
        if (!token) return { status: 401, body: { error: "unauthorized" } };
        const b = body as {
          name: string;
          slug: string;
          description?: string;
          external_url?: string;
          ownership_source?: string;
          source_date?: string;
          color?: string;
          boundary?: unknown;
        };
        if (!b?.name || !b?.slug) {
          return { status: 400, body: { error: "invalid_input" } };
        }
        const now = new Date().toISOString();
        const sys = {
          ...SYSTEMS[0]!,
          id: `sys-new-${Date.now().toString(36)}`,
          name: b.name,
          slug: b.slug,
          description: b.description ?? null,
          external_url: b.external_url ?? null,
          ownership_source: b.ownership_source ?? null,
          source_date: b.source_date ?? null,
          color: b.color ?? "#22c55e",
          created_at: now,
          updated_at: now,
          center: SYSTEMS[0]?.center ?? { lat: 39.9612, lon: -82.9988 },
        };
        SYSTEMS.push(sys);
        return ok(sys, 201);
      }
      return notFound();
    },
  },
  // Search
  {
    pattern: /\/api\/search$/,
    handler: ({ query }) => {
      const q = query.q?.toLowerCase() ?? "";
      const allFeatures = Object.values(FEATURES);
      return ok({
        systems: SYSTEMS.filter((s) => s.name.toLowerCase().includes(q)),
        trails: TRAILS.filter((t) => t.name.toLowerCase().includes(q)),
          features: q
          ? allFeatures.filter((f) => {
              const name = String((f as { name?: string }).name ?? "").toLowerCase();
              return name.includes(q);
            })
          : [],
      });
    },
  },
  // ===========================================================================
  // §21.6 phase 2 — synthesis + premium import (moderator tier)
  // ===========================================================================
  {
    pattern: /\/api\/systems\/([^/]+)\/synthesize$/,
    handler: ({ url, method, headers }) => {
      const err = requireModerator(headers);
      if (err) return err;
      if (method !== "POST") return undefined;
      const systemId = url.pathname.split("/")[3];
      const system = SYSTEMS.find((s) => s.id === systemId);
      if (!system) return notFound("system not found");
      // Mock: pretend 0 segments were cut and 1 proposal was queued.
      const newProp = {
        id: `prop-${nextProposalId++}`,
        trace_id: "trace-1",
        segment_id: `seg-new-${Date.now().toString(36)}`,
        cluster_id: 1,
        reason: "no_nearby_trail" as const,
      };
      SYNTHESIS_PROPOSALS.push(newProp);
      return ok({
        run: {
          id: `run-${Date.now().toString(36)}`,
          status: "completed",
          trails_updated: 0,
          trails_proposed: 1,
        },
        clusters: 1,
        assigned: 0,
        proposed: 1,
        trails_updated: 0,
      });
    },
  },
  {
    pattern: /\/api\/admin\/synthesis-proposals$/,
    handler: ({ query, method, headers }) => {
      const err = requireModerator(headers);
      if (err) return err;
      if (method !== "GET") return undefined;
      const systemId = query.system_id;
      if (!systemId) return { status: 400, body: { error: "system_id is required" } };
      return ok({ proposals: SYNTHESIS_PROPOSALS });
    },
  },
  {
    pattern: /\/api\/admin\/synthesis-proposals\/([^/]+)\/approve$/,
    handler: ({ url, method, body, headers }) => {
      const err = requireModerator(headers);
      if (err) return err;
      if (method !== "POST") return undefined;
      const segmentId = url.pathname.split("/")[4];
      const b = body as { system_id?: string; name?: string };
      if (!b?.system_id || !b?.name) {
        return { status: 400, body: { error: "system_id and name are required" } };
      }
      const idx = SYNTHESIS_PROPOSALS.findIndex((p) => p.segment_id === segmentId);
      if (idx >= 0) SYNTHESIS_PROPOSALS.splice(idx, 1);
      const slug = b.name
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-|-$/g, "");
      const trail = {
        id: `trail-synth-${nextSyntheticTrailId++}`,
        name: b.name,
        slug,
        tier: "synthesized" as const,
        system_id: b.system_id,
        difficulty: null,
      };
      SYNTHETIC_TRAILS.push(trail);
      return ok(trail);
    },
  },
  {
    pattern: /\/api\/admin\/synthesis-proposals\/([^/]+)\/reject$/,
    handler: ({ url, method, body, headers }) => {
      const err = requireModerator(headers);
      if (err) return err;
      if (method !== "POST") return undefined;
      const segmentId = url.pathname.split("/")[4];
      const b = body as { system_id?: string };
      if (!b?.system_id) return { status: 400, body: { error: "system_id is required" } };
      const idx = SYNTHESIS_PROPOSALS.findIndex((p) => p.segment_id === segmentId);
      if (idx >= 0) SYNTHESIS_PROPOSALS.splice(idx, 1);
      return ok({ ok: true });
    },
  },
  {
    pattern: /\/api\/admin\/trails\/([^/]+)\/promote$/,
    handler: ({ url, method, body, headers }) => {
      const err = requireModerator(headers);
      if (err) return err;
      if (method !== "POST") return undefined;
      const trailId = url.pathname.split("/")[4];
      const b = body as { to?: "frozen" | "premium" };
      if (!b?.to || (b.to !== "frozen" && b.to !== "premium")) {
        return { status: 400, body: { error: "to must be 'frozen' or 'premium'" } };
      }
      const synth = SYNTHETIC_TRAILS.find((t) => t.id === trailId);
      if (synth) {
        synth.tier = b.to;
        return ok({ id: synth.id, tier: synth.tier });
      }
      const t = (TRAILS as Array<{ id: string; tier?: string }>).find((x) => x.id === trailId);
      if (t) {
        t.tier = b.to;
        return ok({ id: t.id, tier: t.tier });
      }
      return notFound("trail not found");
    },
  },
  {
    pattern: /\/api\/admin\/trails\/import$/,
    handler: ({ method, body, headers }) => {
      const err = requireModerator(headers);
      if (err) return err;
      if (method !== "POST") return undefined;
      const b = body as {
        name?: string;
        slug?: string;
        system_id?: string;
        difficulty?: string;
        external_url?: string;
        geometry?: unknown;
      };
      if (!b?.name || !b?.slug || !b?.system_id || !b?.geometry) {
        return {
          status: 400,
          body: { error: "name, slug, system_id, and geometry are required" },
        };
      }
      if (!/^[a-z0-9-]+$/.test(b.slug)) {
        return { status: 400, body: { error: "slug must be kebab-case" } };
      }
      const trail = {
        id: `trail-prem-${Date.now().toString(36)}`,
        name: b.name,
        slug: b.slug,
        tier: "premium" as const,
        system_id: b.system_id,
        difficulty: b.difficulty ?? null,
      };
      SYNTHETIC_TRAILS.push(trail);
      return ok(trail, 201);
    },
  },
  // ===========================================================================
  // §21.6 — GPS traces: list, create, import, detail, vote, remove
  // ===========================================================================
  {
    pattern: /\/api\/traces\/import$/,
    handler: ({ method, body, headers }) => {
      if (method !== "POST") return undefined;
      const token = bearerUser(headers);
      if (!token) return { status: 401, body: { error: "unauthorized" } };
      const b = body as {
        format?: "gpx" | "geojson";
        payload?: string | Record<string, unknown>;
        recorded_at?: string;
        contributor_name?: string;
      };
      if (!b?.format || !b?.payload) {
        return { status: 400, body: { error: "format and payload are required" } };
      }
      // Extract a minimal LineString for the mock — real impl parses
      // GPX / GeoJSON fully. The point of this handler is to verify
      // the upload happy path.
      const coords: Array<[number, number]> =
        b.format === "geojson" && typeof b.payload === "object" && b.payload
          ? (((b.payload as { coordinates?: Array<[number, number]> }).coordinates ?? []) as Array<[number, number]>)
          : b.format === "gpx" && typeof b.payload === "string"
            ? extractGpxCoords(b.payload)
            : [];
      if (coords.length < 2) {
        return { status: 400, body: { error: "payload did not contain at least 2 points" } };
      }
      const id = `trace-${nextTraceId++}`;
      const now = new Date().toISOString();
      const trace = {
        id,
        user_id: token.id,
        contributor_name: b.contributor_name ?? MOCK_USERS[token.id]?.username ?? "anonymous",
        geometry: { type: "LineString" as const, coordinates: coords },
        source: "import" as const,
        weight: 1.0,
        upvotes: 0,
        downvotes: 0,
        status: "active" as const,
        recorded_at: b.recorded_at ?? null,
        created_at: now,
        derived_from_segments: 0,
        last_synthesized_at: null,
      };
      TRACES.push(trace);
      // Auto-tag the trace to a system via the same bounding-box check
      // used by /api/systems/contains. For mock simplicity, the first
      // matching system wins.
      const matched = pickSystemForTrace(coords);
      if (matched) TRACE_SYSTEMS.push({ trace_id: id, system_id: matched });
      return ok({ trace, tagged_system_ids: matched ? [matched] : [], points: coords.length, length_meters: traceLengthMeters(coords) });
    },
  },
  {
    pattern: /\/api\/traces\/([^/]+)\/remove$/,
    handler: ({ url, method, headers }) => {
      const err = requireModerator(headers);
      if (err) return err;
      if (method !== "POST") return undefined;
      const id = url.pathname.split("/")[3];
      const t = TRACES.find((x) => x.id === id);
      if (!t) return notFound("trace not found");
      t.status = "removed";
      return ok({ ok: true });
    },
  },
  {
    pattern: /\/api\/traces\/([^/]+)\/vote$/,
    handler: ({ url, method, body, headers }) => {
      const id = url.pathname.split("/")[3];
      const t = TRACES.find((x) => x.id === id);
      if (!t) return notFound("trace not found");
      const token = bearerUser(headers);
      if (method === "GET") {
        const myVote = token
          ? TRACE_VOTES.find((v) => v.user_id === token.id && v.trace_id === id)
          : undefined;
        return ok({
          upvotes: t.upvotes,
          downvotes: t.downvotes,
          net: t.upvotes - t.downvotes,
          hidden: t.status === "ignored",
          my_vote: myVote ? (myVote.value === 1 ? 1 : -1) : 0,
          karma_awarded: 0,
        });
      }
      if (method === "POST") {
        if (!token) return { status: 401, body: { error: "unauthorized" } };
        const b = body as { value?: 1 | -1 };
        if (b.value !== 1 && b.value !== -1) {
          return { status: 400, body: { error: "value must be 1 or -1" } };
        }
        const idx = TRACE_VOTES.findIndex(
          (v) => v.user_id === token.id && v.trace_id === id,
        );
        if (idx >= 0) TRACE_VOTES.splice(idx, 1);
        TRACE_VOTES.push({
          id: `tvote-${TRACE_VOTES.length + 1}`,
          trace_id: id,
          user_id: token.id,
          value: b.value,
          created_at: new Date().toISOString(),
        });
        // Recompute counts from TRACE_VOTES so retracting + switching
        // yields consistent state across the mock.
        const ups = TRACE_VOTES.filter((v) => v.trace_id === id && v.value === 1).length;
        const downs = TRACE_VOTES.filter((v) => v.trace_id === id && v.value === -1).length;
        t.upvotes = ups;
        t.downvotes = downs;
        t.weight = traceWeight(ups, downs);
        t.status = t.weight < 0.3 ? "ignored" : "active";
        return ok({
          upvotes: t.upvotes,
          downvotes: t.downvotes,
          net: t.upvotes - t.downvotes,
          hidden: t.status === "ignored",
          my_vote: b.value,
          karma_awarded: 0,
        });
      }
      if (method === "DELETE") {
        if (!token) return { status: 401, body: { error: "unauthorized" } };
        const idx = TRACE_VOTES.findIndex(
          (v) => v.user_id === token.id && v.trace_id === id,
        );
        if (idx < 0) {
          return ok({
            upvotes: t.upvotes,
            downvotes: t.downvotes,
            net: t.upvotes - t.downvotes,
            hidden: t.status === "ignored",
            my_vote: 0,
            karma_awarded: 0,
          });
        }
        TRACE_VOTES.splice(idx, 1);
        const ups = TRACE_VOTES.filter((v) => v.trace_id === id && v.value === 1).length;
        const downs = TRACE_VOTES.filter((v) => v.trace_id === id && v.value === -1).length;
        t.upvotes = ups;
        t.downvotes = downs;
        t.weight = traceWeight(ups, downs);
        t.status = t.weight < 0.3 ? "ignored" : "active";
        return ok({
          upvotes: t.upvotes,
          downvotes: t.downvotes,
          net: t.upvotes - t.downvotes,
          hidden: t.status === "ignored",
          my_vote: 0,
          karma_awarded: 0,
        });
      }
      return undefined;
    },
  },
  {
    pattern: /\/api\/traces\/([^/]+)\/segments$/,
    handler: ({ url, method, body, headers }) => {
      const traceId = url.pathname.split("/")[3];
      const t = TRACES.find((x) => x.id === traceId);
      if (!t) return notFound("trace not found");
      if (method === "GET") {
        const items = TRACE_SEGMENTS.filter((s) => s.trace_id === traceId);
        return ok({ items, total: items.length });
      }
      if (method === "POST") {
        const token = bearerUser(headers);
        if (!token) return { status: 401, body: { error: "unauthorized" } };
        // Server-side segment cut. For the mock, just create one
        // segment covering the whole trace.
        const id = `seg-new-${nextTraceSegmentId++}`;
        TRACE_SEGMENTS.push({
          id,
          trace_id: traceId,
          geometry: t.geometry,
          cluster_id: null,
          proposed_trail_id: null,
        });
        t.derived_from_segments = TRACE_SEGMENTS.filter((s) => s.trace_id === traceId).length;
        t.last_synthesized_at = new Date().toISOString();
        return ok({ ok: true, segments: 1 });
      }
      return undefined;
    },
  },
  {
    pattern: /\/api\/trace-segments\/([^/]+)\/vote$/,
    handler: ({ url, method, body, headers }) => {
      const segmentId = url.pathname.split("/")[3];
      const seg = TRACE_SEGMENTS.find((s) => s.id === segmentId);
      if (!seg) return notFound("segment not found");
      if (method !== "POST") return undefined;
      const token = bearerUser(headers);
      if (!token) return { status: 401, body: { error: "unauthorized" } };
      const b = body as { trail_id?: string | null; contributor_name?: string };
      const idx = TRACE_SEGMENT_VOTES.findIndex(
        (v) => v.user_id === token.id && v.segment_id === segmentId,
      );
      if (idx >= 0) TRACE_SEGMENT_VOTES.splice(idx, 1);
      if (b.trail_id !== null && b.trail_id !== undefined) {
        TRACE_SEGMENT_VOTES.push({
          id: `segvote-${TRACE_SEGMENT_VOTES.length + 1}`,
          segment_id: segmentId,
          user_id: token.id,
          trail_id: b.trail_id,
          vote: 1,
          created_at: new Date().toISOString(),
        });
        seg.proposed_trail_id = b.trail_id;
      }
      return ok({ ok: true });
    },
  },
  {
    pattern: /\/api\/traces\/([^/]+)$/,
    handler: ({ url, method }) => {
      const id = url.pathname.split("/").pop()!;
      const t = TRACES.find((x) => x.id === id);
      if (!t) return notFound(`trace ${id} not found`);
      if (method === "GET") return ok(t);
      if (method === "DELETE") {
        const idx = TRACES.findIndex((x) => x.id === id);
        if (idx >= 0) TRACES.splice(idx, 1);
        return ok({ ok: true });
      }
      return undefined;
    },
  },
  {
    pattern: /\/api\/traces$/,
    handler: ({ method, body, query, headers }) => {
      if (method === "GET") {
        const systemId = query.system_id;
        let items = TRACES.filter((t) => t.status !== "removed");
        if (systemId) {
          const traceIds = new Set(
            TRACE_SYSTEMS.filter((m) => m.system_id === systemId).map((m) => m.trace_id),
          );
          items = items.filter((t) => traceIds.has(t.id));
        }
        return ok({ items, total: items.length, page: 1, pageSize: 50 });
      }
      if (method === "POST") {
        const token = bearerUser(headers);
        if (!token) return { status: 401, body: { error: "unauthorized" } };
        const b = body as {
          geometry?: { type: "LineString"; coordinates: Array<[number, number]> };
          source?: "import" | "recorded";
          recorded_at?: string;
          contributor_name?: string;
        };
        if (!b?.geometry || b.geometry.type !== "LineString") {
          return { status: 400, body: { error: "geometry LineString required" } };
        }
        const coords = b.geometry.coordinates;
        if (coords.length < 2) {
          return { status: 400, body: { error: "at least 2 points required" } };
        }
        const id = `trace-${nextTraceId++}`;
        const now = new Date().toISOString();
        const trace = {
          id,
          user_id: token.id,
          contributor_name: b.contributor_name ?? MOCK_USERS[token.id]?.username ?? "anonymous",
          geometry: { type: "LineString" as const, coordinates: coords },
          source: b.source ?? "recorded",
          weight: 1.0,
          upvotes: 0,
          downvotes: 0,
          status: "active" as const,
          recorded_at: b.recorded_at ?? now,
          created_at: now,
          derived_from_segments: 0,
          last_synthesized_at: null,
        };
        TRACES.push(trace);
        const matched = pickSystemForTrace(coords);
        if (matched) TRACE_SYSTEMS.push({ trace_id: id, system_id: matched });
        return ok({ trace, tagged_system_ids: matched ? [matched] : [] });
      }
      return undefined;
    },
  },
  // ===========================================================================
  // /api/users/:id — public profile (karma, tier, contribution counts)
  // ===========================================================================
  {
    pattern: /\/api\/users\/([^/]+)$/,
    handler: ({ url }) => {
      const id = url.pathname.split("/").pop()!;
      const user = MOCK_USERS[id];
      if (!user) return notFound("user not found");
      return ok({
        id: user.id,
        username: user.username,
        role: user.role,
        tier: tierFromKarma(user.trust_score),
        karma: user.trust_score,
        trust_score: user.trust_score,
        joined_at: "2026-01-01T00:00:00.000Z",
      });
    },
  },
  {
    pattern: /\/api\/users\/([^/]+)\/contributions$/,
    handler: ({ url }) => {
      const id = url.pathname.split("/")[3];
      const user = MOCK_USERS[id];
      if (!user) return notFound("user not found");
      const featureCount = Object.values(FEATURES).filter(
        (f) => (f as { created_by_user_id?: string }).created_by_user_id === id,
      ).length;
      const traceCount = TRACES.filter((t) => t.user_id === id).length;
      const revisionCount = REVISIONS.filter((r) => r.author_id === id).length;
      return ok({
        features: Object.values(FEATURES).filter(
          (f) => (f as { created_by_user_id?: string }).created_by_user_id === id,
        ),
        traces: TRACES.filter((t) => t.user_id === id),
        revisions: REVISIONS.filter((r) => r.author_id === id),
        counts: { features: featureCount, traces: traceCount, revisions: revisionCount },
      });
    },
  },
];

export function resetApiMock() {
  for (const key of Object.keys(WIKI_PAGES)) delete WIKI_PAGES[key];
  for (const key of Object.keys(WIKI_REVISIONS)) delete WIKI_REVISIONS[key];
  for (const key of Object.keys(CITATIONS)) delete CITATIONS[key];
  MEDIA_ITEMS.length = 0;
  PENDING_CONTRIBUTIONS.length = 0;
  DOWNLOADED_PACKS.length = 0;
  // Re-seed the segment/feature/trail data so tests that mutate them
  // (reorder, split, delete, etc.) don't leak into subsequent tests.
  for (const key of Object.keys(SEGMENTS_BY_TRAIL)) {
    SEGMENTS_BY_TRAIL[key] = (INITIAL_SEGMENTS_BY_TRAIL[key] ?? []).map((s) => ({ ...s }));
  }
  for (const id of Object.keys(FEATURES)) {
    FEATURES[id] = { ...INITIAL_FEATURES[id] };
  }
  for (const trailId of Object.keys(FEATURES_BY_TRAIL)) {
    FEATURES_BY_TRAIL[trailId] = (INITIAL_FEATURES_BY_TRAIL[trailId] ?? []).map((f) => ({ ...f }));
  }
  // Clear all redux (§21) state. User seeds are wiped AND the admin
  // is re-seeded so each test starts from the same baseline.
  for (const k of Object.keys(MOCK_USERS)) delete MOCK_USERS[k];
  ensureAdminSeeded();
  ensureFixtureUsersSeeded();
  PRESETS.length = 0;
  SUPER_SYSTEMS.length = 0;
  SUB_SYSTEMS.length = 0;
  SYSTEM_SUPER_MEMBERSHIPS.length = 0;
  VOTES.length = 0;
  for (const k of Object.keys(ENTITY_SCORES)) delete ENTITY_SCORES[k];
  PATROL_FLAGS.length = 0;
  REVISIONS.length = 0;
  seedHierarchyFixtures();
  seedPresetsFixtures();
  seedSynthesisFixtures();
  seedTraceFixtures();
  nextWikiId = 100;
  nextRevId = 200;
  nextCitationId = 300;
  nextMediaId = 400;
  nextFeatureId = 500;
  nextPendingId = 1;
  nextPresetId = 24; // after 23 seeded defaults (preset-1..preset-23)
  nextSuperId = 3; // after 2 seeded super-systems (super-1, super-2)
  nextSubId = 3; // after 2 seeded sub-systems (sub-1, sub-2)
  nextVoteId = 1;
  nextPatrolId = 1;
  nextRevisionId = 1;
}

export async function installApiMock(page: Page, opts: { failAll?: boolean } = {}) {
  // Lazy-seed: if the test file's beforeEach didn't call resetApiMock
  // (e.g. when a spec runs standalone), make sure the redux §21
  // fixtures are present so the first test in the file has a valid
  // baseline. Idempotent.
  ensureAdminSeeded();
  ensureFixtureUsersSeeded();
  if (PRESETS.length === 0 || SUPER_SYSTEMS.length === 0) {
    seedPresetsFixtures();
    seedHierarchyFixtures();
  }
  if (SYNTHESIS_PROPOSALS.length === 0) {
    seedSynthesisFixtures();
  }
  if (TRACES.length === 0) {
    seedTraceFixtures();
  }
  await page.route(`http://${MOCK_API_HOST}/**`, async (route: Route) => {
    if (opts.failAll) {
      await route.fulfill({ status: 500, body: JSON.stringify({ error: "boom" }) });
      return;
    }
    const req = route.request();
    const url = new URL(req.url());
    const body = req.postDataJSON() as Json;
    const query: Record<string, string> = {};
    url.searchParams.forEach((v, k) => {
      query[k] = v;
    });
    const headers: Record<string, string> = {};
    const allHeaders = await req.allHeaders();
    for (const [k, v] of Object.entries(allHeaders)) {
      if (typeof v === "string") headers[k.toLowerCase()] = v;
    }
    for (const { pattern, handler } of handlers) {
      if (pattern.test(url.pathname)) {
        const result = handler({ url, method: req.method(), body, query, headers });
        if (result) {
          await route.fulfill({
            status: result.status ?? 200,
            contentType: "application/json",
            body: JSON.stringify(result.body),
          });
          return;
        }
      }
    }
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "no_mock", message: `no mock for ${url.pathname}` }),
    });
  });
}
