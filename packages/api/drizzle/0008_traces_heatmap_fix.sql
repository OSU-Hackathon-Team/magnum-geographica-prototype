-- Fix traces_heatmap tile function.
--
-- Two bugs prevented the heatmap overlay from ever rendering:
--
--   1. `density` was passed as the 5th argument to ST_AsMVT, which is the
--      feature-ID column, not a property. The column was therefore stripped
--      from feature properties, so the client's feature.get("density") always
--      returned undefined and the style resolved to an empty Style (nothing
--      drawn). Drop the 5th argument so `density` stays a regular property.
--
--   2. The zoom-14 tile-range math used POWER(2, 14 - z - 3)::integer, which
--      truncates to 0 for z >= 12 and yielded BETWEEN 0 AND -1 (empty range),
--      so every tile at zoom 12-14 came back empty. Recompute the range with
--      floor()/ceil() on a float scale, which is correct for both z <= 11
--      (cell spans many zoom-14 tiles) and z >= 12 (cell sits inside one).

CREATE OR REPLACE FUNCTION traces_heatmap(
  z integer, x integer, y integer
)
RETURNS bytea
AS $$
  WITH bounds AS (
    SELECT ST_TileEnvelope(z, x, y) AS geom
  ),
  grid AS (
    SELECT
      gx, gy,
      ST_MakeEnvelope(
        ST_XMin(bounds.geom) + gx * (ST_XMax(bounds.geom) - ST_XMin(bounds.geom)) / 8.0,
        ST_YMin(bounds.geom) + gy * (ST_YMax(bounds.geom) - ST_YMin(bounds.geom)) / 8.0,
        ST_XMin(bounds.geom) + (gx + 1) * (ST_XMax(bounds.geom) - ST_XMin(bounds.geom)) / 8.0,
        ST_YMin(bounds.geom) + (gy + 1) * (ST_YMax(bounds.geom) - ST_YMin(bounds.geom)) / 8.0,
        3857
      ) AS cell_geom
    FROM bounds,
      generate_series(0, 7) AS gx,
      generate_series(0, 7) AS gy
  ),
  tile AS (
    SELECT
      g.cell_geom,
      COALESCE(SUM(h.trace_count), 0)::integer AS density
    FROM grid g
    LEFT JOIN trace_heatmap h ON
      h.zoom = 14
      AND h.tile_x BETWEEN floor((x * 8 + g.gx) * POWER(2::float8, 14 - z - 3))::integer
                       AND (ceil((x * 8 + g.gx + 1) * POWER(2::float8, 14 - z - 3)) - 1)::integer
      AND h.tile_y BETWEEN floor((y * 8 + g.gy) * POWER(2::float8, 14 - z - 3))::integer
                       AND (ceil((y * 8 + g.gy + 1) * POWER(2::float8, 14 - z - 3)) - 1)::integer
    GROUP BY g.cell_geom
    HAVING COALESCE(SUM(h.trace_count), 0) > 0
  )
  SELECT ST_AsMVT(tile, 'traces_heatmap', 4096, 'cell_geom')
  FROM tile;
$$ LANGUAGE sql STABLE PARALLEL SAFE;
