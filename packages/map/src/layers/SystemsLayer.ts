import VectorTileLayer from "ol/layer/VectorTile.js";
import VectorTileSource from "ol/source/VectorTile.js";
import MVT from "ol/format/MVT.js";
import { createXYZ } from "ol/tilegrid.js";
import { Style, Stroke, Fill, Text } from "ol/style.js";
import { systemsTileUrl } from "../shared/config.js";
import { SYSTEM_FILL_OPACITY, SYSTEM_STROKE_WIDTH } from "../shared/styles.js";
import type { MapConfig } from "../shared/config.js";

export const SYSTEM_MIN_ZOOM = 5;
export const SYSTEM_MAX_ZOOM = 12;

function hexToRgba(hex: string, opacity: number): string {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!match) return `rgba(34, 197, 94, ${opacity})`;
  const r = parseInt(match[1]!, 16);
  const g = parseInt(match[2]!, 16);
  const b = parseInt(match[3]!, 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export function createSystemsLayer(config: MapConfig): VectorTileLayer | null {
  const url = systemsTileUrl(config);
  if (!url) return null;
  const layer = new VectorTileLayer({
    source: new VectorTileSource({
      format: new MVT(),
      url,
      tileGrid: createXYZ(),
    }),
    minZoom: SYSTEM_MIN_ZOOM,
    maxZoom: SYSTEM_MAX_ZOOM,
    style: (feature) => {
      const name = String(feature.get("name") ?? "");
      const color = String(feature.get("color") ?? "#22c55e");
      return new Style({
        stroke: new Stroke({
          color,
          width: SYSTEM_STROKE_WIDTH,
        }),
        fill: new Fill({
          color: hexToRgba(color, SYSTEM_FILL_OPACITY),
        }),
        text: new Text({
          text: name,
          font: "bold 12px system-ui, sans-serif",
          fill: new Fill({ color: "#222" }),
          stroke: new Stroke({ color: "#fff", width: 3 }),
          overflow: true,
        }),
      });
    },
  });
  layer.set("name", "systems");
  return layer;
}
