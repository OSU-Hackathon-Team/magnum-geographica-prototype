-- tilemaker-process.lua — Minimal OSM tag mapping for Magnum simplified basemap.
-- Uses tilemaker's implicit API: Find(), Holds(), Layer(), Attribute(), MinZoom()
-- operate on the current element in context (way_function, relation_function).

local road_minzoom = {
  motorway  = 4,
  trunk     = 5,
  primary   = 6,
  secondary = 7,
  tertiary  = 8,
}

local landuse_values = {
  forest   = true,
  grass    = true,
  meadow   = true,
  wetland  = true,
  wood     = true,
}
local leisure_values = {
  park           = true,
  nature_reserve = true,
  forest         = true,
}

-- ===== Nodes =====

function node_function()
  -- Skip all nodes — the simplified basemap has no labels.
end

-- ===== Ways =====

function way_function()
  local highway = Find("highway")
  if highway ~= "" and road_minzoom[highway] then
    Layer("roads", false)
    Attribute("highway", highway)
    MinZoom(road_minzoom[highway])
    return
  end

  local naturalTag = Find("natural")
  if naturalTag == "water" then
    Layer("water", true)
    Attribute("natural", "water")
    MinZoom(4)
    return
  end
  if naturalTag == "coastline" then
    Layer("water", false)
    Attribute("natural", "coastline")
    MinZoom(2)
    return
  end

  local waterway = Find("waterway")
  if waterway == "river" or waterway == "canal" then
    Layer("water", false)
    Attribute("waterway", waterway)
    MinZoom(5)
    return
  end

  local landuse = Find("landuse")
  local leisure = Find("leisure")
  if landuse_values[landuse] or landuse_values[naturalTag] then
    Layer("landuse", true)
    Attribute("landuse", landuse_values[landuse] and landuse or naturalTag)
    MinZoom(5)
    return
  end
  if leisure_values[leisure] then
    Layer("landuse", true)
    Attribute("leisure", leisure)
    MinZoom(5)
    return
  end
end

-- ===== Relations =====

function relation_scan_function()
  return false
end

function relation_function()
  local relType = Find("type")
  if relType ~= "multipolygon" then return end

  local naturalTag = Find("natural")
  if naturalTag == "water" then
    SetLayer("water", true)
    Attribute("natural", "water")
    return
  end

  local landuse = Find("landuse")
  local leisure = Find("leisure")
  if landuse_values[landuse] then
    SetLayer("landuse", true)
    Attribute("landuse", landuse)
    return
  end
  if leisure_values[leisure] then
    SetLayer("landuse", true)
    Attribute("leisure", leisure)
    return
  end
end
