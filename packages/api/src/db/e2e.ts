/**
 * E2E database constants and a DB pool for the test helpers.
 *
 * Lives in the API package so the workspace's `drizzle-orm`
 * resolution finds it. The actual seed/reset logic runs in the
 * API server (Bun) via the test endpoints — see
 * `routes/e2e-test.ts` — so the Playwright runner (Node) doesn't
 * have to import `drizzle-orm` at all.
 */
import {
  FIXTURE_IDS,
  FIXTURE_SLUGS,
} from "../../../../tests/e2e/fixtures/ids.js";

export { FIXTURE_IDS, FIXTURE_SLUGS };

export const APP_TABLES = [
  "trace_segment_votes",
  "gps_trace_segments",
  "trace_systems",
  "synthesis_runs",
  "gps_traces",
  "patrol_flags",
  "entity_protection",
  "entity_stats",
  "votes",
  "presets",
  "media",
  "citations",
  "revisions",
  "wiki_pages",
  "trail_segments",
  "trail_sub_systems",
  "trail_systems",
  "sub_systems",
  "system_super_systems",
  "super_systems",
  "features",
  "trails",
  "offline_packs",
  "systems",
  "users",
] as const;
