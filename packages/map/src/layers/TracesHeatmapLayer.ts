import VectorTileLayer from "ol/layer/VectorTile.js";
import VectorTileSource from "ol/source/VectorTile.js";
import MVT from "ol/format/MVT.js";
import { createXYZ } from "ol/tilegrid.js";
import { Style, Stroke, Fill } from "ol/style.js";
import { tracesHeatmapTileUrl } from "../shared/config.js";
import type { MapConfig } from "../shared/config.js";

export const HEATMAP_MIN_ZOOM = 5;
export const HEATMAP_MAX_ZOOM = 14;

function densityColor(density: number): string {
  if (density <= 1) return "rgba(34,197,94,0.12)";
  if (density <= 2) return "rgba(34,197,94,0.22)";
  if (density <= 5) return "rgba(132,204,22,0.32)";
  if (density <= 10) return "rgba(250,204,21,0.42)";
  if (density <= 20) return "rgba(249,115,22,0.52)";
  if (density <= 50) return "rgba(239,68,68,0.58)";
  return "rgba(168,85,247,0.65)";
}

export function createTracesHeatmapLayer(config: MapConfig): VectorTileLayer | null {
  const url = tracesHeatmapTileUrl(config);
  if (!url) return null;
  const layer = new VectorTileLayer({
    source: new VectorTileSource({
      format: new MVT(),
      url,
      tileGrid: createXYZ(),
    }),
    minZoom: HEATMAP_MIN_ZOOM,
    maxZoom: HEATMAP_MAX_ZOOM,
    style: (feature) => {
      const density = Number(feature.get("density")) || 0;
      if (density <= 0) return new Style({});
      return new Style({
        fill: new Fill({ color: densityColor(density) }),
      });
    },
  });
  layer.set("name", "traces_heatmap");
  layer.setVisible(false);
  return layer;
}

void Stroke;
