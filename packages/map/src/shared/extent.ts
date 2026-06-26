/**
 * Extract the bounding extent [minLon, minLat, maxLon, maxLat] from a
 * GeoJSON geometry object. Returns null for unsupported types or
 * empty coordinate arrays.
 *
 * Supported types: Point, LineString, MultiLineString, Polygon, MultiPolygon.
 */
export function extentFromGeoJSON(geometry: unknown): [number, number, number, number] | null {
  if (!geometry || typeof geometry !== "object") return null;
  const g = geometry as { type?: string; coordinates?: unknown };
  if (!g.type || !g.coordinates) return null;

  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  function visit([lon, lat]: number[]) {
    if (typeof lon !== "number" || typeof lat !== "number") return;
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
  }

  function walk(coords: unknown): void {
    if (!Array.isArray(coords)) return;
    if (coords.length === 0) return;
    if (typeof coords[0] === "number" && coords.length >= 2) {
      visit(coords as number[]);
      return;
    }
    for (const child of coords) {
      walk(child);
    }
  }

  walk(g.coordinates);

  if (!Number.isFinite(minLon)) return null;
  return [minLon, minLat, maxLon, maxLat];
}
