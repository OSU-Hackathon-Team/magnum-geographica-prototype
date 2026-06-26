/**
 * Shape editor layer. Renders an in-progress boundary shape (one or
 * more rings of [lon, lat] vertices). Closed rings are drawn as a
 * solid green stroke with translucent fill; open rings are drawn as
 * a dashed green line. Vertices are rendered as circles.
 *
 * This module's only job is to render the current state and to
 * expose hit-test helpers so the host can decide whether a click
 * landed on a vertex, an edge, or empty map.
 */
import VectorLayer from "ol/layer/Vector.js";
import VectorSource from "ol/source/Vector.js";
import Feature from "ol/Feature.js";
import Polygon from "ol/geom/Polygon.js";
import LineString from "ol/geom/LineString.js";
import Point from "ol/geom/Point.js";
import { Style, Stroke, Fill, Circle as CircleStyle } from "ol/style.js";
import { fromLonLat } from "ol/proj.js";
import type { Map } from "ol";

export const SHAPE_OPEN_RING_COLOR = "#22c55e";
export const SHAPE_OPEN_RING_FILL = "rgba(34, 197, 94, 0.15)";
export const SHAPE_VERTEX_COLOR = "#0f172a";
export const SHAPE_VERTEX_RADIUS = 8;

export interface ShapeRing {
  vertices: Array<[number, number]>;
  closed: boolean;
}

export interface ShapeLayerState {
  rings: ShapeRing[];
}

type Ring = Array<[number, number]>;
type PolygonCoords = Array<Ring>;

/**
 * Build a `MultiPolygon` coordinates array from the rings (the
 * format ol/geom/Polygon accepts). Closed rings are added as a
 * single closed ring; open rings are skipped (we draw them as
 * polylines separately).
 */
function closedRingsAsPolygons(rings: ShapeRing[]): PolygonCoords[] {
  const out: PolygonCoords[] = [];
  for (const r of rings) {
    if (r.closed && r.vertices.length >= 3) {
      const ring = r.vertices.map(([lon, lat]) =>
        fromLonLat([lon, lat]),
      ) as Ring;
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
        ring.push([first[0], first[1]]);
      }
      out.push([ring]);
    }
  }
  return out;
}

function openRingLine(r: ShapeRing): Ring {
  return r.vertices.map(([lon, lat]) => fromLonLat([lon, lat])) as Ring;
}

function allVertices(rings: ShapeRing[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const r of rings) for (const v of r.vertices) out.push(v);
  return out;
}

/**
 * Compute an opaque ID for a feature so the host can map an
 * `onShapeHit` back to a (ringIndex, vertexIndex) pair.
 */
function vid(s: string): string {
  return `shape-${s}`;
}

/**
 * Rebuild the layer's source from the Shape state. The host calls
 * this on every Shape change.
 */
export function rebuildShapeSource(
  source: VectorSource,
  state: ShapeLayerState,
): void {
  source.clear();

  // Closed rings → filled polygon.
  const polygons = closedRingsAsPolygons(state.rings);
  for (const coords of polygons) {
    const feat = new Feature({
      geometry: new Polygon(coords),
      shapeKind: "ring-fill",
    });
    feat.setId(vid("ring-fill"));
    source.addFeature(feat);
  }

  // Outlines (and the open last-ring polyline).
  for (let ri = 0; ri < state.rings.length; ri++) {
    const r = state.rings[ri]!;
    if (r.vertices.length < 2) continue;
    const coords = openRingLine(r);
    if (r.closed) coords.push(coords[0]!);
    const feat = new Feature({
      geometry: new LineString(coords),
      shapeKind: "ring-outline",
      ringIndex: ri,
    });
    feat.setId(vid(`r${ri}-outline`));
    source.addFeature(feat);

    // Vertex points for hit-testing.
    for (let vi = 0; vi < r.vertices.length; vi++) {
      const [lon, lat] = r.vertices[vi]!;
      const feat2 = new Feature({
        geometry: new Point(fromLonLat([lon, lat])),
        shapeKind: "vertex",
        ringIndex: ri,
        vertexIndex: vi,
      });
      feat2.setId(vid(`r${ri}-v${vi}`));
      source.addFeature(feat2);
    }
  }
}

export function createShapeLayer(): {
  layer: VectorLayer;
  source: VectorSource;
} {
  const source = new VectorSource();
  const layer = new VectorLayer({
    source,
    style: (feature) => {
      const kind = feature.get("shapeKind") as string | undefined;
      if (kind === "ring-fill") {
        return new Style({
          stroke: new Stroke({
            color: SHAPE_OPEN_RING_COLOR,
            width: 2,
          }),
          fill: new Fill({ color: SHAPE_OPEN_RING_FILL }),
        });
      }
      if (kind === "ring-outline") {
        return new Style({
          stroke: new Stroke({
            color: SHAPE_OPEN_RING_COLOR,
            width: 2,
            lineDash: [6, 4],
          }),
        });
      }
      if (kind === "vertex") {
        return new Style({
          image: new CircleStyle({
            radius: SHAPE_VERTEX_RADIUS,
            fill: new Fill({ color: SHAPE_VERTEX_COLOR }),
            stroke: new Stroke({ color: "#fff", width: 2 }),
          }),
        });
      }
      return undefined;
    },
  });
  layer.set("name", "shape-editor");
  layer.setZIndex(1000);

  return { layer, source };
}

/**
 * Hit-test the pixel under `pixel` (CSS pixels relative to the
 * map viewport). Vertex hits take priority over edge hits. The
 * returned `ringIndex` and `vertexIndex` are -1 when the click
 * landed on empty map.
 */
export type ShapeHit =
  | { kind: "empty" }
  | { kind: "vertex"; ringIndex: number; vertexIndex: number }
  | { kind: "edge"; ringIndex: number; vertexIndex: number };

export function shapeHitTest(
  map: Map,
  layer: VectorLayer,
  pixel: [number, number],
  vertexRadiusPx: number,
): ShapeHit {
  // Single pass: getFeaturesAtPixel with the larger vertex radius
  // catches vertices AND nearby edges. We prioritize vertices in
  // the iteration order, then fall back to edges.
  let features: ReturnType<typeof map.getFeaturesAtPixel> | undefined;
  try {
    features = map.getFeaturesAtPixel(pixel, {
      hitTolerance: Math.max(vertexRadiusPx, 8),
      layerFilter: (l) => l === layer,
    });
  } catch {
    // OL can throw when the map's renderer isn't set up yet
    // (e.g. during a re-render). Treat as no hit.
    return { kind: "empty" };
  }
  if (!features) return { kind: "empty" };
  // First pass: vertex.
  for (const f of features) {
    const kind = (f as { get: (k: string) => unknown }).get("shapeKind");
    if (kind === "vertex") {
      const ringIndex = Number((f as { get: (k: string) => unknown }).get("ringIndex") ?? -1);
      const vertexIndex = Number(
        (f as { get: (k: string) => unknown }).get("vertexIndex") ?? -1,
      );
      return { kind: "vertex", ringIndex, vertexIndex };
    }
  }
  // Second pass: edge.
  for (const f of features) {
    const kind = (f as { get: (k: string) => unknown }).get("shapeKind");
    if (kind === "ring-outline") {
      const ringIndex = Number((f as { get: (k: string) => unknown }).get("ringIndex") ?? -1);
      return { kind: "edge", ringIndex, vertexIndex: -1 };
    }
  }
  return { kind: "empty" };
}


