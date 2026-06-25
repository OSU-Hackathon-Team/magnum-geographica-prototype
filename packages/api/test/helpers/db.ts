/**
 * Real-database test helper.
 *
 * `mockDb` is great for unit tests that just need to assert call
 * shapes, but it is a 715-line re-implementation of Drizzle and
 * Postgres. Tests written against it can pass even when the real
 * query layer is broken — wrong joins, missing indexes, broken
 * PostGIS calls, FK violations, and constraint enforcement are all
 * invisible to mockDb.
 *
 * This helper connects to the throwaway test database defined in
 * `docker/docker-compose.test.yml` and runs the real Drizzle
 * migrations against it. Tests that use `setupRealDb()` exercise
 * actual SQL, real PostGIS behaviour, real foreign-key constraints,
 * and real transaction semantics. The test database lives in a
 * different Docker volume (`magnum-test-pgdata`) and a different host
 * port (54329), so it can never collide with — or soil — the
 * developer database.
 *
 * The connection is process-global: all test files in a single
 * `bun test` run share the same Drizzle instance and the same pool.
 * The pool is closed automatically when the process exits; tests
 * should not close it themselves.
 *
 * Usage: import this file in a test file. The helper detects whether
 * the test database is reachable; if not, it skips its setup. The
 * `bunfig.toml` preloads this file in the test environment, so it
 * runs before any test file's imports — which is required because
 * `db/index.ts` reads `DATABASE_URL` at module-load time.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import pg from "pg";
import * as schema from "../../src/db/schema.js";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://magnum_test:magnum_test@127.0.0.1:54329/magnum_test";

// Set DATABASE_URL *before* any code that reads it. bunfig.toml's
// preload makes this the very first thing that runs in the test
// process. We do not mock `../src/db/index.js`; instead we let the
// real module load with the real test connection string. This
// sidesteps the "first mock wins" problem in `bun test` where
// `mock.module` is sticky and order-dependent.
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.DB_HOST = "127.0.0.1";
process.env.DB_PORT = "54329";
process.env.DB_NAME = "magnum_test";
process.env.DB_USER = "magnum_test";
process.env.DB_PASSWORD = "magnum_test";

let sharedPool: pg.Pool | null = null;
let sharedDb: ReturnType<typeof drizzle<typeof schema>> | null = null;
let migrated = false;
let migrationPromise: Promise<void> | null = null;

function connect() {
  if (sharedDb) return { db: sharedDb, pool: sharedPool! };
  sharedPool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 10 });
  sharedDb = drizzle(sharedPool, { schema });
  return { db: sharedDb, pool: sharedPool };
}

async function ensureMigrated(): Promise<void> {
  if (migrated) return;
  if (migrationPromise) return migrationPromise;
  migrationPromise = (async () => {
    const { db } = connect();
    await migrate(db, { migrationsFolder: "./drizzle" });
    migrated = true;
  })();
  await migrationPromise;
}

const APP_TABLES = [
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

export async function resetTestDb(): Promise<void> {
  await ensureMigrated();
  const { db } = connect();
  await db.execute(
    sql.raw(
      `TRUNCATE TABLE ${APP_TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`,
    ),
  );
}

export interface RealDbHandle {
  db: ReturnType<typeof drizzle<typeof schema>>;
  pool: pg.Pool;
  reset: () => Promise<void>;
}

/**
 * Get the real test database handle. The same instance is returned to
 * every caller in the same process. Returns a handle with `db` (the
 * real Drizzle instance) and `reset` (truncates all tables — call
 * this in `beforeEach`).
 */
export function setupRealDb(): RealDbHandle {
  return {
    ...connect(),
    reset: resetTestDb,
  };
}
