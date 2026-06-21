-- Magnum database initialization
-- Run by docker-entrypoint-initdb.d on first postgres boot

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- FTS indexes are created in Drizzle migrations (Phase 2+).

-- ========== MARTIN TILE FUNCTIONS ==========
-- These functions are auto-discovered by Martin tile server.
-- They produce vector tiles (MVT) from PostGIS geometries.
-- Exposed at: /trails/{z}/{x}/{y}, /segments/{z}/{x}/{y},
--              /systems/{z}/{x}/{y},  /features/{z}/{x}/{y}

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
      WHERE t.geometry && ST_Transform(bounds.geom, 4326)
    )
  SELECT ST_AsMVT(tile, 'trails', 4096, 'geometry')
  FROM tile;
$$ LANGUAGE sql STABLE PARALLEL SAFE;

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
        s.ownership_source,
        ST_AsMVTGeom(
          ST_Transform(ST_Centroid(s.boundary), 3857),
          bounds.geom,
          4096, 64, true
        ) AS geometry
      FROM systems s, bounds
      WHERE s.boundary && ST_Transform(bounds.geom, 4326)
    )
  SELECT ST_AsMVT(tile, 'systems', 4096, 'geometry')
  FROM tile;
$$ LANGUAGE sql STABLE PARALLEL SAFE;

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
