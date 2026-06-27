-- martin-tiles.sql
-- Vector tile functions consumed by Martin (https://maplibre.org/martin/).
-- Apply with: psql $DATABASE_URL -f docker/martin-tiles.sql
-- Then start Martin pointed at this DB. It will auto-discover these functions.

-- ========== SUPER SYSTEMS ==========
-- Exposed at: /super_systems/{z}/{x}/{y}
-- Dotted outline polygons visible at very low zoom levels (2-7).

CREATE OR REPLACE FUNCTION super_systems(
  z integer, x integer, y integer
)
RETURNS bytea
AS $$
  WITH bounds AS (
    SELECT ST_TileEnvelope(z, x, y) AS geom
  ),
    tile AS (
      SELECT
        ss.id,
        ss.name,
        ss.slug,
        ss.official,
        ST_AsMVTGeom(
          ST_Transform(ss.boundary, 3857),
          bounds.geom,
          4096, 64, true
        ) AS geometry
      FROM super_systems ss, bounds
      WHERE ss.boundary IS NOT NULL
        AND ss.boundary && ST_Transform(bounds.geom, 4326)
    )
  SELECT ST_AsMVT(tile, 'super_systems', 4096, 'geometry')
  FROM tile;
$$ LANGUAGE sql STABLE PARALLEL SAFE;

-- ========== SYSTEMS ==========
-- Exposed at: /systems/{z}/{x}/{y}
-- Semi-transparent filled polygons with name labels, visible at mid zoom (5-11).

CREATE OR REPLACE FUNCTION systems(
  z integer, x integer, y integer
)
RETURNS bytea
AS $$
  WITH bounds AS (
    SELECT ST_TileEnvelope(z, x, y) AS geom
  ),
    tile AS (
      SELECT
        s.id,
        s.name,
        s.slug,
        s.color,
        s.ownership_source,
        ST_AsMVTGeom(
          ST_Transform(s.boundary, 3857),
          bounds.geom,
          4096, 64, true
        ) AS geometry
      FROM systems s, bounds
      WHERE s.boundary IS NOT NULL
        AND s.boundary && ST_Transform(bounds.geom, 4326)
    )
  SELECT ST_AsMVT(tile, 'systems', 4096, 'geometry')
  FROM tile;
$$ LANGUAGE sql STABLE PARALLEL SAFE;

-- ========== TRAILS ==========
-- Exposed at: /trails/{z}/{x}/{y}
-- Colored lines visible at mid-high zoom (9+).

CREATE OR REPLACE FUNCTION trails(
  z integer, x integer, y integer
)
RETURNS bytea
AS $$
  WITH bounds AS (
    SELECT ST_TileEnvelope(z, x, y) AS geom
  ),
    tile AS (
      SELECT
        t.id,
        t.name,
        t.slug,
        t.difficulty,
        t.verified,
        t.length_meters::float8 AS length_m,
        COALESCE(
          (SELECT ts.surface_type FROM trail_segments ts
           WHERE ts.trail_id = t.id ORDER BY ts.sort_order LIMIT 1),
          'natural'
        ) AS surface_type,
        ST_AsMVTGeom(
          ST_Transform(t.geometry, 3857),
          bounds.geom,
          4096, 64, true
        ) AS geometry
      FROM trails t, bounds
      WHERE t.geometry IS NOT NULL
        AND t.geometry && ST_Transform(bounds.geom, 4326)
    )
  SELECT ST_AsMVT(tile, 'trails', 4096, 'geometry')
  FROM tile;
$$ LANGUAGE sql STABLE PARALLEL SAFE;

-- ========== TRAIL SEGMENTS ==========
-- Exposed at: /segments/{z}/{x}/{y}

CREATE OR REPLACE FUNCTION segments(
  z integer, x integer, y integer
)
RETURNS bytea
AS $$
  WITH bounds AS (
    SELECT ST_TileEnvelope(z, x, y) AS geom
  ),
    tile AS (
      SELECT
        s.id,
        s.trail_id,
        s.name,
        s.sort_order,
        s.surface_type,
        s.steep_grade,
        s.is_road_connector,
        s.one_way,
        s.hazards,
        ST_AsMVTGeom(
          ST_Transform(s.geometry, 3857),
          bounds.geom,
          4096, 64, true
        ) AS geometry
      FROM trail_segments s, bounds
      WHERE s.geometry && ST_Transform(bounds.geom, 4326)
    )
  SELECT ST_AsMVT(tile, 'segments', 4096, 'geometry')
  FROM tile;
$$ LANGUAGE sql STABLE PARALLEL SAFE;

-- ========== TRACE HEATMAP ==========
-- Exposed at: /traces_heatmap/{z}/{x}/{y}
-- Grid-based density overlay. Queries the trace_heatmap summary table
-- which stores tile-level counts at zoom 14. The function subdivides
-- each requested tile into an 8x8 grid and aggregates counts from the
-- zoom-14 base level. Only cells with density > 0 are returned.

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
      (x * 8 + gx)::integer AS cell_x,
      (y * 8 + gy)::integer AS cell_y,
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
      AND h.tile_x BETWEEN (x * 8 + g.gx) * POWER(2, 14 - z - 3)::integer
                       AND (x * 8 + g.gx + 1) * POWER(2, 14 - z - 3)::integer - 1
      AND h.tile_y BETWEEN (y * 8 + g.gy) * POWER(2, 14 - z - 3)::integer
                       AND (y * 8 + g.gy + 1) * POWER(2, 14 - z - 3)::integer - 1
    GROUP BY g.cell_x, g.cell_y, g.cell_geom
    HAVING COALESCE(SUM(h.trace_count), 0) > 0
  )
  SELECT ST_AsMVT(tile, 'traces_heatmap', 4096, 'cell_geom', 'density')
  FROM tile;
$$ LANGUAGE sql STABLE PARALLEL SAFE;

-- ========== FEATURES ==========
-- Exposed at: /features/{z}/{x}/{y}
-- Point markers visible at high zoom (12+).

CREATE OR REPLACE FUNCTION features(
  z integer, x integer, y integer
)
RETURNS bytea
AS $$
  WITH bounds AS (
    SELECT ST_TileEnvelope(z, x, y) AS geom
  ),
    tile AS (
      SELECT
        f.id,
        f.name,
        f.type_tag,
        f.trail_id,
        f.system_id,
        f.description,
        ST_AsMVTGeom(
          ST_Transform(f.point, 3857),
          bounds.geom,
          4096, 8, true
        ) AS geometry
      FROM features f, bounds
      WHERE f.point && ST_Transform(bounds.geom, 4326)
    )
  SELECT ST_AsMVT(tile, 'features', 4096, 'geometry')
  FROM tile;
$$ LANGUAGE sql STABLE PARALLEL SAFE;

-- ========== BASEMAP ==========
-- Exposed at: /basemap/{z}/{x}/{y}
-- Served from a pre-generated MBTiles file produced by:
--   scripts/build-simplified-basemap.sh
-- The script runs tilemaker against an OSM PBF extract and outputs a compact
-- .mbtiles file containing landuse, water, and roads layers at zooms z2-z12.
-- Martin auto-discovers .mbtiles files mounted into its container.
-- When the basemap MBTiles is not present, the satellite layer still works;
-- generate the basemap with:  ./scripts/build-simplified-basemap.sh ohio
