import HeatmapLayer from "ol/layer/Heatmap.js";
import VectorSource from "ol/source/Vector.js";
import GeoJSON from "ol/format/GeoJSON.js";

export const HEATMAP_RADIUS = 22;
export const HEATMAP_BLUR = 18;

const GRADIENT = [
  "rgba(0,0,0,0)",
  "rgba(34,197,94,0.12)",
  "rgba(34,197,94,0.18)",
  "rgba(132,204,22,0.22)",
  "rgba(250,204,21,0.25)",
  "rgba(249,115,22,0.28)",
  "rgba(239,68,68,0.32)",
];

export const HEATMAP_LAYER_NAME = "traces_heatmap";

export function createTracesHeatmapLayer(apiUrl?: string): HeatmapLayer | null {
  if (!apiUrl) return null;
  const source = new VectorSource();
  const layer = new HeatmapLayer({
    source,
    radius: HEATMAP_RADIUS,
    blur: HEATMAP_BLUR,
    gradient: GRADIENT,
    weight: (feature) => {
      const w = Number(feature.get("weight"));
      return Number.isFinite(w) ? Math.max(0, Math.min(1, w)) : 0;
    },
  });
  layer.set("name", HEATMAP_LAYER_NAME);
  layer.setVisible(false);
  return layer;
}

export interface HeatmapLoadResult {
  points: number;
}

export async function loadHeatmapPoints(
  layer: HeatmapLayer,
  apiUrl: string,
  extent: [number, number, number, number],
  zoom: number,
  signal?: AbortSignal,
): Promise<HeatmapLoadResult> {
  const [minLon, minLat, maxLon, maxLat] = extent;
  const url = `${apiUrl}/api/traces/heat?bbox=${minLon},${minLat},${maxLon},${maxLat}&zoom=${Math.round(zoom)}`;

  const resp = await fetch(url, { signal });
  if (!resp.ok) {
    throw new Error(`heatmap request failed: ${resp.status}`);
  }
  const geojson = await resp.json();

  const source = layer.getSource() as VectorSource | null;
  if (!source) return { points: 0 };

  const features = new GeoJSON().readFeatures(geojson, {
    featureProjection: "EPSG:3857",
  });

  source.clear();
  source.addFeatures(features);
  return { points: features.length };
}
