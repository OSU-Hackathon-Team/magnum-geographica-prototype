import { describe, expect, test } from "bun:test";
import {
  FEATURE_TYPES,
  DIFFICULTIES,
  SURFACE_TYPES,
  WIKI_TARGET_TYPES,
  SYNC_ACTIONS,
  SYNC_STATUSES,
  SURFACE_COLORS,
  DIFFICULTY_COLORS,
  FEATURE_ICONS,
  STORAGE_SOFT_WARN_BYTES,
  STORAGE_HARD_CAP_BYTES,
  OFFLINE_TILE_ZOOM_DETAIL_MAX,
  OFFLINE_TILE_ZOOM_OVERVIEW_MAX,
  ATTESTATION_QUORUM_DEFAULT,
  ATTESTATION_TRACK_OVERLAP_THRESHOLD,
  QUALITY_LEVELS,
  QUALITY_LEVEL_ORDER,
  DEFAULT_OFFLINE_QUALITY,
  DEFAULT_OFFLINE_MIN_ZOOM,
} from "../src/constants.js";

describe("enum coverage", () => {
  test("every SURFACE_TYPE has a SURFACE_COLOR", () => {
    for (const t of SURFACE_TYPES) {
      expect(SURFACE_COLORS[t]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  test("every DIFFICULTY has a DIFFICULTY_COLOR", () => {
    for (const d of DIFFICULTIES) {
      expect(DIFFICULTY_COLORS[d]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  test("every FEATURE_TYPE has a FEATURE_ICON", () => {
    for (const f of FEATURE_TYPES) {
      expect(typeof FEATURE_ICONS[f]).toBe("string");
      expect(FEATURE_ICONS[f]?.length).toBeGreaterThan(0);
    }
  });

  test("all enum tuples are non-empty arrays of strings", () => {
    for (const e of [FEATURE_TYPES, DIFFICULTIES, SURFACE_TYPES, WIKI_TARGET_TYPES, SYNC_ACTIONS, SYNC_STATUSES]) {
      expect(e.length).toBeGreaterThan(0);
      for (const v of e) {
        expect(typeof v).toBe("string");
      }
    }
  });
});

describe("storage caps", () => {
  test("soft warn is below hard cap", () => {
    expect(STORAGE_SOFT_WARN_BYTES).toBeLessThan(STORAGE_HARD_CAP_BYTES);
  });

  test("hard cap is a positive integer", () => {
    expect(STORAGE_HARD_CAP_BYTES).toBeGreaterThan(0);
    expect(Number.isInteger(STORAGE_HARD_CAP_BYTES)).toBe(true);
  });
});

describe("offline tile zoom ranges", () => {
  test("detail zoom is strictly greater than overview zoom", () => {
    expect(OFFLINE_TILE_ZOOM_DETAIL_MAX).toBeGreaterThan(OFFLINE_TILE_ZOOM_OVERVIEW_MAX);
  });

  test("zoom levels are in [0, 22]", () => {
    for (const z of [OFFLINE_TILE_ZOOM_OVERVIEW_MAX, OFFLINE_TILE_ZOOM_DETAIL_MAX]) {
      expect(z).toBeGreaterThanOrEqual(0);
      expect(z).toBeLessThanOrEqual(22);
    }
  });
});

describe("attestation constants", () => {
  test("quorum default is at least 1", () => {
    expect(ATTESTATION_QUORUM_DEFAULT).toBeGreaterThanOrEqual(1);
  });

  test("overlap threshold is in (0, 1]", () => {
    expect(ATTESTATION_TRACK_OVERLAP_THRESHOLD).toBeGreaterThan(0);
    expect(ATTESTATION_TRACK_OVERLAP_THRESHOLD).toBeLessThanOrEqual(1);
  });
});

describe("quality levels", () => {
  test("all ordered keys map to valid levels", () => {
    for (const key of QUALITY_LEVEL_ORDER) {
      const level = QUALITY_LEVELS[key];
      expect(level).toBeDefined();
      expect(level.key).toBe(key);
      expect(level.minZoom).toBeLessThanOrEqual(level.maxZoom);
      expect(level.minZoom).toBeGreaterThanOrEqual(0);
      expect(level.maxZoom).toBeLessThanOrEqual(18);
    }
  });

  test("ordered levels have non-decreasing max zoom", () => {
    let prevMax = 0;
    for (const key of QUALITY_LEVEL_ORDER) {
      expect(QUALITY_LEVELS[key]!.maxZoom).toBeGreaterThanOrEqual(prevMax);
      prevMax = QUALITY_LEVELS[key]!.maxZoom;
    }
  });

  test("default quality exists in ordered list", () => {
    expect(QUALITY_LEVELS[DEFAULT_OFFLINE_QUALITY]).toBeDefined();
    expect(QUALITY_LEVEL_ORDER).toContain(DEFAULT_OFFLINE_QUALITY);
  });

  test("default min zoom is 2", () => {
    expect(DEFAULT_OFFLINE_MIN_ZOOM).toBe(2);
  });

  test("each quality level has a label string", () => {
    for (const key of QUALITY_LEVEL_ORDER) {
      expect(typeof QUALITY_LEVELS[key]!.label).toBe("string");
      expect(QUALITY_LEVELS[key]!.label.length).toBeGreaterThan(0);
    }
  });
});
