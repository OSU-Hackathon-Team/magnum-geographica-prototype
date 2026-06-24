import { Hono } from "hono";
import { corsMiddleware } from "./middleware/cors.js";
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
import { metroProxy } from "./middleware/metro-proxy.js";

const app = new Hono();

app.use("*", corsMiddleware());

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

app.get("/", (c) => c.json({ name: "magnum-api", version: "0.0.1" }));

app.all("*", metroProxy());

app.onError((err, c) => {
  console.error("api error:", err);
  return c.json(
    { error: "internal", message: err instanceof Error ? err.message : String(err) },
    500,
  );
});

const port = Number(process.env.API_PORT ?? 3000);

export { app };
export default {
  port,
  fetch: app.fetch,
};

export type AppType = typeof app;
