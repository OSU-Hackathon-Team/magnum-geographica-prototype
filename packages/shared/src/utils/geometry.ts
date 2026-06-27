/**
 * Pure geometry utility functions usable in both the API and app.
 * Tests live in packages/shared/test/geometry.test.ts.
 */

/**
 * Haversine distance in meters between two WGS84 points.
 */
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Densify a polyline by inserting points at fixed meter intervals.
 */
export function densifyPolyline(
  pts: Array<{ lon: number; lat: number }>,
  intervalM: number,
): Array<{ lon: number; lat: number }> {
  if (pts.length < 2) return [...pts];
  const out: Array<{ lon: number; lat: number }> = [pts[0]!];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const d = haversineMeters(a.lat, a.lon, b.lat, b.lon);
    if (d < intervalM) {
      out.push(b);
      continue;
    }
    const steps = Math.ceil(d / intervalM);
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      out.push({
        lon: a.lon + (b.lon - a.lon) * t,
        lat: a.lat + (b.lat - a.lat) * t,
      });
    }
    out.push(b);
  }
  return out;
}

/**
 * Smooth a polyline with a moving average window.
 */
export function smoothPolyline(
  coords: Array<[number, number]>,
  window: number,
): Array<[number, number]> {
  if (coords.length < 2) return [...coords];
  const out: Array<[number, number]> = [];
  const n = coords.length;
  for (let i = 0; i < n; i++) {
    let sumLon = 0, sumLat = 0, count = 0;
    for (let j = Math.max(0, i - Math.floor(window / 2));
         j < Math.min(n, i + Math.floor(window / 2) + 1);
         j++) {
      const c = coords[j]!;
      sumLon += c[0];
      sumLat += c[1];
      count++;
    }
    out.push([sumLon / count, sumLat / count]);
  }
  return out;
}

/**
 * Douglas-Peucker simplification.
 */
export function simplifyPolyline(
  coords: Array<[number, number]>,
  epsilon: number,
): Array<[number, number]> {
  if (coords.length <= 2) return [...coords];

  let maxDist = 0;
  let maxIdx = 0;
  const first = coords[0]!;
  const last = coords[coords.length - 1]!;

  for (let i = 1; i < coords.length - 1; i++) {
    const d = pointToSegmentDistanceMeters(coords[i]!, first, last);
    if (d > maxDist) { maxDist = d; maxIdx = i; }
  }

  if (maxDist > epsilon) {
    const left = simplifyPolyline(coords.slice(0, maxIdx + 1), epsilon);
    const right = simplifyPolyline(coords.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}

/**
 * Perpendicular distance in meters from point p to line segment ab.
 * Uses haversine for the perpendicular but a cartesian approximation
 * for the projection parameter (valid for small distances).
 */
export function pointToSegmentDistanceMeters(
  p: [number, number],
  a: [number, number],
  b: [number, number],
): number {
  const dAB = haversineMeters(a[1], a[0], b[1], b[0]);
  if (dAB < 0.01) return haversineMeters(p[1], p[0], a[1], a[0]);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));
  const projX = a[0] + t * dx;
  const projY = a[1] + t * dy;
  return haversineMeters(p[1], p[0], projY, projX);
}

/**
 * Convert a GeoJSON LineString / MultiLineString to a WKT string.
 * Returns null for invalid/unrecognized input.
 */
export function geoJsonToWkt(geometry: unknown): string | null {
  if (!geometry || typeof geometry !== "object") return null;
  const g = geometry as { type?: string; coordinates?: unknown };

  if (g.type === "MultiLineString" && Array.isArray(g.coordinates)) {
    const lines = (g.coordinates as number[][][])
      .map((line) =>
        line.length >= 2 ? `(${line.map((p) => `${p[0]} ${p[1]}`).join(", ")})` : null,
      )
      .filter((s): s is string => s !== null);
    if (lines.length === 0) return null;
    return `MULTILINESTRING(${lines.join(", ")})`;
  }

  if (g.type === "LineString" && Array.isArray(g.coordinates)) {
    const pts = (g.coordinates as number[][]).map((p) => `${p[0]} ${p[1]}`).join(", ");
    if (!pts) return null;
    return `LINESTRING(${pts})`;
  }

  return null;
}

/**
 * Parse a WKT LINESTRING or MULTILINESTRING into an array of [lon, lat] points.
 * Returns empty array for unparseable input.
 */
export function parseWktLineString(wkt: string): Array<[number, number]> {
  const match = wkt.match(/\(([^)]+)\)/g);
  if (!match) return [];
  const points: Array<[number, number]> = [];
  for (const m of match) {
    const pairs = m.replace(/[()]/g, "").split(",");
    for (const pair of pairs) {
      const parts = pair.trim().split(/\s+/).map(Number);
      const lon = parts[0];
      const lat = parts[1];
      if (lon !== undefined && lat !== undefined && isFinite(lon) && isFinite(lat)) {
        points.push([lon, lat]);
      }
    }
  }
  return points;
}
