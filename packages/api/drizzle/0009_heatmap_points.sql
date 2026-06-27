-- Replace the MVT-grid heatmap with a client-side canvas Heatmap layer.
-- The trace_heatmap summary table and the Martin traces_heatmap tile function
-- are no longer needed; the new GET /api/traces/heat endpoint densifies
-- trace geometry into GeoJSON points on demand.

DROP TABLE IF EXISTS "trace_heatmap";

DROP FUNCTION IF EXISTS traces_heatmap(integer, integer, integer);
