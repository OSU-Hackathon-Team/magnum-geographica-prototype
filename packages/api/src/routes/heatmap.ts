import { Hono } from "hono";
import { db } from "../db/index.js";
import { regenerateHeatmap } from "../services/heatmap.js";
import { adminOnly } from "../middleware/auth.js";

export const heatmapRoute = new Hono();

heatmapRoute.use("*", adminOnly());

/**
 * POST /api/admin/heatmap/regenerate
 * Admin-only. Truncates and regenerates the trace_heatmap summary table.
 * Returns the number of cells inserted and the duration in milliseconds.
 */
heatmapRoute.post("/regenerate", async (c) => {
  try {
    const result = await regenerateHeatmap(db);
    return c.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "regeneration failed";
    return c.json({ ok: false, error: msg }, 500);
  }
});
