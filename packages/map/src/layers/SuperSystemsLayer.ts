import VectorTileLayer from "ol/layer/VectorTile.js";
import VectorTileSource from "ol/source/VectorTile.js";
import MVT from "ol/format/MVT.js";
import { createXYZ } from "ol/tilegrid.js";
import { Style, Stroke, Fill, Text } from "ol/style.js";
import { superSystemsTileUrl } from "../shared/config.js";
import { SUPER_SYSTEM_STROKE_WIDTH } from "../shared/styles.js";
import type { MapConfig } from "../shared/config.js";

export const SUPER_SYSTEM_MIN_ZOOM = 2;
export const SUPER_SYSTEM_MAX_ZOOM = 8;

export function createSuperSystemsLayer(config: MapConfig): VectorTileLayer | null {
  const url = superSystemsTileUrl(config);
  if (!url) return null;
  const layer = new VectorTileLayer({
    source: new VectorTileSource({
      format: new MVT(),
      url,
      tileGrid: createXYZ(),
    }),
    minZoom: SUPER_SYSTEM_MIN_ZOOM,
    maxZoom: SUPER_SYSTEM_MAX_ZOOM,
    style: (feature) => {
      const name = String(feature.get("name") ?? "");
      return new Style({
        stroke: new Stroke({
          color: "#8B8B8B",
          width: SUPER_SYSTEM_STROKE_WIDTH,
          lineDash: [8, 6],
        }),
        fill: new Fill({
          color: "rgba(128, 128, 128, 0.04)",
        }),
        text: new Text({
          text: name,
          font: "bold 13px system-ui, sans-serif",
          fill: new Fill({ color: "#666" }),
          stroke: new Stroke({ color: "#fff", width: 3 }),
          overflow: true,
        }),
      });
    },
  });
  layer.set("name", "super_systems");
  return layer;
}
