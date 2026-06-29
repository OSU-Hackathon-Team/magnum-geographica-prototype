import VectorLayer from "ol/layer/Vector.js";
import VectorSource from "ol/source/Vector.js";
import { Feature } from "ol";
import { Point } from "ol/geom.js";
import { Style, Stroke, Fill, Circle, RegularShape } from "ol/style.js";
import { ANNOTATION_PIN_SIZE, annotationPinColor } from "../shared/styles.js";

export interface AnnotationData {
  type: string;
  value?: string | null;
  lon: number;
  lat: number;
}

function annotationStyle(data: AnnotationData): Style {
  const color = annotationPinColor(data.type);

  switch (data.type) {
    case "road_crossing":
      return new Style({
        image: new RegularShape({
          points: 4,
          radius: ANNOTATION_PIN_SIZE / 2,
          angle: Math.PI / 4,
          fill: new Fill({ color: "#eab308" }),
          stroke: new Stroke({ color: "#fff", width: 2 }),
        }),
      });
    case "pseudo_trail_start":
    case "pseudo_trail_end":
    case "trail_transition":
      return new Style({
        image: new Circle({
          radius: ANNOTATION_PIN_SIZE / 2,
          fill: new Fill({ color }),
          stroke: new Stroke({ color: "#fff", width: 2 }),
        }),
      });
    case "surface_change":
    default:
      return new Style({
        image: new Circle({
          radius: ANNOTATION_PIN_SIZE / 2,
          fill: new Fill({ color }),
          stroke: new Stroke({ color: "#fff", width: 2 }),
        }),
      });
  }
}

export function createAnnotationLayer(annotations: AnnotationData[]): VectorLayer {
  const features = annotations.map((a) => {
    const feat = new Feature({ geometry: new Point([a.lon, a.lat]) });
    feat.setStyle(annotationStyle(a));
    feat.setProperties({ annotationData: a });
    return feat;
  });
  return new VectorLayer({
    source: new VectorSource({ features }),
    zIndex: 1001,
  });
}
