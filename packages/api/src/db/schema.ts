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
    typeTag: text("type_tag").notNull(),
    point: point("point").notNull(),
    trailId: uuid("trail_id").references(() => trails.id, { onDelete: "set null" }),
    systemId: uuid("system_id").references(() => systems.id, { onDelete: "set null" }),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pointIdx: index("idx_features_point").using("gist", t.point),
    trailIdx: index("idx_features_trail").on(t.trailId),
    systemIdx: index("idx_features_system").on(t.systemId),
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
    wikiPageId: uuid("wiki_page_id")
      .notNull()
      .references(() => wikiPages.id, { onDelete: "cascade" }),
    contentMd: text("content_md").notNull(),
    contributorName: text("contributor_name").notNull().default("anonymous"),
    authorId: uuid("author_id"),
    editSummary: text("edit_summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pageIdx: index("idx_revisions_page").on(t.wikiPageId, t.createdAt),
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
export type Media = typeof media.$inferSelect;
export type OfflinePack = typeof offlinePacks.$inferSelect;
