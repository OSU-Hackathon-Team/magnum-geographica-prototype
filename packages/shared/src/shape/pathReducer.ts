import { type Shape, type ShapeRing } from "../types/index.js";

export type PathAction =
  | { type: "appendVertex"; lon: number; lat: number }
  | { type: "splitEdge"; ringIndex: number; after: number; lon: number; lat: number }
  | { type: "moveVertex"; ringIndex: number; vertexIndex: number; lon: number; lat: number }
  | { type: "deleteVertex"; ringIndex: number; vertexIndex: number }
  | { type: "startNewLine" };

export function pathReducer(path: Shape, action: PathAction): Shape {
  switch (action.type) {
    case "appendVertex":
      return appendVertex_(path, action.lon, action.lat);
    case "splitEdge":
      return splitEdge_(path, action.ringIndex, action.after, action.lon, action.lat);
    case "moveVertex":
      return moveVertex_(path, action.ringIndex, action.vertexIndex, action.lon, action.lat);
    case "deleteVertex":
      return deleteVertex_(path, action.ringIndex, action.vertexIndex);
    case "startNewLine":
      return { rings: [...deepCopyRings(path.rings), { vertices: [], closed: false }] };
  }
}

export function emptyPath(): Shape {
  return { rings: [{ vertices: [], closed: false }] };
}

export function lastOpenPathIndex(path: Shape): number {
  for (let i = path.rings.length - 1; i >= 0; i--) {
    if (!path.rings[i]!.closed) return i;
  }
  return -1;
}

function appendVertex_(path: Shape, lon: number, lat: number): Shape {
  const rings = deepCopyRings(path.rings);
  const target = lastOpenPathIndex({ rings });
  if (target < 0) {
    rings.push({ vertices: [[lon, lat]], closed: false });
  } else {
    const r = rings[target]!;
    rings[target] = { ...r, vertices: [...r.vertices, [lon, lat]] };
  }
  return { rings };
}

function splitEdge_(
  path: Shape,
  ringIndex: number,
  after: number,
  lon: number,
  lat: number,
): Shape {
  const ring = path.rings[ringIndex];
  if (!ring || ring.vertices.length < 2) return path;
  if (after < 0 || after >= ring.vertices.length - 1) return path;
  const verts = [...ring.vertices];
  verts.splice(after + 1, 0, [lon, lat]);
  const rings = path.rings.map((r, ri) =>
    ri === ringIndex ? { ...r, vertices: verts } : r,
  );
  return { rings };
}

function moveVertex_(
  path: Shape,
  ringIndex: number,
  vertexIndex: number,
  lon: number,
  lat: number,
): Shape {
  const ring = path.rings[ringIndex];
  if (!ring || vertexIndex < 0 || vertexIndex >= ring.vertices.length) return path;
  const rings = path.rings.map((r, ri) =>
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
  path: Shape,
  ringIndex: number,
  vertexIndex: number,
): Shape {
  const ring = path.rings[ringIndex];
  if (!ring || vertexIndex < 0 || vertexIndex >= ring.vertices.length) return path;
  const verts = ring.vertices.filter((_, vi) => vi !== vertexIndex);
  if (verts.length === 0) {
    const rings = path.rings.filter((_, ri) => ri !== ringIndex);
    if (rings.length === 0) return emptyPath();
    return { rings };
  }
  const rings = path.rings.map((r, ri) =>
    ri === ringIndex ? { vertices: verts, closed: false } : r,
  );
  return { rings };
}

function deepCopyRings(rings: ShapeRing[]): ShapeRing[] {
  return rings.map((r) => ({ ...r, vertices: [...r.vertices] }));
}
