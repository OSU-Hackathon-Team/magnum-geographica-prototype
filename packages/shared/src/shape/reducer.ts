import { type Shape, type ShapeRing } from "../types/index.js";

export type ShapeAction =
  | { type: "appendVertex"; lon: number; lat: number }
  | { type: "closeRing" }
  | { type: "splitEdge"; ringIndex: number; after: number; lon: number; lat: number }
  | { type: "moveVertex"; ringIndex: number; vertexIndex: number; lon: number; lat: number }
  | { type: "deleteVertex"; ringIndex: number; vertexIndex: number }
  | { type: "openEdge"; ringIndex: number; after: number };

export function shapeReducer(shape: Shape, action: ShapeAction): Shape {
  switch (action.type) {
    case "appendVertex":
      return appendVertex(shape, action.lon, action.lat);
    case "closeRing":
      return closeRing(shape);
    case "splitEdge":
      return splitEdge(shape, action.ringIndex, action.after, action.lon, action.lat);
    case "moveVertex":
      return moveVertex(shape, action.ringIndex, action.vertexIndex, action.lon, action.lat);
    case "deleteVertex":
      return deleteVertex_(shape, action.ringIndex, action.vertexIndex);
    case "openEdge":
      return openEdge_(shape, action.ringIndex, action.after);
  }
}

export function emptyShape(): Shape {
  return { rings: [{ vertices: [], closed: false }] };
}

export function lastOpenRingIndex(shape: Shape): number {
  for (let i = shape.rings.length - 1; i >= 0; i--) {
    if (!shape.rings[i]!.closed) return i;
  }
  return -1;
}

/**
 * Find the nearest point on a ring edge to a projected click point.
 * Returns the ring index + position to insert the new vertex at
 * (the edge from `insertAfter` to `insertAfter+1`).
 */
export function findNearestEdge(
  rings: ShapeRing[],
  lon: number,
  lat: number,
): { ringIndex: number; insertAfter: number } | null {
  let best: {
    ringIndex: number;
    insertAfter: number;
    distSq: number;
  } | null = null;
  for (let ri = 0; ri < rings.length; ri++) {
    const r = rings[ri]!;
    if (r.vertices.length < 2) continue;
    for (let i = 0; i < r.vertices.length - 1; i++) {
      const [aLon, aLat] = r.vertices[i]!;
      const [bLon, bLat] = r.vertices[i + 1]!;
      const dx = bLon - aLon;
      const dy = bLat - aLat;
      const lenSq = dx * dx + dy * dy;
      let t = 0;
      if (lenSq > 0) {
        t = ((lon - aLon) * dx + (lat - aLat) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
      }
      const projLon = aLon + t * dx;
      const projLat = aLat + t * dy;
      const ddx = lon - projLon;
      const ddy = lat - projLat;
      const distSq = ddx * ddx + ddy * ddy;
      if (best === null || distSq < best.distSq) {
        best = { ringIndex: ri, insertAfter: i, distSq };
      }
    }
  }
  return best ? { ringIndex: best.ringIndex, insertAfter: best.insertAfter } : null;
}

function appendVertex(shape: Shape, lon: number, lat: number): Shape {
  const rings = deepCopyRings(shape.rings);
  const target = lastOpenRingIndex({ rings });
  if (target < 0) {
    rings.push({ vertices: [[lon, lat]], closed: false });
  } else {
    const r = rings[target]!;
    rings[target] = { ...r, vertices: [...r.vertices, [lon, lat]] };
  }
  return { rings };
}

function closeRing(shape: Shape): Shape {
  const idx = lastOpenRingIndex(shape);
  if (idx < 0) return shape;
  const ring = shape.rings[idx];
  if (!ring || ring.vertices.length < 3) return shape;
  const rings = shape.rings.map((r, ri) =>
    ri === idx ? { ...r, vertices: [...r.vertices], closed: true } : r,
  );
  return { rings };
}

function splitEdge(
  shape: Shape,
  ringIndex: number,
  after: number,
  lon: number,
  lat: number,
): Shape {
  const ring = shape.rings[ringIndex];
  if (!ring || ring.vertices.length < 2) return shape;
  if (after < 0 || after >= ring.vertices.length - 1) return shape;
  const verts = [...ring.vertices];
  verts.splice(after + 1, 0, [lon, lat]);
  const rings = shape.rings.map((r, ri) =>
    ri === ringIndex ? { ...r, vertices: verts } : r,
  );
  return { rings };
}

function moveVertex(
  shape: Shape,
  ringIndex: number,
  vertexIndex: number,
  lon: number,
  lat: number,
): Shape {
  const ring = shape.rings[ringIndex];
  if (!ring || vertexIndex < 0 || vertexIndex >= ring.vertices.length) return shape;
  const rings = shape.rings.map((r, ri) =>
    ri !== ringIndex
      ? r
      : {
          ...r,
          vertices: r.vertices.map((v, vi) =>
            vi === vertexIndex ? ([lon, lat] as [number, number]) : v,
          ),
        },
  );
  return { rings };
}

function deleteVertex_(
  shape: Shape,
  ringIndex: number,
  vertexIndex: number,
): Shape {
  const ring = shape.rings[ringIndex];
  if (!ring || vertexIndex < 0 || vertexIndex >= ring.vertices.length) return shape;
  const verts = ring.vertices.filter((_, vi) => vi !== vertexIndex);
  if (verts.length === 0) {
    const rings = shape.rings.filter((_, ri) => ri !== ringIndex);
    if (rings.length === 0) return emptyShape();
    return { rings };
  }
  const closed = ring.closed && verts.length >= 3;
  const rings = shape.rings.map((r, ri) =>
    ri === ringIndex ? { vertices: verts, closed } : r,
  );
  return { rings };
}

function openEdge_(
  shape: Shape,
  ringIndex: number,
  after: number,
): Shape {
  const ring = shape.rings[ringIndex];
  if (!ring || ring.vertices.length < 2) return shape;
  if (after < 0 || after >= ring.vertices.length) return shape;
  if (!ring.closed && after >= ring.vertices.length - 1) return shape;

  if (ring.closed && after === ring.vertices.length - 1) {
    const rings = shape.rings.map((r, ri) =>
      ri === ringIndex ? { ...r, vertices: [...r.vertices], closed: false } : r,
    );
    return { rings };
  }

  const left = ring.vertices.slice(0, after + 1);
  const right = ring.vertices.slice(after + 1);

  const newRings: ShapeRing[] = [];
  for (let ri = 0; ri < shape.rings.length; ri++) {
    if (ri !== ringIndex) newRings.push(shape.rings[ri]!);
  }
  if (left.length >= 2) newRings.push({ vertices: left, closed: false });
  if (right.length >= 2) newRings.push({ vertices: right, closed: false });

  if (newRings.length === 0) return emptyShape();
  return { rings: newRings };
}

function deepCopyRings(rings: ShapeRing[]): ShapeRing[] {
  return rings.map((r) => ({ ...r, vertices: [...r.vertices] }));
}
