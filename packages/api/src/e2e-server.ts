/**
 * E2E test API server.
 *
 * Boots the real Hono app on a localhost port with `DATABASE_URL`
 * pointing at the throwaway test Postgres (see
 * `docker/docker-compose.test.yml`). The server is started by
 * Playwright's `webServer` and serves all real API endpoints that
 * the web app calls during E2E.
 *
 * The `MAGNUM_E2E=1` flag additionally mounts `/api/__test/*`
 * helpers (see `routes/e2e-test.ts`) which provide:
 *   - elevated register (role/trust_score for admin/moderator tests)
 *   - POST /__test/reset (truncate all tables for clean per-test setup)
 *   - GET  /__test/health (readiness probe for Playwright)
 *
 * Run directly with: `bun run packages/api/src/e2e-server.ts`
 * The default port is 3000 (overridable via `E2E_API_PORT`).
 */
process.env.MAGNUM_E2E = "1";
process.env.NODE_ENV ??= "test";
process.env.JWT_SECRET ??= "e2e-secret-do-not-use-in-prod";
process.env.ADMIN_SECRET ??= "e2e-secret";
process.env.CORS_ORIGINS ??= "*";

import { Hono } from "hono";
import { corsMiddleware } from "./middleware/cors.js";
import { rateLimit } from "./middleware/rate-limit.js";
import { healthRoute } from "./routes/health.js";
import { systemsRoute } from "./routes/systems.js";
import { trailsRoute } from "./routes/trails.js";
import { searchRoute } from "./routes/search.js";
import { seedRoute } from "./routes/seed.js";
import { tilesRoute } from "./routes/tiles.js";
import { featuresRoute } from "./routes/features.js";
import { wikiRoute } from "./routes/wiki.js";
import { citationsRoute } from "./routes/citations.js";
import { revisionsRoute } from "./routes/revisions.js";
import { offlineRoute } from "./routes/offline.js";
import { syncRoute } from "./routes/sync.js";
import { mediaRoute } from "./routes/media.js";
import { segmentDetailRoute, trailSegmentsRoute } from "./routes/segments.js";
import { authRoute } from "./routes/auth.js";
import { usersRoute } from "./routes/users.js";
import { adminRoute } from "./routes/admin.js";
import { votesRoute } from "./routes/votes.js";
import { patrolRoute } from "./routes/patrol.js";
import { presetsRoute } from "./routes/presets.js";
import {
  superSystemsRoute,
  subSystemsRoute,
  systemMoveRoute,
  systemTreeRoute,
  systemContainsRoute,
} from "./routes/hierarchy.js";
import { tracesRoute, traceSegmentsRoute } from "./routes/traces.js";
import { synthesisRoute } from "./routes/synthesis.js";
import { e2eTestRoute } from "./routes/e2e-test.js";

const app = new Hono();

app.use("*", corsMiddleware({ origins: "*" }));
app.use("*", rateLimit({ max: 100_000, windowMs: 60_000 }));

app.route("/api/health", healthRoute);
app.route("/api/systems", systemsRoute);
app.route("/api/trails", trailsRoute);
app.route("/api/search", searchRoute);
app.route("/api/seed", seedRoute);
app.route("/api/tiles", tilesRoute);
app.route("/api/features", featuresRoute);
app.route("/api/wiki-pages", wikiRoute);
app.route("/api/citations", citationsRoute);
app.route("/api/revisions", revisionsRoute);
app.route("/api/offline-bbox", offlineRoute);
app.route("/api/sync", syncRoute);
app.route("/api/media", mediaRoute);
app.route("/api/segments", segmentDetailRoute);
app.route("/api/trails", trailSegmentsRoute);
app.route("/api/auth", authRoute);
app.route("/api/users", usersRoute);
app.route("/api/votes", votesRoute);
app.route("/api/admin/patrol", patrolRoute);
app.route("/api/presets", presetsRoute);
app.route("/api/super-systems", superSystemsRoute);
app.route("/api/sub-systems", subSystemsRoute);
app.route("/api/systems", systemMoveRoute);
app.route("/api/systems", systemTreeRoute);
app.route("/api/systems", systemContainsRoute);
app.route("/api/traces", tracesRoute);
app.route("/api/trace-segments", traceSegmentsRoute);
app.route("/api/admin", adminRoute);
app.route("/api", synthesisRoute);
app.route("/api/__test", e2eTestRoute);

app.get("/", (c) => c.json({ name: "magnum-api", mode: "e2e" }));

app.onError((err, c) => {
  console.error("[e2e-api] error:", err);
  return c.json(
    { error: "internal", message: err instanceof Error ? err.message : String(err) },
    500,
  );
});

const port = Number(process.env.E2E_API_PORT ?? 3000);
const host = process.env.E2E_API_HOST ?? "127.0.0.1";

const server = Bun.serve({
  port,
  hostname: host,
  fetch: app.fetch,
  // Keep idle connections short so SIGTERM is responsive.
  idleTimeout: 5,
});

console.log(`[e2e-api] starting on http://${host}:${port}`);
console.log(`[e2e-api] DATABASE_URL=${process.env.DATABASE_URL}`);

// Graceful shutdown on SIGTERM (Playwright sends this) and SIGINT
// (Ctrl-C when running the server directly). Without these, the
// event loop stays alive after the process is signalled and the
// shell hangs on exit. `process.exit(0)` is the only reliable way
// to break the loop; the explicit `server.stop(true)` makes the
// in-flight requests finish before we go.
let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[e2e-api] received ${signal}, shutting down...`);
  try {
    server.stop(true);
  } catch (e) {
    console.warn(`[e2e-api] server.stop error: ${(e as Error).message}`);
  }
  // Force-exit after a short grace period in case the event loop
  // is still busy (e.g. open Postgres connections).
  setTimeout(() => process.exit(0), 250).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Surface the handle for the global teardown to call directly if
// it wants — it currently just sends SIGTERM, which works.
export { server };
