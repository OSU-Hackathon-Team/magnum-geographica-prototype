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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
