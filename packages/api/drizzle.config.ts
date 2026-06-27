import { defineConfig } from "drizzle-kit";

// Only tables we own. Filtering here is what makes `drizzle-kit push` fast on
// a PostGIS-enabled database: without it, Drizzle introspects every table in
// every schema (pg_catalog has 64, the PostGIS `tiger` schema adds 34 more,
// plus `spatial_ref_sys` with 8500 SRID rows) and the diff takes minutes.
// With these filters it completes in seconds.
const APP_TABLES = [
  "super_systems",
  "systems",
  "system_super_systems",
  "sub_systems",
  "trails",
  "trail_systems",
  "trail_sub_systems",
  "trail_segments",
  "features",
  "wiki_pages",
  "citations",
  "revisions",
  "media",
  "offline_packs",
  "users",
  // §21.7 / §21.8
  "votes",
  "entity_stats",
  "entity_protection",
  "patrol_flags",
  // §21.4
  "presets",
  // §21.6
  "gps_traces",
  "trace_systems",
  "gps_trace_segments",
  "trace_segment_votes",
  "synthesis_runs",

] as const;

const databaseUrl =
  process.env.DATABASE_URL ??
  `postgres://${process.env.DB_USER ?? "magnum"}:${process.env.DB_PASSWORD ?? "changeme"}@${process.env.DB_HOST ?? "localhost"}:${process.env.DB_PORT ?? "5432"}/${process.env.DB_NAME ?? "magnum"}`;

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: databaseUrl },
  // Skip PostGIS system catalogs (`tiger`, `topology`, `spatial_ref_sys`,
  // `pg_catalog`, `information_schema`). Drizzle only manages the public
  // schema, and only the tables listed above.
  schemaFilter: ["public"],
  tablesFilter: [...APP_TABLES],
  strict: true,
  verbose: true,
});
