import VectorLayer from "ol/layer/Vector.js";
import VectorSource from "ol/source/Vector.js";
import { Feature } from "ol";
import { Point } from "ol/geom.js";
import { Style, Stroke, Fill, Circle } from "ol/style.js";
import { BOUNDARY_HANDLE_RADIUS, BOUNDARY_HANDLE_STROKE } from "../shared/styles.js";

export interface BoundaryData {
  lon: number;
  lat: number;
  trail_id: string;
  sort_order: number;
}

export function createBoundaryHandleLayer(
  boundaries: BoundaryData[],
): VectorLayer {
  const features = boundaries.map((b) => {
    const feat = new Feature({
      geometry: new Point([b.lon, b.lat]),
      boundaryData: b,
    });
    feat.setStyle(
      new Style({
        image: new Circle({
          radius: BOUNDARY_HANDLE_RADIUS,
          fill: new Fill({ color: "#fff" }),
          stroke: new Stroke({
            color: "#3b82f6",
            width: BOUNDARY_HANDLE_STROKE,
          }),
        }),
      }),
    );
    return feat;
  });
  return new VectorLayer({
    source: new VectorSource({ features }),
    zIndex: 1002,
  });
}
