import BaseLayer from "ol/layer/Base.js";
import TileLayer from "ol/layer/Tile.js";
import VectorTileLayer from "ol/layer/VectorTile.js";
import XYZ from "ol/source/XYZ.js";
import VectorTileSource from "ol/source/VectorTile.js";
import MVT from "ol/format/MVT.js";
import { createXYZ } from "ol/tilegrid.js";
import { Fill, Stroke, Style } from "ol/style.js";
import type { BaseLayerDef } from "../shared/config.js";

const LANDUSE_FILL = "rgba(180, 200, 160, 0.55)";
const LANDUSE_FOREST_FILL = "rgba(150, 180, 130, 0.65)";
const LANDUSE_GRASS_FILL = "rgba(200, 215, 170, 0.55)";
const LANDUSE_WETLAND_FILL = "rgba(160, 190, 170, 0.55)";
const WATER_FILL = "rgba(170, 210, 230, 0.85)";
const ROAD_COLORS: Record<string, string> = {
  motorway: "#c8a26e",
  trunk: "#c8a26e",
  primary: "#b9b3a4",
  secondary: "#bcb6a8",
  tertiary: "#c2bcae",
};

function styleLanduse(): Style {
  return new Style({ fill: new Fill({ color: LANDUSE_FILL }) });
}

function styleWater(): Style {
  return new Style({ fill: new Fill({ color: WATER_FILL }) });
}

function styleRoad(highway: string | null | undefined): Style {
  const key = (highway ?? "").toLowerCase();
  const color = ROAD_COLORS[key] ?? "#c2bcae";
  const width =
    key === "motorway" || key === "trunk"
      ? 1.6
      : key === "primary"
        ? 1.3
        : 1.0;
  return new Style({ stroke: new Stroke({ color, width }) });
}

function styleMvtFeature(feature: { get: (k: string) => unknown }): Style {
  const layerName = String(feature.get("layer") ?? "");
  if (layerName === "water") return styleWater();
  if (layerName === "roads") {
    return styleRoad(String(feature.get("highway") ?? ""));
  }
  const landuse = String(feature.get("landuse") ?? "");
  const leisure = String(feature.get("leisure") ?? "");
  if (landuse === "forest" || leisure === "forest" || landuse === "wood") {
    return new Style({ fill: new Fill({ color: LANDUSE_FOREST_FILL }) });
  }
  if (landuse === "grass" || landuse === "meadow" || landuse === "grassland") {
    return new Style({ fill: new Fill({ color: LANDUSE_GRASS_FILL }) });
  }
  if (landuse === "wetland" || leisure === "nature_reserve") {
    return new Style({ fill: new Fill({ color: LANDUSE_WETLAND_FILL }) });
  }
  return styleLanduse();
}

export function createBaseLayer(def: BaseLayerDef): BaseLayer {
  if (def.kind === "raster") {
    const layer = new TileLayer({
      source: new XYZ({ url: def.url, crossOrigin: "anonymous" }),
      minZoom: def.minZoom,
      maxZoom: def.maxZoom,
    });
    if (def.attribution) {
      layer.set("attribution", def.attribution);
    }
    return layer;
  }
  const layer = new VectorTileLayer({
    source: new VectorTileSource({
      format: new MVT(),
      url: def.url,
      tileGrid: createXYZ(),
    }),
    minZoom: def.minZoom,
    maxZoom: def.maxZoom,
    style: styleMvtFeature as never,
  });
  if (def.attribution) {
    layer.set("attribution", def.attribution);
  }
  return layer;
}
