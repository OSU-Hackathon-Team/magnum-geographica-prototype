import { describe, test, expect } from "bun:test";
import {
  shapeReducer,
  emptyShape,
  lastOpenRingIndex,
  findNearestEdge,
  type ShapeAction,
} from "../src/index.js";

describe("shapeReducer", () => {
  describe("appendVertex", () => {
    test("creates the first ring on empty shape", () => {
      const s = shapeReducer(emptyShape(), { type: "appendVertex", lon: -82.5, lat: 39.5 });
      expect(s.rings.length).toBe(1);
      expect(s.rings[0]!.vertices).toEqual([[-82.5, 39.5]]);
      expect(s.rings[0]!.closed).toBe(false);
    });

    test("appends to the last open ring", () => {
      let s = emptyShape();
      s = shapeReducer(s, { type: "appendVertex", lon: -82.5, lat: 39.5 });
      s = shapeReducer(s, { type: "appendVertex", lon: -82.4, lat: 39.5 });
      expect(s.rings[0]!.vertices.length).toBe(2);
      expect(s.rings[0]!.vertices[1]).toEqual([-82.4, 39.5]);
    });

    test("starts a new ring when all rings are closed", () => {
      let s = emptyShape();
      s = shapeReducer(s, { type: "appendVertex", lon: -82.5, lat: 39.5 });
      s = shapeReducer(s, { type: "appendVertex", lon: -82.4, lat: 39.5 });
      s = shapeReducer(s, { type: "appendVertex", lon: -82.4, lat: 39.4 });
      s = shapeReducer(s, { type: "closeRing" });
      s = shapeReducer(s, { type: "appendVertex", lon: -83.0, lat: 40.0 });
      expect(s.rings.length).toBe(2);
      expect(s.rings[0]!.closed).toBe(true);
      expect(s.rings[1]!.closed).toBe(false);
      expect(s.rings[1]!.vertices[0]).toEqual([-83.0, 40.0]);
    });
  });

  describe("closeRing", () => {
    test("no-ops when there is no open ring", () => {
      let s = emptyShape();
      s = shapeReducer(s, { type: "appendVertex", lon: -82.5, lat: 39.5 });
      s = shapeReducer(s, { type: "appendVertex", lon: -82.4, lat: 39.5 });
      s = shapeReducer(s, { type: "appendVertex", lon: -82.4, lat: 39.4 });
      s = shapeReducer(s, { type: "closeRing" });
      expect(s.rings[0]!.closed).toBe(true);
      const s2 = shapeReducer(s, { type: "closeRing" });
      expect(s2).toEqual(s);
    });

    test("no-ops when open ring has fewer than 3 vertices", () => {
      let s = emptyShape();
      s = shapeReducer(s, { type: "appendVertex", lon: -82.5, lat: 39.5 });
      s = shapeReducer(s, { type: "appendVertex", lon: -82.4, lat: 39.5 });
      s = shapeReducer(s, { type: "closeRing" });
      expect(s.rings[0]!.closed).toBe(false);
    });

    test("closes the last open ring with 3+ vertices", () => {
      let s = emptyShape();
      s = shapeReducer(s, { type: "appendVertex", lon: -82.5, lat: 39.5 });
      s = shapeReducer(s, { type: "appendVertex", lon: -82.4, lat: 39.5 });
      s = shapeReducer(s, { type: "appendVertex", lon: -82.4, lat: 39.4 });
      s = shapeReducer(s, { type: "closeRing" });
      expect(s.rings[0]!.closed).toBe(true);
    });
  });

  describe("splitEdge", () => {
    test("inserts a vertex mid-edge", () => {
      let s = emptyShape();
      s = shapeReducer(s, { type: "appendVertex", lon: -82.5, lat: 39.5 });
      s = shapeReducer(s, { type: "appendVertex", lon: -82.3, lat: 39.5 });
      s = shapeReducer(s, { type: "splitEdge", ringIndex: 0, after: 0, lon: -82.4, lat: 39.5 });
      expect(s.rings[0]!.vertices.length).toBe(3);
      expect(s.rings[0]!.vertices[1]).toEqual([-82.4, 39.5]);
    });

    test("no-ops on invalid ring index", () => {
      const s = shapeReducer(emptyShape(), { type: "appendVertex", lon: -82.5, lat: 39.5 });
      const s2 = shapeReducer(s, { type: "splitEdge", ringIndex: 99, after: 0, lon: 0, lat: 0 });
      expect(s2).toEqual(s);
    });

    test("no-ops when ring has fewer than 2 vertices", () => {
      const s = emptyShape();
      const s2 = shapeReducer(s, { type: "splitEdge", ringIndex: 0, after: 0, lon: 0, lat: 0 });
      expect(s2).toEqual(s);
    });
  });

  describe("moveVertex", () => {
    test("repositions a vertex", () => {
      let s = emptyShape();
      s = shapeReducer(s, { type: "appendVertex", lon: -82.5, lat: 39.5 });
      s = shapeReducer(s, { type: "appendVertex", lon: -82.4, lat: 39.5 });
      s = shapeReducer(s, { type: "moveVertex", ringIndex: 0, vertexIndex: 0, lon: -83.0, lat: 40.0 });
      expect(s.rings[0]!.vertices[0]).toEqual([-83.0, 40.0]);
      expect(s.rings[0]!.vertices[1]).toEqual([-82.4, 39.5]);
    });

    test("no-ops on invalid vertex index", () => {
      let s = emptyShape();
      s = shapeReducer(s, { type: "appendVertex", lon: -82.5, lat: 39.5 });
      const s2 = shapeReducer(s, { type: "moveVertex", ringIndex: 0, vertexIndex: 99, lon: 0, lat: 0 });
      expect(s2).toEqual(s);
    });
  });

  describe("deleteVertex", () => {
    test("removes a vertex and keeps closed ring if 3+ remain", () => {
      let s = emptyShape();
      s = shapeReducer(s, { type: "appendVertex", lon: -82.5, lat: 39.5 });
      s = shapeReducer(s, { type: "appendVertex", lon: -82.4, lat: 39.5 });
      s = shapeReducer(s, { type: "appendVertex", lon: -82.4, lat: 39.4 });
      s = shapeReducer(s, { type: "appendVertex", lon: -82.5, lat: 39.4 });
      s = shapeReducer(s, { type: "closeRing" });
      s = shapeReducer(s, { type: "deleteVertex", ringIndex: 0, vertexIndex: 1 });
      expect(s.rings[0]!.vertices.length).toBe(3);
      expect(s.rings[0]!.closed).toBe(true);
    });

    test("opens a closed ring if fewer than 3 vertices remain", () => {
      let s = emptyShape();
      s = shapeReducer(s, { type: "appendVertex", lon: -82.5, lat: 39.5 });
      s = shapeReducer(s, { type: "appendVertex", lon: -82.4, lat: 39.5 });
      s = shapeReducer(s, { type: "appendVertex", lon: -82.4, lat: 39.4 });
      s = shapeReducer(s, { type: "closeRing" });
      s = shapeReducer(s, { type: "deleteVertex", ringIndex: 0, vertexIndex: 0 });
      expect(s.rings[0]!.closed).toBe(false);
    });

    test("drops the ring entirely when last vertex is removed", () => {
      let s = emptyShape();
      s = shapeReducer(s, { type: "appendVertex", lon: -82.5, lat: 39.5 });
      s = shapeReducer(s, { type: "deleteVertex", ringIndex: 0, vertexIndex: 0 });
      expect(s.rings.length).toBe(1);
      expect(s.rings[0]!.vertices.length).toBe(0);
      expect(s.rings[0]!.closed).toBe(false);
    });

    test("drops a ring with multiple vertices that becomes empty", () => {
      let s = emptyShape();
      s = shapeReducer(s, { type: "appendVertex", lon: -82.5, lat: 39.5 });
      s = shapeReducer(s, { type: "appendVertex", lon: -82.4, lat: 39.5 });
      s = shapeReducer(s, { type: "appendVertex", lon: -82.4, lat: 39.4 });
      s = shapeReducer(s, { type: "closeRing" });
      // Delete all 3 vertices.
      s = shapeReducer(s, { type: "deleteVertex", ringIndex: 0, vertexIndex: 2 });
      s = shapeReducer(s, { type: "deleteVertex", ringIndex: 0, vertexIndex: 1 });
      s = shapeReducer(s, { type: "deleteVertex", ringIndex: 0, vertexIndex: 0 });
      expect(s.rings.length).toBe(1);
      expect(s.rings[0]!.vertices.length).toBe(0);
    });
  });

  describe("openEdge", () => {
    test("opens the wraparound edge of a closed ring", () => {
      let s = emptyShape();
      s = shapeReducer(s, { type: "appendVertex", lon: -82.5, lat: 39.5 });
      s = shapeReducer(s, { type: "appendVertex", lon: -82.4, lat: 39.5 });
      s = shapeReducer(s, { type: "appendVertex", lon: -82.4, lat: 39.4 });
      s = shapeReducer(s, { type: "closeRing" });
      s = shapeReducer(s, { type: "openEdge", ringIndex: 0, after: 2 });
      expect(s.rings.length).toBe(1);
      expect(s.rings[0]!.closed).toBe(false);
    });

    test("splits a closed ring at an interior edge into two open rings", () => {
      let s = emptyShape();
      s = shapeReducer(s, { type: "appendVertex", lon: -82.5, lat: 39.5 });
      s = shapeReducer(s, { type: "appendVertex", lon: -82.4, lat: 39.5 });
      s = shapeReducer(s, { type: "appendVertex", lon: -82.4, lat: 39.4 });
      s = shapeReducer(s, { type: "appendVertex", lon: -82.5, lat: 39.4 });
      s = shapeReducer(s, { type: "closeRing" });
      s = shapeReducer(s, { type: "openEdge", ringIndex: 0, after: 1 });
      expect(s.rings.length).toBe(2);
      expect(s.rings[0]!.closed).toBe(false);
      expect(s.rings[1]!.closed).toBe(false);
      expect(s.rings[0]!.vertices.length).toBe(2);
      expect(s.rings[1]!.vertices.length).toBe(2);
    });

    test("splits an open ring into two", () => {
      let s = emptyShape();
      s = shapeReducer(s, { type: "appendVertex", lon: -82.5, lat: 39.5 });
      s = shapeReducer(s, { type: "appendVertex", lon: -82.4, lat: 39.5 });
      s = shapeReducer(s, { type: "appendVertex", lon: -82.4, lat: 39.4 });
      s = shapeReducer(s, { type: "openEdge", ringIndex: 0, after: 0 });
      // Original ring has 3 open vertices [A, B, C].
      // openEdge after=0: left=[A] (1 vert → dropped), right=[B,C] (2 verts → kept).
      expect(s.rings.length).toBe(1);
      expect(s.rings[0]!.vertices).toEqual([[-82.4, 39.5], [-82.4, 39.4]]);
    });

    test("no-ops on an open ring with after beyond edge count", () => {
      let s = emptyShape();
      s = shapeReducer(s, { type: "appendVertex", lon: -82.5, lat: 39.5 });
      s = shapeReducer(s, { type: "appendVertex", lon: -82.4, lat: 39.5 });
      const s2 = shapeReducer(s, { type: "openEdge", ringIndex: 0, after: 1 });
      expect(s2).toEqual(s);
    });
  });

  describe("immutability", () => {
    test("does not mutate the input shape", () => {
      const s = emptyShape();
      const s2 = shapeReducer(s, { type: "appendVertex", lon: -82.5, lat: 39.5 });
      expect(s2).not.toBe(s);
      expect(s.rings[0]!.vertices.length).toBe(0);
    });
  });
});

describe("lastOpenRingIndex", () => {
  test("returns -1 when all rings are closed", () => {
    const s = {
      rings: [{ vertices: [[0, 0], [1, 0], [1, 1]] as [number, number][], closed: true }],
    };
    expect(lastOpenRingIndex(s)).toBe(-1);
  });

  test("returns the index of the last open ring", () => {
    const s = {
      rings: [
        { vertices: [[0, 0], [1, 0], [1, 1]] as [number, number][], closed: true },
        { vertices: [[2, 2]] as [number, number][], closed: false },
      ],
    };
    expect(lastOpenRingIndex(s)).toBe(1);
  });
});

describe("findNearestEdge", () => {
  test("finds the nearest edge for a point on a ring", () => {
    const rings = [
      {
        vertices: [
          [-82.5, 39.5],
          [-82.3, 39.5],
          [-82.3, 39.7],
        ] as [number, number][],
        closed: false,
      },
    ];
    const result = findNearestEdge(rings, -82.4, 39.5);
    expect(result).not.toBeNull();
    expect(result!.ringIndex).toBe(0);
    expect(result!.insertAfter).toBe(0);
  });

  test("returns null for rings with fewer than 2 vertices", () => {
    const rings = [{ vertices: [[-82.5, 39.5]] as [number, number][], closed: false }];
    const result = findNearestEdge(rings, -82.4, 39.5);
    expect(result).toBeNull();
  });
});

describe("emptyShape", () => {
  test("returns a shape with one empty open ring", () => {
    const s = emptyShape();
    expect(s.rings.length).toBe(1);
    expect(s.rings[0]!.vertices).toEqual([]);
    expect(s.rings[0]!.closed).toBe(false);
  });
});
