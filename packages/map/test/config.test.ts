import { describe, expect, test } from "bun:test";
import {
  defaultBaseLayers,
  resolveBaseLayers,
  resolveDefaultBaseLayerId,
  EOX_SENTINEL2_CLOUDLESS_URL,
  SIMPLIFIED_BASE_LAYER_ID,
  SATELLITE_BASE_LAYER_ID,
  defaultMapConfig,
  trailsTileUrl,
  segmentsTileUrl,
  systemsTileUrl,
  featuresTileUrl,
  superSystemsTileUrl,
  type BaseLayerDef,
} from "../src/shared/config.js";

const MARTIN = "http://martin:3000";

describe("defaultBaseLayers", () => {
  test("returns two layers: simplified (MVT) and satellite (raster)", () => {
    const layers = defaultBaseLayers(MARTIN);
    expect(layers).toHaveLength(2);
    expect(layers[0]!.id).toBe(SIMPLIFIED_BASE_LAYER_ID);
    expect(layers[0]!.kind).toBe("mvt");
    expect(layers[1]!.id).toBe(SATELLITE_BASE_LAYER_ID);
    expect(layers[1]!.kind).toBe("raster");
  });

  test("simplified layer URL is built from the martin URL", () => {
    const layers = defaultBaseLayers(MARTIN);
    const simplified = layers.find((l) => l.id === SIMPLIFIED_BASE_LAYER_ID)!;
    expect(simplified.url).toBe(`${MARTIN}/basemap/{z}/{x}/{y}`);
  });

  test("satellite layer uses the EOX Sentinel-2 cloudless URL", () => {
    const layers = defaultBaseLayers(MARTIN);
    const satellite = layers.find((l) => l.id === SATELLITE_BASE_LAYER_ID)!;
    expect(satellite.url).toBe(EOX_SENTINEL2_CLOUDLESS_URL);
  });

  test("works without a martin URL (relative path)", () => {
    const layers = defaultBaseLayers(undefined);
    const simplified = layers.find((l) => l.id === SIMPLIFIED_BASE_LAYER_ID)!;
    expect(simplified.url).toBe("/basemap/{z}/{x}/{y}");
  });

  test("simplified layer has zoom range that covers the full map (2-18)", () => {
    const layers = defaultBaseLayers(MARTIN);
    const simplified = layers.find((l) => l.id === SIMPLIFIED_BASE_LAYER_ID)!;
    expect(simplified.minZoom).toBe(2);
    expect(simplified.maxZoom).toBe(18);
  });

  test("satellite layer caps at z=13 (EOX composite resolution limit)", () => {
    const layers = defaultBaseLayers(MARTIN);
    const satellite = layers.find((l) => l.id === SATELLITE_BASE_LAYER_ID)!;
    expect(satellite.maxZoom).toBe(13);
  });

  test("every layer has an attribution string", () => {
    for (const l of defaultBaseLayers(MARTIN)) {
      expect(typeof l.attribution).toBe("string");
      expect(l.attribution!.length).toBeGreaterThan(0);
    }
  });

  test("layer ids are unique", () => {
    const ids = defaultBaseLayers(MARTIN).map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("resolveBaseLayers", () => {
  test("returns user-provided baseLayers if set", () => {
    const custom: BaseLayerDef[] = [
      {
        id: "x",
        label: "Custom X",
        kind: "raster",
        url: "https://x.test/{z}/{x}/{y}.png",
      },
    ];
    expect(resolveBaseLayers({ baseLayers: custom, martinTilesUrl: MARTIN })).toBe(custom);
  });

  test("falls back to defaultBaseLayers when none provided", () => {
    const layers = resolveBaseLayers({ martinTilesUrl: MARTIN });
    expect(layers).toHaveLength(2);
    expect(layers[0]!.id).toBe(SIMPLIFIED_BASE_LAYER_ID);
  });

  test("returns the same two default layers regardless of martin URL truthiness", () => {
    const a = resolveBaseLayers({});
    const b = resolveBaseLayers({ martinTilesUrl: MARTIN });
    const c = resolveBaseLayers({ martinTilesUrl: "http://other:1234" });
    expect(a.map((l) => l.id)).toEqual(b.map((l) => l.id));
    expect(b.map((l) => l.id)).toEqual(c.map((l) => l.id));
  });
});

describe("resolveDefaultBaseLayerId", () => {
  const layers = defaultBaseLayers(MARTIN);

  test("returns SIMPLIFIED_BASE_LAYER_ID by default", () => {
    expect(resolveDefaultBaseLayerId({}, layers)).toBe(SIMPLIFIED_BASE_LAYER_ID);
  });

  test("returns the requested id if present in layers", () => {
    expect(
      resolveDefaultBaseLayerId({ defaultBaseLayerId: SATELLITE_BASE_LAYER_ID }, layers),
    ).toBe(SATELLITE_BASE_LAYER_ID);
  });

  test("falls back to first layer if requested id is unknown", () => {
    expect(resolveDefaultBaseLayerId({ defaultBaseLayerId: "bogus" }, layers)).toBe(
      layers[0]!.id,
    );
  });

  test("falls back to first layer when layers is empty (defensive)", () => {
    // Should never happen in practice; verify the contract.
    expect(() => resolveDefaultBaseLayerId({}, [])).toThrow();
  });
});

describe("defaultMapConfig", () => {
  test("does not specify a base layer — resolution happens at runtime", () => {
    expect(defaultMapConfig.baseLayers).toBeUndefined();
    expect(defaultMapConfig.defaultBaseLayerId).toBeUndefined();
  });

  test("initial camera is centered on Ohio at zoom 6", () => {
    expect(defaultMapConfig.initialCenter).toEqual([-82.9988, 39.9612]);
    expect(defaultMapConfig.initialZoom).toBe(6);
  });
});

describe("martin tile URL helpers", () => {
  test("all helpers require a martin URL", () => {
    const fns = [
      trailsTileUrl,
      segmentsTileUrl,
      systemsTileUrl,
      featuresTileUrl,
      superSystemsTileUrl,
    ];
    for (const fn of fns) {
      expect(fn({} as never)).toBeUndefined();
    }
  });

  test("helpers build correct paths under the martin URL", () => {
    const cfg = { martinTilesUrl: MARTIN } as never;
    expect(trailsTileUrl(cfg)).toBe(`${MARTIN}/trails/{z}/{x}/{y}`);
    expect(segmentsTileUrl(cfg)).toBe(`${MARTIN}/segments/{z}/{x}/{y}`);
    expect(systemsTileUrl(cfg)).toBe(`${MARTIN}/systems/{z}/{x}/{y}`);
    expect(featuresTileUrl(cfg)).toBe(`${MARTIN}/features/{z}/{x}/{y}`);
    expect(superSystemsTileUrl(cfg)).toBe(`${MARTIN}/super_systems/{z}/{x}/{y}`);
  });
});
