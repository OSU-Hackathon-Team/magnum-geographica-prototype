import VectorLayer from "ol/layer/Vector.js";
import VectorSource from "ol/source/Vector.js";
import { Feature } from "ol";
import { LineString } from "ol/geom.js";
import { Style, Stroke } from "ol/style.js";
import {
  trailStrokeFor,
  TRAIL_STROKE_WIDTH,
  PSEUDO_TRAIL_LINE_WIDTH,
  PSEUDO_TRAIL_DASH,
  LOW_CONSENSUS_OPACITY,
} from "../shared/styles.js";

export interface SegmentData {
  coordinates: Array<[number, number]>;
  surface_type?: string | null;
  is_pseudo_trail?: boolean;
  is_road_connector?: boolean;
  source?: string | null;
  consensus?: number | null;
  sort_order: number;
}

function segmentStyle(data: SegmentData): Style[] {
  const surface = data.surface_type ?? "natural";
  const baseColor = trailStrokeFor(surface);
  const isLowConsensus = data.consensus != null && data.consensus < LOW_CONSENSUS_OPACITY;
  const opacity = isLowConsensus ? 0.4 : 1;

  const styles: Style[] = [];

  // Road connector gets dashed style
  if (data.is_road_connector) {
    styles.push(
      new Style({
        stroke: new Stroke({
          color: `#888888`,
          width: TRAIL_STROKE_WIDTH,
          lineDash: [10, 6],
        }),
      }),
    );
  } else {
    // Base surface-color stroke
    styles.push(
      new Style({
        stroke: new Stroke({
          color: withOpacity(baseColor, opacity),
          width: TRAIL_STROKE_WIDTH,
        }),
      }),
    );
  }

  // Pseudo-trail: thick dotted overlay on top of the base
  if (data.is_pseudo_trail) {
    styles.push(
      new Style({
        stroke: new Stroke({
          color: `#ef4444`,
          width: PSEUDO_TRAIL_LINE_WIDTH,
          lineDash: PSEUDO_TRAIL_DASH,
        }),
      }),
    );
  }

  return styles;
}

function withOpacity(hex: string, opacity: number): string {
  if (!hex.startsWith("#") || hex.length !== 7) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}

export function createSegmentsOverlayLayer(segments: SegmentData[]): VectorLayer {
  const features = segments.map((s) => {
    const feat = new Feature({ geometry: new LineString(s.coordinates) });
    feat.setStyle(segmentStyle(s));
    feat.setProperties({ segmentData: s });
    return feat;
  });
  return new VectorLayer({
    source: new VectorSource({ features }),
    zIndex: 1000,
  });
}
