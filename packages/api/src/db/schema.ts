import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  date,
  doublePrecision,
  integer,
  primaryKey,
  index,
  uniqueIndex,
  jsonb,
  customType,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const geometry = customType<{ data: string; driverData: string }>({
  dataType() {
    return "geometry(Geometry, 4326)";
  },
});

const multiPolygon = customType<{ data: string; driverData: string }>({
  dataType() {
    return "geometry(MultiPolygon, 4326)";
  },
});

const multiLineString = customType<{ data: string; driverData: string }>({
  dataType() {
    return "geometry(MultiLineString, 4326)";
  },
});

const point = customType<{ data: string; driverData: string }>({
  dataType() {
    return "geometry(Point, 4326)";
  },
});

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const superSystems = pgTable(
  "super_systems",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    official: boolean("official").notNull().default(true),
    boundary: multiPolygon("boundary"),
    description: text("description"),
    externalUrl: text("external_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    boundaryIdx: index("idx_super_systems_boundary").using("gist", t.boundary),
  }),
);

export const systems = pgTable(
  "systems",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    boundary: multiPolygon("boundary"),
    color: text("color").notNull().default("#22c55e"),
    ownershipSource: text("ownership_source"),
    sourceDate: date("source_date"),
    description: text("description"),
    externalUrl: text("external_url"),
    // §21.7 / §21.5 — system author for karma attribution.
    createdByUserId: uuid("created_by_user_id"),
    contributorName: text("contributor_name").notNull().default("anonymous"),
    hidden: boolean("hidden").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    boundaryIdx: index("idx_systems_boundary").using("gist", t.boundary),
  }),
);

export const systemSuperSystems = pgTable(
  "system_super_systems",
  {
    systemId: uuid("system_id")
      .notNull()
      .references(() => systems.id, { onDelete: "cascade" }),
    superSystemId: uuid("super_system_id")
      .notNull()
      .references(() => superSystems.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.systemId, t.superSystemId] }),
  }),
);

export const subSystems = pgTable("sub_systems", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  systemId: uuid("system_id")
    .notNull()
    .references(() => systems.id, { onDelete: "cascade" }),
  geometry: geometry("geometry"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const trails = pgTable(
  "trails",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    geometry: multiLineString("geometry"),
    description: text("description"),
    difficulty: text("difficulty"),
    lengthMeters: doublePrecision("length_meters"),
    elevationGainMeters: doublePrecision("elevation_gain_meters"),
    verified: boolean("verified").notNull().default(false),
    // §21.6 trail trust tier: premium (official import), elevated (frozen from
    // synthesized), or synthesized (built/maintained from GPS traces).
    tier: text("tier").notNull().default("synthesized"),
    // Trail creator — for karma attribution on upvotes.
    createdByUserId: uuid("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    geometryIdx: index("idx_trails_geometry").using("gist", t.geometry),
  }),
);

export const trailSystems = pgTable(
  "trail_systems",
  {
    trailId: uuid("trail_id")
      .notNull()
      .references(() => trails.id, { onDelete: "cascade" }),
    systemId: uuid("system_id")
      .notNull()
      .references(() => systems.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.trailId, t.systemId] }),
  }),
);

export const trailSubSystems = pgTable(
  "trail_sub_systems",
  {
    trailId: uuid("trail_id")
      .notNull()
      .references(() => trails.id, { onDelete: "cascade" }),
    subSystemId: uuid("sub_system_id")
      .notNull()
      .references(() => subSystems.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.trailId, t.subSystemId] }),
  }),
);

export const trailSegments = pgTable(
  "trail_segments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trailId: uuid("trail_id")
      .notNull()
      .references(() => trails.id, { onDelete: "cascade" }),
    name: text("name"),
    geometry: multiLineString("geometry").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    surfaceType: text("surface_type"),
    hazards: text("hazards")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    isRoadConnector: boolean("is_road_connector").notNull().default(false),
    steepGrade: boolean("steep_grade").notNull().default(false),
    oneWay: boolean("one_way").notNull().default(false),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    geometryIdx: index("idx_segments_geometry").using("gist", t.geometry),
    trailOrderIdx: index("idx_segments_trail").on(t.trailId, t.sortOrder),
  }),
);

export const features = pgTable(
  "features",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    // Legacy hardcoded tag — kept nullable for rows created under the
    // new preset system. The new code path is `presetId` + `answers`.
    typeTag: text("type_tag"),
    point: point("point").notNull(),
    // §21.4 — preset-based feature typing.
    presetId: uuid("preset_id").references(() => presets.id, { onDelete: "set null" }),
    answers: jsonb("answers"),
    trailId: uuid("trail_id").references(() => trails.id, { onDelete: "set null" }),
    systemId: uuid("system_id").references(() => systems.id, { onDelete: "set null" }),
    // §21.7 — feature author for karma attribution.
    createdByUserId: uuid("created_by_user_id"),
    contributorName: text("contributor_name").notNull().default("anonymous"),
    description: text("description"),
    hidden: boolean("hidden").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pointIdx: index("idx_features_point").using("gist", t.point),
    trailIdx: index("idx_features_trail").on(t.trailId),
    systemIdx: index("idx_features_system").on(t.systemId),
    presetIdx: index("idx_features_preset").on(t.presetId),
  }),
);

// ========== Presets (§21.4) ==========

export const presets = pgTable(
  "presets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull().unique(),
    label: text("label").notNull(),
    iconName: text("icon_name").notNull(),
    iconColor: text("icon_color").notNull().default("#22c55e"),
    category: text("category").notNull(),
    // OSM tag map for future upstreaming (Phase X). Stored as JSONB so
    // presets can carry nested tag values like {"shop": "bakery"}.
    osmTags: jsonb("osm_tags").notNull().default(sql`'{}'::jsonb`),
    // Up to 5 quick questions per the §21.4 spec. Shape:
    //   [{ key, type: "boolean"|"select", label, options?: [{value,label}] }]
    questions: jsonb("questions").notNull().default(sql`'[]'::jsonb`),
    upstreamable: boolean("upstreamable").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(100),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    categoryIdx: index("idx_presets_category").on(t.category, t.sortOrder),
  }),
);

export const wikiPages = pgTable(
  "wiki_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    title: text("title").notNull(),
    contentMd: text("content_md").notNull().default(""),
    renderedHtml: text("rendered_html").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    targetIdx: uniqueIndex("idx_wiki_pages_target").on(t.targetType, t.targetId),
  }),
);

export const citations = pgTable("citations", {
  id: uuid("id").primaryKey().defaultRandom(),
  wikiPageId: uuid("wiki_page_id")
    .notNull()
    .references(() => wikiPages.id, { onDelete: "cascade" }),
  url: text("url"),
  title: text("title").notNull(),
  imageData: bytea("image_data"),
  imageMimeType: text("image_mime_type"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const revisions = pgTable(
  "revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Legacy FK for wiki-page revisions. Kept as nullable so we can generalize
    // the table to cover any entity (system, preset, feature, trace, trail…).
    wikiPageId: uuid("wiki_page_id").references(() => wikiPages.id, { onDelete: "cascade" }),
    // Generalization (§21.8). Either wiki_page_id is set, or target_type/target_id is.
    targetType: text("target_type"),
    targetId: uuid("target_id"),
    action: text("action").notNull().default("update"),
    payloadBefore: jsonb("payload_before"),
    payloadAfter: jsonb("payload_after"),
    revertedFromId: uuid("reverted_from_id"),
    contentMd: text("content_md"),
    contributorName: text("contributor_name").notNull().default("anonymous"),
    authorId: uuid("author_id"),
    editSummary: text("edit_summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pageIdx: index("idx_revisions_page").on(t.wikiPageId, t.createdAt),
    targetIdx: index("idx_revisions_target").on(t.targetType, t.targetId, t.createdAt),
    authorIdx: index("idx_revisions_author").on(t.authorId, t.createdAt),
    actionIdx: index("idx_revisions_action").on(t.action, t.createdAt),
  }),
);

// ========== Karma / Votes (§21.7) ==========

export const votes = pgTable(
  "votes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    // null = anonymous vote (karma cannot be awarded for these in the
    // backward-compatible MVP path; counted for tally but not karma).
    userId: uuid("user_id"),
    value: integer("value").notNull(),
    voterKarma: doublePrecision("voter_karma").notNull().default(0),
    voterTier: text("voter_tier").notNull().default("new"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniq: uniqueIndex("idx_votes_user_target").on(t.targetType, t.targetId, t.userId),
    targetIdx: index("idx_votes_target").on(t.targetType, t.targetId),
    authorTargetIdx: index("idx_votes_author_target").on(t.userId, t.targetType, t.targetId),
  }),
);

// Cached score per target — avoids COUNT(*) per request.
export const entityStats = pgTable(
  "entity_stats",
  {
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    upvotes: integer("upvotes").notNull().default(0),
    downvotes: integer("downvotes").notNull().default(0),
    net: integer("net").notNull().default(0),
    hidden: boolean("hidden").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.targetType, t.targetId] }),
  }),
);

// ========== Protection (§21.8) ==========

export const entityProtection = pgTable(
  "entity_protection",
  {
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    level: text("level").notNull().default("normal"),
    upvotesAt: integer("upvotes_at").notNull().default(0),
    childrenAt: integer("children_at").notNull().default(0),
    reason: text("reason"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.targetType, t.targetId] }),
  }),
);

// ========== Patrol (§21.8) ==========

export const patrolFlags = pgTable(
  "patrol_flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    revisionId: uuid("revision_id").notNull(),
    reason: text("reason").notNull(),
    details: jsonb("details"),
    resolved: boolean("resolved").notNull().default(false),
    resolvedBy: uuid("resolved_by"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    resolvedIdx: index("idx_patrol_resolved").on(t.resolved, t.createdAt),
    revisionIdx: index("idx_patrol_revision").on(t.revisionId),
  }),
);

// ========== GPS traces (§21.6) ==========

export const gpsTraces = pgTable(
  "gps_traces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id"),
    contributorName: text("contributor_name").notNull().default("anonymous"),
    geometry: multiLineString("geometry").notNull(),
    source: text("source").notNull(),
    weight: doublePrecision("weight").notNull().default(1.0),
    upvotes: integer("upvotes").notNull().default(0),
    downvotes: integer("downvotes").notNull().default(0),
    status: text("status").notNull().default("active"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    geomIdx: index("idx_gps_traces_geom").using("gist", t.geometry),
    userIdx: index("idx_gps_traces_user").on(t.userId, t.createdAt),
    statusIdx: index("idx_gps_traces_status").on(t.status, t.createdAt),
  }),
);

// Auto-tagged by geometry ∩ system boundary. Many-to-many.
export const traceSystems = pgTable(
  "trace_systems",
  {
    traceId: uuid("trace_id")
      .notNull()
      .references(() => gpsTraces.id, { onDelete: "cascade" }),
    systemId: uuid("system_id")
      .notNull()
      .references(() => systems.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.traceId, t.systemId] }),
  }),
);

// Server-cut pieces of a trace.
export const gpsTraceSegments = pgTable(
  "gps_trace_segments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    traceId: uuid("trace_id")
      .notNull()
      .references(() => gpsTraces.id, { onDelete: "cascade" }),
    geometry: multiLineString("geometry").notNull(),
    clusterId: integer("cluster_id"),
    proposedTrailId: uuid("proposed_trail_id").references(() => trails.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    traceIdx: index("idx_segments_trace").on(t.traceId),
    clusterIdx: index("idx_segments_cluster").on(t.clusterId),
  }),
);

// §21.6 — wiki-style user marking of a segment → a trail.
export const traceSegmentVotes = pgTable(
  "trace_segment_votes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    segmentId: uuid("segment_id")
      .notNull()
      .references(() => gpsTraceSegments.id, { onDelete: "cascade" }),
    userId: uuid("user_id"),
    trailId: uuid("trail_id").references(() => trails.id, { onDelete: "set null" }),
    // vote = +1 (agrees), -1 (disagrees). NULL trailId + vote=-1 = "propose new".
    vote: integer("vote").notNull(),
    contributorName: text("contributor_name").notNull().default("anonymous"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniq: uniqueIndex("idx_segment_votes_user").on(t.segmentId, t.userId),
    segmentIdx: index("idx_segment_votes_segment").on(t.segmentId),
  }),
);

// §21.6 — audit/history of synthesis regeneration runs.
export const synthesisRuns = pgTable(
  "synthesis_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    systemId: uuid("system_id")
      .notNull()
      .references(() => systems.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    trailsUpdated: integer("trails_updated").notNull().default(0),
    trailsProposed: integer("trails_proposed").notNull().default(0),
    status: text("status").notNull().default("running"),
  },
  (t) => ({
    systemIdx: index("idx_synthesis_system").on(t.systemId, t.startedAt),
  }),
);

export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    featureId: uuid("feature_id").references(() => features.id, { onDelete: "cascade" }),
    trailId: uuid("trail_id").references(() => trails.id, { onDelete: "cascade" }),
    systemId: uuid("system_id").references(() => systems.id, { onDelete: "cascade" }),
    data: bytea("data").notNull(),
    mimeType: text("mime_type").notNull(),
    caption: text("caption"),
    width: integer("width"),
    height: integer("height"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    featureIdx: index("idx_media_feature").on(t.featureId),
    trailIdx: index("idx_media_trail").on(t.trailId),
    systemIdx: index("idx_media_system").on(t.systemId),
  }),
);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  displayName: text("display_name"),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("contributor"),
  trustScore: doublePrecision("trust_score").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const offlinePacks = pgTable("offline_packs", {
  id: uuid("id").primaryKey().defaultRandom(),
  systemId: uuid("system_id")
    .notNull()
    .references(() => systems.id, { onDelete: "cascade" }),
  mbtilesData: bytea("mbtiles_data"),
  geojsonData: bytea("geojson_data"),
  wikiData: text("wiki_data"),
  tileSizeBytes: integer("tile_size_bytes"),
  geojsonSizeBytes: integer("geojson_size_bytes"),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type SuperSystem = typeof superSystems.$inferSelect;
export type NewSuperSystem = typeof superSystems.$inferInsert;
export type System = typeof systems.$inferSelect;
export type NewSystem = typeof systems.$inferInsert;
export type SubSystem = typeof subSystems.$inferSelect;
export type Trail = typeof trails.$inferSelect;
export type NewTrail = typeof trails.$inferInsert;
export type TrailSegment = typeof trailSegments.$inferSelect;
export type Feature = typeof features.$inferSelect;
export type NewFeature = typeof features.$inferInsert;
export type WikiPage = typeof wikiPages.$inferSelect;
export type Citation = typeof citations.$inferSelect;
export type Revision = typeof revisions.$inferSelect;
export type NewRevision = typeof revisions.$inferInsert;
export type Media = typeof media.$inferSelect;
export type OfflinePack = typeof offlinePacks.$inferSelect;
export type Vote = typeof votes.$inferSelect;
export type NewVote = typeof votes.$inferInsert;
export type EntityStat = typeof entityStats.$inferSelect;
export type NewEntityStat = typeof entityStats.$inferInsert;
export type EntityProtection = typeof entityProtection.$inferSelect;
export type NewEntityProtection = typeof entityProtection.$inferInsert;
export type PatrolFlag = typeof patrolFlags.$inferSelect;
export type NewPatrolFlag = typeof patrolFlags.$inferInsert;
export type Preset = typeof presets.$inferSelect;
export type NewPreset = typeof presets.$inferInsert;
export type GpsTrace = typeof gpsTraces.$inferSelect;
export type NewGpsTrace = typeof gpsTraces.$inferInsert;
export type GpsTraceSegment = typeof gpsTraceSegments.$inferSelect;
export type NewGpsTraceSegment = typeof gpsTraceSegments.$inferInsert;
export type TraceSegmentVote = typeof traceSegmentVotes.$inferSelect;
export type NewTraceSegmentVote = typeof traceSegmentVotes.$inferInsert;
export type SynthesisRun = typeof synthesisRuns.$inferSelect;
export type NewSynthesisRun = typeof synthesisRuns.$inferInsert;
