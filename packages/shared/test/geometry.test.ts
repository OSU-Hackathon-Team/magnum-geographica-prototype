import { describe, test, expect } from "bun:test";
import {
  haversineMeters,
  densifyPolyline,
  smoothPolyline,
  simplifyPolyline,
  pointToSegmentDistanceMeters,
  geoJsonToWkt,
  parseWktLineString,
} from "../src/index.js";

describe("haversineMeters", () => {
  test("returns 0 for the same point", () => {
    expect(haversineMeters(39.0, -82.0, 39.0, -82.0)).toBeCloseTo(0, 1);
  });

  test("~111 km per degree longitude at equator", () => {
    const d = haversineMeters(0, 0, 0, 1);
    expect(d).toBeCloseTo(111195, -2); // ~111km
  });

  test("symmetric: a→b equals b→a", () => {
    const a = haversineMeters(39.0, -82.0, 40.0, -83.0);
    const b = haversineMeters(40.0, -83.0, 39.0, -82.0);
    expect(a).toBeCloseTo(b, 5);
  });

  test("antipodal points ~20,015 km", () => {
    const d = haversineMeters(0, 0, 0, 180);
    expect(d).toBeCloseTo(20015086, -1);
  });

  test("typical trail distance in Ohio", () => {
    // Hocking Hills: ~20 km between two points
    const d = haversineMeters(39.4, -82.5, 39.5, -82.3);
    expect(d).toBeGreaterThan(15000);
    expect(d).toBeLessThan(25000);
  });
});

describe("densifyPolyline", () => {
  test("returns copy for empty array", () => {
    const result = densifyPolyline([], 5);
    expect(result).toEqual([]);
  });

  test("returns copy for single point", () => {
    const result = densifyPolyline([{ lon: 0, lat: 0 }], 5);
    expect(result).toEqual([{ lon: 0, lat: 0 }]);
  });

  test("does not add points when interval > segment length", () => {
    const pts = [{ lon: 0, lat: 0 }, { lon: 0.001, lat: 0.001 }];
    const result = densifyPolyline(pts, 500);
    // The segment is short (~157m) and interval is 500m, so no interpolation
    expect(result.length).toBe(2);
  });

  test("inserts intermediate points on a long segment", () => {
    // ~111km segment, 5m interval → ~22200 points (too many to check exact count)
    // Use a smaller test case
    const pts = [{ lon: 0, lat: 0 }, { lon: 0.1, lat: 0 }];
    // This is roughly 11119 meters. With interval of 5000m, expect ~3 points
    const result = densifyPolyline(pts, 5000);
    expect(result.length).toBeGreaterThan(2);
    // First and last should be the original endpoints
    expect(result[0]!).toEqual({ lon: 0, lat: 0 });
  });

  test("all intermediate points lie between endpoints", () => {
    const pts = [{ lon: 0, lat: 0 }, { lon: 1, lat: 1 }];
    const result = densifyPolyline(pts, 20000);
    for (const p of result) {
      expect(p.lon).toBeGreaterThanOrEqual(0);
      expect(p.lon).toBeLessThanOrEqual(1);
      expect(p.lat).toBeGreaterThanOrEqual(0);
      expect(p.lat).toBeLessThanOrEqual(1);
    }
  });

  test("interval much larger than segment → just endpoints", () => {
    const pts = [{ lon: 0, lat: 0 }, { lon: 0.0001, lat: 0 }];
    const result = densifyPolyline(pts, 1000);
    expect(result.length).toBe(2);
  });
});

describe("smoothPolyline", () => {
  test("window=1 returns identical coords", () => {
    const coords: [number, number][] = [[0, 0], [1, 0], [2, 0]];
    const result = smoothPolyline(coords, 1);
    expect(result).toEqual(coords);
  });

  test("window=3 averages adjacent points", () => {
    const coords: [number, number][] = [[0, 0], [2, 0], [4, 0]];
    const result = smoothPolyline(coords, 3);
    // Middle point should be average of all 3
    expect(result[1]![0]).toBeCloseTo(2, 5);
    // Endpoints use partial window: first = avg(0,2) = 1, last = avg(2,4) = 3
    expect(result[0]![0]).toBeCloseTo(1, 5);
    expect(result[2]![0]).toBeCloseTo(3, 5);
  });

  test("preserves single-point polyline", () => {
    const coords: [number, number][] = [[0, 0]];
    const result = smoothPolyline(coords, 3);
    expect(result).toEqual(coords);
  });

  test("endpoints use partial window", () => {
    const coords: [number, number][] = [[0, 0], [1, 0], [2, 0], [3, 0]];
    const result = smoothPolyline(coords, 3);
    // First: avg(0,1) = 0.5
    expect(result[0]![0]).toBeCloseTo(0.5, 5);
    // Last: avg(2,3) = 2.5
    expect(result[3]![0]).toBeCloseTo(2.5, 5);
  });
});

describe("simplifyPolyline", () => {
  test("returns copy for 2-point polyline", () => {
    const coords: [number, number][] = [[0, 0], [1, 0]];
    const result = simplifyPolyline(coords, 1);
    expect(result).toEqual(coords);
  });

  test("removes collinear midpoints", () => {
    const coords: [number, number][] = [[0, 0], [0.5, 0], [1, 0]];
    const result = simplifyPolyline(coords, 0.1);
    // The mid point is collinear → removed
    expect(result.length).toBe(2);
    expect(result[0]).toEqual([0, 0]);
    expect(result[1]).toEqual([1, 0]);
  });

  test("retains point above epsilon", () => {
    // A zigzag with a strong bend should retain the bend
    const coords: [number, number][] = [[0, 0], [0.5, 0.1], [1, 0]];
    const result = simplifyPolyline(coords, 0.001);
    expect(result.length).toBe(3);
  });

  test("drops point below epsilon", () => {
    // Slight deviation of ~5m at the equator from a 0.1-degree baseline
    // The perpendicular distance should be very small (< 1m) since 0.1deg ≈ 11km
    const coords: [number, number][] = [[0, 0], [0.05, 0.00001], [0.1, 0]];
    const result = simplifyPolyline(coords, 10);
    expect(result.length).toBe(2);
  });

  test("epsilon=0 retains all points (no simplification)", () => {
    const coords: [number, number][] = [[0, 0], [0.5, 0.1], [1, 0], [1.5, 0.2]];
    const result = simplifyPolyline(coords, 0);
    expect(result.length).toBe(4);
  });

  test("zigzag retains all points at low epsilon", () => {
    const coords: [number, number][] = [[0, 0], [0, 1], [1, 1], [1, 0]];
    const result = simplifyPolyline(coords, 0.01);
    // All points should be retained (strong zigzag)
    expect(result.length).toBe(4);
  });
});

describe("pointToSegmentDistanceMeters", () => {
  test("point on segment returns 0", () => {
    const d = pointToSegmentDistanceMeters([0.5, 0], [0, 0], [1, 0]);
    expect(d).toBeLessThan(1);
  });

  test("point perpendicular to midpoint", () => {
    // A point ~1km north of a 1km segment → should be ~1000m
    const d = pointToSegmentDistanceMeters([0.005, 0.01], [0, 0], [0.01, 0]);
    expect(d).toBeGreaterThan(500);
    expect(d).toBeLessThan(2000);
  });

  test("point beyond endpoint → distance to nearest endpoint", () => {
    const d = pointToSegmentDistanceMeters([2, 0], [0, 0], [1, 0]);
    expect(d).toBeGreaterThan(111000);
  });

  test("degenerate segment (same start/end) → point-to-point distance", () => {
    const d = pointToSegmentDistanceMeters([1, 0], [0, 0], [0, 0]);
    const direct = haversineMeters(0, 1, 0, 0);
    expect(d).toBeCloseTo(direct, 1);
  });
});

describe("geoJsonToWkt", () => {
  test("converts LineString to WKT", () => {
    const result = geoJsonToWkt({
      type: "LineString",
      coordinates: [[0, 0], [1, 1]],
    });
    expect(result).toBe("LINESTRING(0 0, 1 1)");
  });

  test("converts MultiLineString to WKT", () => {
    const result = geoJsonToWkt({
      type: "MultiLineString",
      coordinates: [
        [[0, 0], [1, 1]],
        [[2, 2], [3, 3]],
      ],
    });
    expect(result).toBe("MULTILINESTRING((0 0, 1 1), (2 2, 3 3))");
  });

  test("returns null for unknown type", () => {
    expect(geoJsonToWkt({ type: "Point", coordinates: [0, 0] })).toBeNull();
  });

  test("returns null for null input", () => {
    expect(geoJsonToWkt(null)).toBeNull();
  });

  test("single-point LineString is converted (no min-2 check in converter)", () => {
    // geoJsonToWkt doesn't validate min points — that's the schema's job.
    // It just converts what it's given.
    const result = geoJsonToWkt({ type: "LineString", coordinates: [[0, 0]] });
    expect(result).toBe("LINESTRING(0 0)");
  });

  test("filters out too-short lines in MultiLineString", () => {
    const result = geoJsonToWkt({
      type: "MultiLineString",
      coordinates: [
        [[0, 0], [1, 1]],
        [[2, 2]],
        [[3, 3], [4, 4]],
      ],
    });
    expect(result).toBe("MULTILINESTRING((0 0, 1 1), (3 3, 4 4))");
  });

  test("returns null for MultiLineString with all lines too short", () => {
    const result = geoJsonToWkt({
      type: "MultiLineString",
      coordinates: [[[0, 0]]],
    });
    expect(result).toBeNull();
  });
});

describe("parseWktLineString", () => {
  test("parses LINESTRING", () => {
    const result = parseWktLineString("LINESTRING(0 0, 1 1)");
    expect(result).toEqual([[0, 0], [1, 1]]);
  });

  test("parses MULTILINESTRING", () => {
    const result = parseWktLineString("MULTILINESTRING((0 0, 1 1), (2 2, 3 3))");
    expect(result).toEqual([[0, 0], [1, 1], [2, 2], [3, 3]]);
  });

  test("returns points for any WKT with parenthesized coordinate pairs", () => {
    // The parser is simple regex-based; it extracts all coordinate pairs
    // from any parenthesized groups. Used only with known-good WKT from
    // PostGIS. A POINT will parse its single coordinate.
    expect(parseWktLineString("POINT(0 0)")).toEqual([[0, 0]]);
    expect(parseWktLineString("")).toEqual([]);
  });

  test("handles extra whitespace", () => {
    const result = parseWktLineString("LINESTRING(  0   0 ,  1   1  )");
    expect(result).toEqual([[0, 0], [1, 1]]);
  });
});
