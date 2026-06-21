import { Hono } from "hono";
import { corsMiddleware } from "./middleware/cors.js";
import { healthRoute } from "./routes/health.js";
import { systemsRoute } from "./routes/systems.js";
import { trailsRoute } from "./routes/trails.js";
import { searchRoute } from "./routes/search.js";
import { seedRoute } from "./routes/seed.js";
import { tilesRoute } from "./routes/tiles.js";

const app = new Hono();

app.use("*", corsMiddleware());

app.route("/api/health", healthRoute);
app.route("/api/systems", systemsRoute);
app.route("/api/trails", trailsRoute);
app.route("/api/search", searchRoute);
app.route("/api/seed", seedRoute);
app.route("/api/tiles", tilesRoute);

app.get("/", (c) => c.json({ name: "magnum-api", version: "0.0.1" }));

app.notFound((c) =>
  c.json({ error: "not_found", message: `no route for ${c.req.method} ${c.req.path}` }, 404),
);

app.onError((err, c) => {
  console.error("api error:", err);
  return c.json({ error: "internal", message: err.message }, 500);
});

const port = Number(process.env.API_PORT ?? 3000);

export { app };
export default {
  port,
  fetch: app.fetch,
};

export type AppType = typeof app;
