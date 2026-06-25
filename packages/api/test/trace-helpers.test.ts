import { describe, expect, test } from "bun:test";
import {
  parseGpx,
  parseGeoJsonTrace,
  simplifyRdp,
  splitAtTurns,
  traceLengthMeters,
} from "@magnum/shared/constants";

describe("parseGpx", () => {
  test("extracts trkpt lat/lon pairs in document order", () => {
    const gpx = `
      <gpx>
        <trk>
          <trkseg>
            <trkpt lat="1.0" lon="2.0"/>
            <trkpt lat="3.0" lon="4.0"/>
            <trkpt lat="5.5" lon="6.5"/>
          </trkseg>
        </trk>
      </gpx>`;
    expect(parseGpx(gpx)).toEqual([
      [2.0, 1.0],
      [4.0, 3.0],
      [6.5, 5.5],
    ]);
  });

  test("throws when no trkpt is found", () => {
    expect(() => parseGpx("<gpx></gpx>")).toThrow(/trkpt/);
  });

  test("ignores malformed coordinates", () => {
    const gpx = `<trkpt lat="bad" lon="2.0"/><trkpt lat="3" lon="4"/>`;
    expect(parseGpx(gpx)).toEqual([[4, 3]]);
  });
});

describe("parseGeoJsonTrace", () => {
  test("accepts LineString", () => {
    const ls = {
      type: "LineString",
      coordinates: [
        [-83, 40],
        [-83.1, 40.1],
      ],
    };
    expect(parseGeoJsonTrace(ls)).toEqual([
      [-83, 40],
      [-83.1, 40.1],
    ]);
  });

  test("flattens MultiLineString", () => {
    const mls = {
      type: "MultiLineString",
      coordinates: [
        [
          [0, 0],
          [1, 1],
        ],
        [
          [2, 2],
          [3, 3],
        ],
      ],
    };
    expect(parseGeoJsonTrace(mls)).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
  });

  test("rejects non-trace geometries", () => {
    expect(() => parseGeoJsonTrace({ type: "Point", coordinates: [0, 0] })).toThrow();
  });
});

describe("simplifyRdp", () => {
  test("returns input unchanged for tiny tolerance", () => {
    const points: Array<[number, number]> = [
      [0, 0],
      [0.0001, 0],
      [0.0002, 0],
    ];
    expect(simplifyRdp(points, 0)).toEqual(points);
  });

  test("collapses collinear points to endpoints", () => {
    const points: Array<[number, number]> = [
      [0, 0],
      [0.0001, 0],
      [0.0002, 0],
      [0.0003, 0],
    ];
    const out = simplifyRdp(points, 5);
    // Endpoints are always kept; intermediate collinear points
    // are within 5m of the line so they collapse.
    expect(out.length).toBeLessThanOrEqual(2);
  });

  test("keeps a far-off point even at large tolerance", () => {
    // Right angle: the corner is 100m away from the straight line.
    const points: Array<[number, number]> = [
      [0, 0],
      [0.0005, 0], // ~50m east
      [0.0005, 0.0009], // ~100m north
      [0.001, 0.0009],
    ];
    const out = simplifyRdp(points, 5);
    // The corner must remain.
    expect(out.some((p) => Math.abs(p[0] - 0.0005) < 1e-6 && Math.abs(p[1] - 0.0009) < 1e-6)).toBe(true);
  });
});

describe("splitAtTurns", () => {
  test("returns a single ring when there are no turns", () => {
    const points: Array<[number, number]> = [
      [0, 0],
      [0.001, 0],
      [0.002, 0],
    ];
    expect(splitAtTurns(points, 25)).toHaveLength(1);
  });

  test("splits at a sharp turn", () => {
    // Right angle: heading changes ~90° at the middle point.
    const points: Array<[number, number]> = [
      [0, 0],
      [0.001, 0],
      [0.002, 0],
      [0.002, 0.001],
    ];
    const rings = splitAtTurns(points, 25);
    expect(rings.length).toBe(2);
  });
});

describe("traceLengthMeters", () => {
  test("zero for fewer than two points", () => {
    expect(traceLengthMeters([])).toBe(0);
    expect(traceLengthMeters([[0, 0]])).toBe(0);
  });

  test("non-zero for a line", () => {
    const length = traceLengthMeters([
      [0, 0],
      [0.001, 0],
    ]);
    // 0.001° at the equator ≈ 111m. Accept 100..120 to be tolerant of
    // small projection artifacts at the equator.
    expect(length).toBeGreaterThan(100);
    expect(length).toBeLessThan(120);
  });
});
