import VectorTileLayer from "ol/layer/VectorTile.js";
import VectorTileSource from "ol/source/VectorTile.js";
import MVT from "ol/format/MVT.js";
import { createXYZ } from "ol/tilegrid.js";
import { Style, Stroke, Fill } from "ol/style.js";
import { trailsTileUrl } from "../shared/config.js";
import { trailStrokeFor, TRAIL_STROKE_WIDTH } from "../shared/styles.js";
import type { MapConfig } from "../shared/config.js";

export const TRAIL_MIN_ZOOM = 9;
export const TRAIL_MAX_ZOOM = 18;

export function createTrailsLayer(config: MapConfig): VectorTileLayer | null {
  const url = trailsTileUrl(config);
  if (!url) return null;
  const layer = new VectorTileLayer({
    source: new VectorTileSource({
      format: new MVT(),
      url,
      tileGrid: createXYZ(),
    }),
    minZoom: TRAIL_MIN_ZOOM,
    maxZoom: TRAIL_MAX_ZOOM,
    style: (feature) => {
      const surface = String(feature.get("surface_type") ?? "natural");
      return new Style({
        stroke: new Stroke({
          color: trailStrokeFor(surface),
          width: TRAIL_STROKE_WIDTH,
        }),
      });
    },
  });
  layer.set("name", "trails");
  return layer;
}

void Fill;
