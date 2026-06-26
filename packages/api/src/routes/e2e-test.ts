/**
 * Test-only routes. Only registered when `MAGNUM_E2E=1` is set in
 * the environment. These endpoints exist to support the Playwright
 * E2E suite against the real test database, replacing the bits of
 * the old in-process mock that aren't otherwise expressible
 * (creating users with elevated `role`/`trust_score`, resetting
 * the database between tests, seeding the canonical fixture data).
 *
 * **Never** enable this in production. It is gated by an env var
 * and excluded from the production route tree at boot.
 */
import { Hono } from "hono";
import { sql, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { signToken, signRefreshToken } from "../middleware/auth.js";
import { APP_TABLES } from "../db/e2e.js";
import { seedFixtures } from "../db/e2e-seed.js";
import { FIXTURE_IDS } from "../../../../tests/e2e/fixtures/ids.js";

export const e2eTestRoute = new Hono();

/**
 * Register a user with explicit `role` and `trust_score`. Production
 * `/api/auth/register` rejects these fields; the test endpoint is
 * the only way to seed admin/moderator users for moderator-gated
 * tests.
 */
e2eTestRoute.post("/register", async (c) => {
  if (process.env.MAGNUM_E2E !== "1") {
    return c.json({ error: "not_found" }, 404);
  }
  const body = (await c.req.json().catch(() => null)) as
    | {
        username?: string;
        email?: string;
        password?: string;
        role?: string;
        trust_score?: number;
      }
    | null;
  if (!body?.username || !body?.email || !body?.password) {
    return c.json({ error: "invalid_input", message: "username, email, password required" }, 400);
  }
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, body.email))
    .limit(1);
  if (existing.length > 0) {
    return c.json({ error: "conflict", message: "email already registered" }, 409);
  }
  const passwordHash = await Bun.password.hash(body.password);
  const role = body.role ?? "contributor";
  const trustScore = body.trust_score ?? 0;
  const [user] = await db
    .insert(users)
    .values({
      username: body.username,
      email: body.email,
      passwordHash,
      role,
      trustScore,
    })
    .returning();
  if (!user) {
    return c.json({ error: "internal", message: "failed to create user" }, 500);
  }
  const tier = trustScore >= 500 ? "moderator" : trustScore >= 50 ? "established" : "new";
  const accessToken = await signToken({
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    karma: trustScore,
    tier: tier as "new" | "established" | "trusted" | "moderator",
  });
  const refreshToken = await signRefreshToken(user.id);
  return c.json(
    {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 900,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        trust_score: trustScore,
        display_name: null,
        created_at: user.createdAt.toISOString(),
        updated_at: user.updatedAt.toISOString(),
      },
    },
    201,
  );
});

/**
 * Truncate all app tables.
 */
e2eTestRoute.post("/reset", async (c) => {
  if (process.env.MAGNUM_E2E !== "1") {
    return c.json({ error: "not_found" }, 404);
  }
  await db.execute(
    sql.raw(
      `TRUNCATE TABLE ${APP_TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`,
    ),
  );
  return c.json({ ok: true });
});

/**
 * Insert the canonical E2E fixtures (3 systems, 3 trails, 4
 * features, 3 segments, 23 presets, 2 users, 2 super-systems, 2
 * sub-systems, 2 traces). The test runner is plain Node and
 * can't run the password hasher, so seeding is delegated to the
 * API server (Bun).
 */
e2eTestRoute.post("/seed", async (c) => {
  if (process.env.MAGNUM_E2E !== "1") {
    return c.json({ error: "not_found" }, 404);
  }
  // Serialize seed calls per-database with a Postgres advisory
  // lock. Without this, two parallel tests in the same worker
  // both call `installApi()` in their `beforeEach`, both POST
  // `/api/__test/seed`, and race on the INSERT of the seed
  // users. The advisory lock makes one wait for the other; the
  // second then finds an empty database (the first truncated and
  // re-seeded) and proceeds cleanly.
  // Wrap in a transaction so pg_advisory_xact_lock is held for
  // the entire truncate+seed operation, not released after the
  // auto-committed SELECT statement.
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SELECT pg_advisory_xact_lock(727272)`));
    await tx.execute(
      sql.raw(
        `TRUNCATE TABLE ${APP_TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`,
      ),
    );
    const hash = (pwd: string) => Bun.password.hash(pwd);
    await seedFixtures(tx, FIXTURE_IDS, hash);
  });
  return c.json({ ok: true });
});

/**
 * Returns a one-line status payload so Playwright can poll the API
 * to know it's ready.
 */
e2eTestRoute.get("/health", async (c) => {
  if (process.env.MAGNUM_E2E !== "1") {
    return c.json({ error: "not_found" }, 404);
  }
  return c.json({ ok: true, mode: "e2e" });
});
