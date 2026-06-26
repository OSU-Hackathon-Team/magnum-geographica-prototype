import { describe, expect, test } from "bun:test";
import { shapeSchema, shapeToGeoJSON } from "../src/index.js";

describe("shapeSchema", () => {
  test("parses a minimal empty shape", () => {
    const parsed = shapeSchema.parse({ rings: [], chords: [] });
    expect(parsed.connectFrom).toBeNull();
    expect(parsed.rings).toEqual([]);
    expect(parsed.chords).toEqual([]);
  });

  test("parses a closed ring with default connectFrom", () => {
    const parsed = shapeSchema.parse({
      rings: [
        {
          vertices: [
            [0, 0],
            [0, 1],
            [1, 1],
          ],
          closed: true,
        },
      ],
    });
    expect(parsed.connectFrom).toBeNull();
    expect(parsed.rings[0]?.closed).toBe(true);
  });

  test("rejects malformed coordinates (out of range)", () => {
    expect(() =>
      shapeSchema.parse({
        rings: [{ vertices: [[200, 0]], closed: true }],
      }),
    ).toThrow();
  });
});

describe("shapeToGeoJSON", () => {
  test("returns null for an empty shape", () => {
    expect(shapeToGeoJSON({ rings: [], chords: [], connectFrom: null })).toBeNull();
  });

  test("returns null when no rings are closed", () => {
    expect(
      shapeToGeoJSON({
        rings: [{ vertices: [[0, 0]], closed: false }],
        chords: [],
        connectFrom: null,
      }),
    ).toBeNull();
  });

  test("returns null when a closed ring has fewer than 3 vertices", () => {
    expect(
      shapeToGeoJSON({
        rings: [
          { vertices: [[0, 0], [0, 1]], closed: true },
        ],
        chords: [],
        connectFrom: null,
      }),
    ).toBeNull();
  });

  test("emits a Polygon for one closed ring", () => {
    const out = shapeToGeoJSON({
      rings: [
        {
          vertices: [
            [0, 0],
            [0, 1],
            [1, 1],
          ],
          closed: true,
        },
      ],
      chords: [],
      connectFrom: null,
    });
    expect(out?.type).toBe("Polygon");
    if (out?.type === "Polygon") {
      expect(out.coordinates[0]?.[0]).toEqual([0, 0]);
      expect(out.coordinates[0]?.[2]).toEqual([1, 1]);
      // The first and last vertices should match (closed ring).
      expect(out.coordinates[0]?.[0]).toEqual(
        out.coordinates[0]?.[out.coordinates[0]!.length - 1],
      );
    }
  });

  test("emits a MultiPolygon for two closed rings", () => {
    const out = shapeToGeoJSON({
      rings: [
        {
          vertices: [
            [0, 0],
            [0, 1],
            [1, 1],
          ],
          closed: true,
        },
        {
          vertices: [
            [10, 10],
            [10, 11],
            [11, 11],
          ],
          closed: true,
        },
      ],
      chords: [],
      connectFrom: null,
    });
    expect(out?.type).toBe("MultiPolygon");
    if (out?.type === "MultiPolygon") {
      expect(out.coordinates.length).toBe(2);
    }
  });

  test("emits a MultiPolygon when a mix of closed and open rings is provided", () => {
    const out = shapeToGeoJSON({
      rings: [
        {
          vertices: [
            [0, 0],
            [0, 1],
            [1, 1],
          ],
          closed: true,
        },
        { vertices: [[5, 5], [6, 6]], closed: false }, // skipped
      ],
      chords: [],
      connectFrom: null,
    });
    expect(out?.type).toBe("Polygon"); // only 1 closed ring → Polygon
  });
});
