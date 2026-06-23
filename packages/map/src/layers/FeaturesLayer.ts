import VectorTileLayer from "ol/layer/VectorTile.js";
import VectorTileSource from "ol/source/VectorTile.js";
import MVT from "ol/format/MVT.js";
import { createXYZ } from "ol/tilegrid.js";
import { Style, Stroke, Circle as CircleStyle, Fill, Text } from "ol/style.js";
import { featuresTileUrl } from "../shared/config.js";
import { featureLabelFor, FEATURE_ICON_SIZE } from "../shared/styles.js";
import type { MapConfig } from "../shared/config.js";

export const FEATURE_MIN_ZOOM = 12;
export const FEATURE_MAX_ZOOM = 18;

export function createFeaturesLayer(config: MapConfig): VectorTileLayer | null {
  const url = featuresTileUrl(config);
  if (!url) return null;
  const layer = new VectorTileLayer({
    source: new VectorTileSource({
      format: new MVT(),
      url,
      tileGrid: createXYZ(),
    }),
    minZoom: FEATURE_MIN_ZOOM,
    maxZoom: FEATURE_MAX_ZOOM,
    style: (feature) => {
      const typeTag = String(feature.get("type_tag") ?? "other");
      return new Style({
        image: new CircleStyle({
          radius: FEATURE_ICON_SIZE,
          fill: new Fill({ color: "#ffffff" }),
          stroke: new Stroke({ color: "#22c55e", width: 2 }),
        }),
        text: new Text({
          text: featureLabelFor(typeTag),
          font: "bold 11px system-ui, sans-serif",
          fill: new Fill({ color: "#22c55e" }),
        }),
      });
    },
  });
  layer.set("name", "features");
  return layer;
}
