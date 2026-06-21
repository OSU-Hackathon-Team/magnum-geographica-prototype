import VectorTileLayer from "ol/layer/VectorTile.js";
import VectorTileSource from "ol/source/VectorTile.js";
import MVT from "ol/format/MVT.js";
import { createXYZ } from "ol/tilegrid.js";
import { Style, Stroke, Fill, Text } from "ol/style.js";
import { systemsTileUrl } from "../shared/config.js";
import { SYSTEM_FILL_OPACITY, SYSTEM_STROKE_WIDTH } from "../shared/styles.js";
import type { MapConfig } from "../shared/config.js";

export function createSystemsLayer(config: MapConfig): VectorTileLayer | null {
  const url = systemsTileUrl(config);
  if (!url) return null;
  const layer = new VectorTileLayer({
    source: new VectorTileSource({
      format: new MVT(),
      url,
      tileGrid: createXYZ(),
    }),
    style: (feature) => {
      const name = String(feature.get("name") ?? "");
      return new Style({
        stroke: new Stroke({
          color: "#22c55e",
          width: SYSTEM_STROKE_WIDTH,
        }),
        fill: new Fill({
          color: `rgba(34, 197, 94, ${SYSTEM_FILL_OPACITY})`,
        }),
        text: new Text({
          text: name,
          font: "12px system-ui, sans-serif",
          fill: new Fill({ color: "#111" }),
          stroke: new Stroke({ color: "#fff", width: 3 }),
        }),
      });
    },
  });
  layer.set("name", "systems");
  return layer;
}
