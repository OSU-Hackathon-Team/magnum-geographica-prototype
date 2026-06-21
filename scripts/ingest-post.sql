-- ingest-post.sql
-- After `osm2pgsql --output flex --style scripts/osm2pgsql.lua` populates the
-- middle tables, run this script to assemble geometry and insert into the
-- production schema. Apply with:
--   psql $DATABASE_URL -f scripts/ingest-post.sql
--
-- Depends on:
--   trail_ways_middle, system_relations_middle, feature_nodes_middle
--   planet_osm_ways, planet_osm_rels, planet_osm_nodes (created by osm2pgsql slim mode)

-- ===== TRAILS =====
INSERT INTO trails (id, name, slug, geometry, surface_type, difficulty, verified, created_at, updated_at)
SELECT
  gen_random_uuid(),
  COALESCE(m.name, '(unnamed ' || m.highway || ')'),
  regexp_replace(lower(regexp_replace(COALESCE(m.name, 'trail-' || m.osm_id), '[^a-zA-Z0-9]+', '-', 'g')), '-+$', ''),
  ST_Multi(ST_Transform(ST_LineMerge(w.geom), 4326)),
  m.surface,
  CASE
    WHEN m.sac_scale IN ('hiking') THEN 'easy'
    WHEN m.sac_scale IN ('mountain_hiking') THEN 'moderate'
    WHEN m.sac_scale IN ('demanding_mountain_hiking', 'alpine_hiking', 'difficult_alpine_hiking') THEN 'hard'
    ELSE NULL
  END,
  false,
  now(),
  now()
FROM trail_ways_middle m
JOIN planet_osm_ways w ON w.id = m.osm_id
WHERE ST_Length(ST_Transform(w.geom, 4326)::geography) > 50
ON CONFLICT (slug) DO NOTHING;

-- ===== SYSTEMS (protected areas + parks) =====
INSERT INTO systems (id, name, slug, boundary, ownership_source, source_date, created_at, updated_at)
SELECT
  gen_random_uuid(),
  COALESCE(m.name, '(unnamed area)'),
  regexp_replace(lower(regexp_replace(COALESCE(m.name, 'area-' || m.osm_id), '[^a-zA-Z0-9]+', '-', 'g')), '-+$', ''),
  ST_Multi(ST_Transform(ST_BuildArea(ST_Collect(w.linestring)), 4326)),
  CASE
    WHEN m.boundary = 'protected_area' THEN 'PAD-US / OSM'
    WHEN m.leisure = 'park' THEN 'OSM'
    ELSE 'OSM'
  END,
  CURRENT_DATE,
  now(),
  now()
FROM system_relations_middle m
JOIN planet_osm_rels r ON r.id = m.osm_id
JOIN planet_osm_ways w ON w.id = ANY(array(SELECT unnest(r.parts::bigint[])))
WHERE m.boundary = 'protected_area' OR m.leisure IN ('park', 'nature_reserve', 'forest', 'garden')
GROUP BY m.osm_id, m.name, m.boundary, m.leisure
ON CONFLICT (slug) DO NOTHING;

-- ===== FEATURES (selected POIs) =====
INSERT INTO features (id, name, type_tag, point, description, created_at, updated_at)
SELECT
  gen_random_uuid(),
  COALESCE(m.name, 'feature'),
  CASE
    WHEN m.tourism = 'picnic_site' OR m.amenity = 'parking' THEN 'parking'
    WHEN m.amenity = 'shelter' OR m.tourism = 'camp_site' THEN 'campground'
    WHEN m.natural = 'spring' OR m.amenity = 'drinking_water' THEN 'water_source'
    WHEN m.amenity = 'toilets' THEN 'restroom'
    WHEN m.tourism = 'viewpoint' OR m.natural = 'peak' THEN 'scenic_point'
    WHEN m.amenity = 'bench' OR m.historic = 'monument' THEN 'other'
    ELSE 'other'
  END,
  ST_SetSRID(n.geom, 4326),
  COALESCE(m.tourism, m.amenity, m.natural, m.historic),
  now(),
  now()
FROM feature_nodes_middle m
JOIN planet_osm_nodes n ON n.id = m.osm_id
WHERE m.tourism IS NOT NULL OR m.amenity IS NOT NULL OR m.natural IS NOT NULL OR m.historic IS NOT NULL
ON CONFLICT DO NOTHING;

-- ===== One initial segment per trail (so the segment-list view has something) =====
INSERT INTO trail_segments (trail_id, name, sort_order, surface_type, geometry, hazards, is_road_connector, steep_grade, one_way)
SELECT
  t.id,
  'Main segment',
  0,
  t.surface_type,
  t.geometry,
  '{}',
  false,
  false,
  false
FROM trails t
WHERE NOT EXISTS (
  SELECT 1 FROM trail_segments ts WHERE ts.trail_id = t.id
);
