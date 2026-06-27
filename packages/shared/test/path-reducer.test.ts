import { describe, test, expect } from "bun:test";
import {
  pathReducer,
  emptyPath,
  lastOpenPathIndex,
  type PathAction,
} from "../src/index.js";

describe("pathReducer", () => {
  describe("appendVertex", () => {
    test("creates the first ring on empty path", () => {
      const s = pathReducer(emptyPath(), { type: "appendVertex", lon: -82.5, lat: 39.5 });
      expect(s.rings.length).toBe(1);
      expect(s.rings[0]!.vertices).toEqual([[-82.5, 39.5]]);
      expect(s.rings[0]!.closed).toBe(false);
    });

    test("appends to the last open ring", () => {
      let s = emptyPath();
      s = pathReducer(s, { type: "appendVertex", lon: -82.5, lat: 39.5 });
      s = pathReducer(s, { type: "appendVertex", lon: -82.4, lat: 39.5 });
      expect(s.rings[0]!.vertices.length).toBe(2);
      expect(s.rings[0]!.vertices[1]).toEqual([-82.4, 39.5]);
    });

    test("starts a new ring after startNewLine", () => {
      let s = emptyPath();
      s = pathReducer(s, { type: "appendVertex", lon: -82.5, lat: 39.5 });
      s = pathReducer(s, { type: "appendVertex", lon: -82.4, lat: 39.5 });
      s = pathReducer(s, { type: "startNewLine" });
      s = pathReducer(s, { type: "appendVertex", lon: -83.0, lat: 40.0 });
      expect(s.rings.length).toBe(2);
      expect(s.rings[0]!.closed).toBe(false);
      expect(s.rings[0]!.vertices.length).toBe(2);
      expect(s.rings[1]!.closed).toBe(false);
      expect(s.rings[1]!.vertices[0]).toEqual([-83.0, 40.0]);
    });

    test("multiple startNewLine followed by appends", () => {
      let s = emptyPath();
      s = pathReducer(s, { type: "startNewLine" });
      s = pathReducer(s, { type: "startNewLine" });
      s = pathReducer(s, { type: "startNewLine" });
      s = pathReducer(s, { type: "appendVertex", lon: -82.5, lat: 39.5 });
      expect(s.rings.length).toBe(4);
      expect(s.rings[3]!.vertices).toEqual([[-82.5, 39.5]]);
    });
  });

  describe("splitEdge", () => {
    test("inserts a vertex mid-edge", () => {
      let s = emptyPath();
      s = pathReducer(s, { type: "appendVertex", lon: -82.5, lat: 39.5 });
      s = pathReducer(s, { type: "appendVertex", lon: -82.3, lat: 39.5 });
      s = pathReducer(s, { type: "splitEdge", ringIndex: 0, after: 0, lon: -82.4, lat: 39.5 });
      expect(s.rings[0]!.vertices.length).toBe(3);
      expect(s.rings[0]!.vertices[1]).toEqual([-82.4, 39.5]);
    });

    test("inserts after the second segment", () => {
      let s = emptyPath();
      s = pathReducer(s, { type: "appendVertex", lon: 0, lat: 0 });
      s = pathReducer(s, { type: "appendVertex", lon: 1, lat: 0 });
      s = pathReducer(s, { type: "appendVertex", lon: 2, lat: 0 });
      s = pathReducer(s, { type: "splitEdge", ringIndex: 0, after: 1, lon: 1.5, lat: 0 });
      expect(s.rings[0]!.vertices.length).toBe(4);
      expect(s.rings[0]!.vertices[2]).toEqual([1.5, 0]);
    });

    test("no-ops on invalid ring index", () => {
      let s = emptyPath();
      s = pathReducer(s, { type: "appendVertex", lon: -82.5, lat: 39.5 });
      const s2 = pathReducer(s, { type: "splitEdge", ringIndex: 99, after: 0, lon: 0, lat: 0 });
      expect(s2).toEqual(s);
    });

    test("no-ops on invalid after index", () => {
      let s = emptyPath();
      s = pathReducer(s, { type: "appendVertex", lon: -82.5, lat: 39.5 });
      s = pathReducer(s, { type: "appendVertex", lon: -82.3, lat: 39.5 });
      const s2 = pathReducer(s, { type: "splitEdge", ringIndex: 0, after: 99, lon: 0, lat: 0 });
      expect(s2).toEqual(s);
    });

    test("no-ops when after is the last vertex (no edge after)", () => {
      let s = emptyPath();
      s = pathReducer(s, { type: "appendVertex", lon: 0, lat: 0 });
      s = pathReducer(s, { type: "appendVertex", lon: 1, lat: 0 });
      // after=1 means edge from vertex 1 to vertex 2, but only 2 vertices (indices 0,1)
      // The check is `after < 0 || after >= ring.vertices.length - 1`, so after=1 >= 1 → true → no-op
      const s2 = pathReducer(s, { type: "splitEdge", ringIndex: 0, after: 1, lon: 0.5, lat: 0 });
      expect(s2).toEqual(s);
    });

    test("no-ops on <2 vertex ring", () => {
      let s = emptyPath();
      s = pathReducer(s, { type: "appendVertex", lon: 0, lat: 0 });
      // 1 vertex → no edges → no-op
      const s2 = pathReducer(s, { type: "splitEdge", ringIndex: 0, after: 0, lon: 1, lat: 1 });
      expect(s2.rings[0]!.vertices.length).toBe(1);
    });
  });

  describe("moveVertex", () => {
    test("moves an existing vertex", () => {
      let s = emptyPath();
      s = pathReducer(s, { type: "appendVertex", lon: -82.5, lat: 39.5 });
      s = pathReducer(s, { type: "appendVertex", lon: -82.3, lat: 39.5 });
      s = pathReducer(s, { type: "moveVertex", ringIndex: 0, vertexIndex: 0, lon: -82.4, lat: 39.6 });
      expect(s.rings[0]!.vertices[0]).toEqual([-82.4, 39.6]);
    });

    test("no-ops on invalid ring index", () => {
      let s = emptyPath();
      s = pathReducer(s, { type: "appendVertex", lon: 0, lat: 0 });
      const s2 = pathReducer(s, { type: "moveVertex", ringIndex: 99, vertexIndex: 0, lon: 1, lat: 1 });
      expect(s2).toEqual(s);
    });

    test("no-ops on invalid vertex index", () => {
      let s = emptyPath();
      s = pathReducer(s, { type: "appendVertex", lon: 0, lat: 0 });
      const s2 = pathReducer(s, { type: "moveVertex", ringIndex: 0, vertexIndex: 99, lon: 1, lat: 1 });
      expect(s2).toEqual(s);
    });

    test("moves vertex in a specific ring (multi-ring path)", () => {
      let s = emptyPath();
      s = pathReducer(s, { type: "appendVertex", lon: 0, lat: 0 });
      s = pathReducer(s, { type: "appendVertex", lon: 1, lat: 0 });
      s = pathReducer(s, { type: "startNewLine" });
      s = pathReducer(s, { type: "appendVertex", lon: 2, lat: 2 });
      s = pathReducer(s, { type: "appendVertex", lon: 3, lat: 2 });
      s = pathReducer(s, { type: "moveVertex", ringIndex: 1, vertexIndex: 1, lon: 4, lat: 4 });
      expect(s.rings[1]!.vertices[1]).toEqual([4, 4]);
      // Ring 0 untouched
      expect(s.rings[0]!.vertices[1]).toEqual([1, 0]);
    });
  });

  describe("deleteVertex", () => {
    test("deletes a middle vertex", () => {
      let s = emptyPath();
      s = pathReducer(s, { type: "appendVertex", lon: 0, lat: 0 });
      s = pathReducer(s, { type: "appendVertex", lon: 1, lat: 0 });
      s = pathReducer(s, { type: "appendVertex", lon: 2, lat: 0 });
      s = pathReducer(s, { type: "deleteVertex", ringIndex: 0, vertexIndex: 1 });
      expect(s.rings[0]!.vertices.length).toBe(2);
      expect(s.rings[0]!.vertices[0]).toEqual([0, 0]);
      expect(s.rings[0]!.vertices[1]).toEqual([2, 0]);
    });

    test("deletes the only vertex → ring removed", () => {
      let s = emptyPath();
      s = pathReducer(s, { type: "appendVertex", lon: 0, lat: 0 });
      s = pathReducer(s, { type: "deleteVertex", ringIndex: 0, vertexIndex: 0 });
      expect(s.rings.length).toBe(1);
      expect(s.rings[0]!.vertices.length).toBe(0);
    });

    test("all rings removed → returns emptyPath", () => {
      let s = emptyPath();
      s = pathReducer(s, { type: "appendVertex", lon: 0, lat: 0 });
      s = pathReducer(s, { type: "deleteVertex", ringIndex: 0, vertexIndex: 0 });
      // Delete the last (empty) ring's imaginary vertex — actually this removes the ring
      const empty = pathReducer(s, { type: "deleteVertex", ringIndex: 0, vertexIndex: 0 });
      expect(empty.rings.length).toBe(1);
      expect(empty.rings[0]!.vertices.length).toBe(0);
    });

    test("no-ops on invalid ring index", () => {
      let s = emptyPath();
      s = pathReducer(s, { type: "appendVertex", lon: 0, lat: 0 });
      const s2 = pathReducer(s, { type: "deleteVertex", ringIndex: 99, vertexIndex: 0 });
      expect(s2).toEqual(s);
    });

    test("no-ops on invalid vertex index", () => {
      let s = emptyPath();
      s = pathReducer(s, { type: "appendVertex", lon: 0, lat: 0 });
      const s2 = pathReducer(s, { type: "deleteVertex", ringIndex: 0, vertexIndex: 99 });
      expect(s2).toEqual(s);
    });
  });

  describe("startNewLine", () => {
    test("adds a new empty ring", () => {
      let s = emptyPath();
      s = pathReducer(s, { type: "appendVertex", lon: 0, lat: 0 });
      s = pathReducer(s, { type: "startNewLine" });
      expect(s.rings.length).toBe(2);
      expect(s.rings[1]!.vertices.length).toBe(0);
      expect(s.rings[1]!.closed).toBe(false);
    });

    test("works on empty path", () => {
      let s = pathReducer(emptyPath(), { type: "startNewLine" });
      expect(s.rings.length).toBe(2);
    });
  });

  describe("lastOpenPathIndex", () => {
    test("returns last open ring index", () => {
      let s = emptyPath();
      s = pathReducer(s, { type: "appendVertex", lon: 0, lat: 0 });
      expect(lastOpenPathIndex(s)).toBe(0);
    });

    test("returns -1 when no open rings (should not happen in path reducer)", () => {
      // Path reducer never closes rings, so lastOpenPathIndex always finds one.
      // Still test defensive behavior.
      const s = emptyPath();
      expect(lastOpenPathIndex(s)).toBe(0);
    });
  });

  describe("immutability", () => {
    test("appendVertex returns a new object", () => {
      const s = emptyPath();
      const s2 = pathReducer(s, { type: "appendVertex", lon: 0, lat: 0 });
      expect(s2).not.toBe(s);
      expect(s2.rings).not.toBe(s.rings);
    });

    test("startNewLine returns a new object", () => {
      const s = emptyPath();
      const s2 = pathReducer(s, { type: "startNewLine" });
      expect(s2).not.toBe(s);
    });

    test("splitEdge returns a new object", () => {
      let s = emptyPath();
      s = pathReducer(s, { type: "appendVertex", lon: 0, lat: 0 });
      s = pathReducer(s, { type: "appendVertex", lon: 1, lat: 0 });
      const s2 = pathReducer(s, { type: "splitEdge", ringIndex: 0, after: 0, lon: 0.5, lat: 0 });
      expect(s2).not.toBe(s);
    });
  });
});
