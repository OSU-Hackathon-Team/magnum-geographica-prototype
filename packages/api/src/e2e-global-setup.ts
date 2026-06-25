/**
 * Playwright globalSetup: shared setup that runs once before any
 * test worker starts.
 *
 * Lives in the API package so the workspace's `pg` and
 * `drizzle-orm` resolution finds it. The web app's tests live
 * in `tests/e2e/`, which has no `node_modules` of its own.
 *
 * Responsibilities:
 *   1. Ensure the throwaway test Postgres container is running.
 *   2. Create one database per worker (e.g. magnum_test_0, _1, …)
 *      and apply the Drizzle migrations to each. Per-worker
 *      databases are required because every test calls
 *      `installApi()` → `POST /api/__test/seed` which truncates
 *      and re-seeds; without isolation, parallel workers would
 *      stomp on each other.
 */
import { exec as nodeExec } from "node:child_process";
import { promisify } from "node:util";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const execAsync = promisify(nodeExec);

const ADMIN_DATABASE_URL =
  process.env.E2E_ADMIN_DATABASE_URL ??
  "postgres://magnum_test:magnum_test@127.0.0.1:54329/postgres";
const TEST_DB_BASE = process.env.E2E_TEST_DB_BASE ?? "magnum_test";
const TEST_USER = "magnum_test";
const TEST_PASSWORD = "magnum_test";
const TEST_HOST = "127.0.0.1";
const TEST_PORT = "54329";
const WORKER_COUNT = Number(process.env.TEST_WORKERS ?? 4);

async function ensureTestDb() {
  console.log("[playwright] ensuring test postgres is running...");
  try {
    await execAsync("docker compose -f docker/docker-compose.test.yml up -d", {
      cwd: process.cwd(),
    });
  } catch (e) {
    console.warn(
      "[playwright] docker compose up failed (continuing — assume db already running):",
      (e as Error).message,
    );
  }
  for (let i = 0; i < 30; i++) {
    try {
      await execAsync(
        "docker exec magnum-test-postgres pg_isready -U magnum_test -d magnum_test",
      );
      console.log("[playwright] test postgres is ready");
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error("test postgres did not become ready in 30s");
}

async function createDatabaseIfMissing(name: string): Promise<void> {
  const admin = new pg.Pool({ connectionString: ADMIN_DATABASE_URL });
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    console.log(`[playwright] created database ${name}`);
  } catch (e) {
    const err = e as pg.DatabaseError;
    if (err.code === "42P04") {
      // duplicate_database — already exists, fine.
    } else {
      throw e;
    }
  } finally {
    await admin.end();
  }
}

/**
 * Install the PostGIS extensions on a database. The init
 * script in `docker/init-db.sql` only runs on the first
 * database created from the image; per-worker databases we
 * create here need the extensions installed explicitly.
 */
async function installExtensions(database: string): Promise<void> {
  const url = `postgres://${TEST_USER}:${TEST_PASSWORD}@${TEST_HOST}:${TEST_PORT}/${database}`;
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  try {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS postgis;`);
    await pool.query(`CREATE EXTENSION IF NOT EXISTS postgis_topology;`);
    await pool.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
    await pool.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
  } finally {
    await pool.end();
  }
}

async function applyMigrations(database: string): Promise<void> {
  const url = `postgres://${TEST_USER}:${TEST_PASSWORD}@${TEST_HOST}:${TEST_PORT}/${database}`;
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  try {
    const db = drizzle(pool);
    // Walk up from this file to find the api package's
    // `drizzle/meta/_journal.json`. The same logic as in
    // `db/e2e.ts` so behaviour matches at runtime.
    const folder = await resolveMigrationsFolder();
    await migrate(db, { migrationsFolder: folder });
    console.log(`[playwright] migrations applied to ${database}`);
  } finally {
    await pool.end();
  }
}

let cachedMigrationsFolder: string | null = null;
async function resolveMigrationsFolder(): Promise<string> {
  if (cachedMigrationsFolder) return cachedMigrationsFolder;
  const { fileURLToPath } = await import("node:url");
  const path = await import("node:path");
  const fs = await import("node:fs");
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, "drizzle", "meta", "_journal.json");
    if (fs.existsSync(candidate)) {
      cachedMigrationsFolder = path.join(dir, "drizzle");
      return cachedMigrationsFolder;
    }
    dir = path.dirname(dir);
  }
  throw new Error("could not find packages/api/drizzle/migrations folder");
}

export default async function globalSetup() {
  await ensureTestDb();
  for (let i = 0; i < WORKER_COUNT; i++) {
    const name = `${TEST_DB_BASE}_${i}`;
    await createDatabaseIfMissing(name);
    await installExtensions(name);
    await applyMigrations(name);
  }
  console.log(
    `[playwright] sharded ${WORKER_COUNT} test databases (${TEST_DB_BASE}_0..${TEST_DB_BASE}_${WORKER_COUNT - 1})`,
  );
}
