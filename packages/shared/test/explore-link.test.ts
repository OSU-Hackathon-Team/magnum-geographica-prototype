import { describe, expect, test } from "bun:test";
import { buildExploreDeepLink } from "../src/utils/explore-link.js";

describe("buildExploreDeepLink", () => {
  test("builds URL with lat and lon (6 decimal precision)", () => {
    const url = buildExploreDeepLink({ center: { lat: 39.9612, lon: -82.9988 } });
    expect(url).toBe("/explore?lat=39.961200&lon=-82.998800");
  });

  test("includes zoom when provided", () => {
    const url = buildExploreDeepLink({
      center: { lat: 40, lon: -83 },
      zoom: 12,
    });
    expect(url).toBe("/explore?lat=40.000000&lon=-83.000000&zoom=12");
  });

  test("omits zoom when not a finite number", () => {
    const url = buildExploreDeepLink({
      center: { lat: 40, lon: -83 },
      zoom: Number.NaN,
    });
    expect(url).not.toContain("zoom=");
  });

  test("omits zoom when undefined", () => {
    const url = buildExploreDeepLink({ center: { lat: 0, lon: 0 } });
    expect(url).not.toContain("zoom=");
  });
});
