-- osm2pgsql.lua
-- Flex output mode mapping for Magnum.
-- Filters OSM ways/relations to trail-like geometries and systems, populates tables.
--
-- Run with:
--   osm2pgsql --create --slim --output flex --style scripts/osm2pgsql.lua \
--             --database "$DATABASE_URL" ohio-latest.osm.pbf
--
-- Populates:
--   trails        (ways with highway=path|footway|track|cycleway|bridleway|steps)
--   systems       (relations with boundary=protected_area, leisure=park|nature_reserve)
--   features      (nodes with tourism=* | amenity=* | natural=* | historic=* mapped to type_tag)
--
-- Geometry: ST_Multi(geometry, 4326)
-- Tags mapped:
--   highway=path      -> trails.surface_type = 'natural'
--   highway=footway   -> 'gravel' (typical)
--   highway=track     -> 'natural'
--   highway=cycleway  -> 'paved'
--   highway=bridleway -> 'natural'
--   highway=steps     -> 'paved'
--   sac_scale         -> difficulty
--   trail_visibility  -> difficulty hint
--   surface=*        -> overrides surface_type
--   boundary=protected_area + protect_class=* -> official=true

local trail_highways = {
  path = true,
  footway = true,
  track = true,
  cycleway = true,
  bridleway = true,
  steps = true,
}

local protected_boundaries = {
  protected_area = true,
}

local park_leisures = {
  park = true,
  nature_reserve = true,
  garden = true,
  forest = true,
}

local difficulty_map = {
  ["hiking"] = "easy",
  ["mountain_hiking"] = "moderate",
  ["demanding_mountain_hiking"] = "hard",
  ["alpine_hiking"] = "expert",
  ["difficult_alpine_hiking"] = "expert",
}

local default_surface_for_highway = {
  path = "natural",
  footway = "gravel",
  track = "natural",
  cycleway = "paved",
  bridleway = "natural",
  steps = "paved",
}

local function surface_from_tags(object)
  local surface = object:grab_tag("surface")
  if surface then return surface end
  return default_surface_for_highway[object:grab_tag("highway")] or "natural"
end

local function difficulty_from_tags(object)
  local sac = object:grab_tag("sac_scale")
  if sac and difficulty_map[sac] then return difficulty_map[sac] end
  return nil
end

-- ===== TRAILS (ways) =====
trail_ways = osm2pgsql.define_way_table({
  name = "trail_ways_middle",
  ids = { type = "way", id_column = "osm_id" },
  columns = {
    { column = "name",     type = "text" },
    { column = "highway",  type = "text" },
    { column = "surface",  type = "text" },
    { column = "sac_scale",type = "text" },
  },
})

function trail_ways:process_way(object)
  if not trail_highways[object:grab_tag("highway")] then return false end
  if object:is_closed() then return false end
  object:insert({
    name = object:grab_tag("name"),
    highway = object:grab_tag("highway"),
    surface = surface_from_tags(object),
    sac_scale = object:grab_tag("sac_scale"),
  })
  return true
end

-- ===== SYSTEMS (relations: protected_area, parks) =====
system_relations = osm2pgsql.define_relation_table({
  name = "system_relations_middle",
  ids = { type = "relation", id_column = "osm_id" },
  columns = {
    { column = "name",     type = "text" },
    { column = "leisure",  type = "text" },
    { column = "boundary", type = "text" },
    { column = "protect_class", type = "text" },
  },
})

function system_relations:process_relation(object)
  local boundary = object:grab_tag("boundary")
  local leisure = object:grab_tag("leisure")
  if not (protected_boundaries[boundary] or park_leisures[leisure]) then return false end
  if object:grab_tag("type") ~= "multipolygon" then return false end
  object:insert({
    name = object:grab_tag("name"),
    leisure = leisure,
    boundary = boundary,
    protect_class = object:grab_tag("protect_class"),
  })
  return true
end

-- ===== Final tables: insert via SQL in the post-processing stage =====
-- osm2pgsql flex output writes to *_middle tables; we then run a SQL script
-- (scripts/ingest-post.sql) to move them into the production tables with
-- geometry assembly and slug generation.

-- Define an "object" table we don't actually use, just to satisfy flex output mode.
-- The real work is in the SQL post-processing step.
osm2pgsql.define_node_table({
  name = "feature_nodes_middle",
  ids = { type = "node", id_column = "osm_id" },
  columns = {
    { column = "name",    type = "text" },
    { column = "tourism", type = "text" },
    { column = "amenity", type = "text" },
    { column = "natural", type = "text" },
    { column = "historic",type = "text" },
  },
})

function feature_nodes_middle:process_node(object)
  local kind = object:grab_tag("tourism") or object:grab_tag("amenity") or
               object:grab_tag("natural") or object:grab_tag("historic")
  if not kind then return false end
  object:insert({
    name = object:grab_tag("name") or kind,
    tourism = object:grab_tag("tourism"),
    amenity = object:grab_tag("amenity"),
    natural = object:grab_tag("natural"),
    historic = object:grab_tag("historic"),
  })
  return true
end
