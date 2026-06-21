import TileLayer from "ol/layer/Tile.js";
import OSM from "ol/source/OSM.js";
import type { MapConfig } from "../shared/config.js";

export function createBaseLayer(config: MapConfig): TileLayer<OSM> {
  return new TileLayer({ source: new OSM({ url: config.baseTileUrl }) });
}
