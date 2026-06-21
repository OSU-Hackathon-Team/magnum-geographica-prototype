import VectorTileLayer from "ol/layer/VectorTile.js";
import VectorTileSource from "ol/source/VectorTile.js";
import MVT from "ol/format/MVT.js";
import { createXYZ } from "ol/tilegrid.js";
import { Style, Stroke, Fill } from "ol/style.js";
import { trailsTileUrl } from "../shared/config.js";
import { trailStrokeFor, TRAIL_STROKE_WIDTH } from "../shared/styles.js";
import type { MapConfig } from "../shared/config.js";

export function createTrailsLayer(config: MapConfig): VectorTileLayer | null {
  const url = trailsTileUrl(config);
  if (!url) return null;
  return new VectorTileLayer({
    source: new VectorTileSource({
      format: new MVT(),
      url,
      tileGrid: createXYZ(),
    }),
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
}

void Fill;
