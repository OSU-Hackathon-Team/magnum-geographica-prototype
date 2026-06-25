import { describe, expect, test, beforeEach } from "bun:test";
import { mock } from "bun:test";
import { createMockDb } from "./helpers/mockDb.js";

const { db, state } = createMockDb();

mock.module("../src/db/index.js", () => ({
  db,
  pool: { end: () => Promise.resolve() },
  schema: {},
}));

const {
  listPresets,
  getPresetById,
  getPresetByKey,
  createPreset,
  updatePreset,
  deletePreset,
} = await import("../src/services/presets.js");

const sample = {
  key: "bench",
  label: "Bench",
  iconName: "cafe",
  iconColor: "#8B4513",
  category: "rest_shelter",
  osmTags: { amenity: "bench" },
  questions: [
    { key: "backrest", type: "boolean" as const, label: "Has backrest" },
  ],
  upstreamable: true,
  sortOrder: 10,
};

beforeEach(() => {
  state.presets.length = 0;
});

describe("createPreset", () => {
  test("inserts a new preset", async () => {
    const p = await createPreset(sample);
    expect(p.key).toBe("bench");
    expect(p.label).toBe("Bench");
    expect(state.presets.length).toBe(1);
  });
});

describe("getPresetByKey", () => {
  test("returns null for missing key", async () => {
    const res = await getPresetByKey("missing");
    expect(res).toBe(null);
  });
  test("finds an existing preset by key", async () => {
    await createPreset(sample);
    const res = await getPresetByKey("bench");
    expect(res?.label).toBe("Bench");
  });
});

describe("getPresetById", () => {
  test("returns null for missing id", async () => {
    const res = await getPresetById("00000000-0000-0000-0000-000000000099");
    expect(res).toBe(null);
  });
  test("finds an existing preset by id", async () => {
    const p = await createPreset(sample);
    const res = await getPresetById(p.id);
    expect(res?.key).toBe("bench");
  });
});

describe("listPresets", () => {
  test("filters by category", async () => {
    await createPreset(sample);
    await createPreset({ ...sample, key: "drinking_water", category: "water_sanitation" });
    const rest = await listPresets({ category: "rest_shelter" });
    expect(rest.length).toBe(1);
    expect(rest[0]?.key).toBe("bench");
    const water = await listPresets({ category: "water_sanitation" });
    expect(water.length).toBe(1);
    expect(water[0]?.key).toBe("drinking_water");
  });

  test("orders by sort_order then label", async () => {
    await createPreset({ ...sample, key: "shelter", sortOrder: 30 });
    await createPreset({ ...sample, key: "bench", sortOrder: 10 });
    await createPreset({ ...sample, key: "campsite", sortOrder: 40 });
    const all = await listPresets();
    expect(all.map((p) => p.key)).toEqual(["bench", "shelter", "campsite"]);
  });
});

describe("updatePreset", () => {
  test("updates mutable fields", async () => {
    const p = await createPreset(sample);
    const updated = await updatePreset(p.id, { label: "Updated Bench", upstreamable: false });
    expect(updated?.label).toBe("Updated Bench");
    expect(updated?.upstreamable).toBe(false);
  });

  test("returns the same row when no fields change", async () => {
    const p = await createPreset(sample);
    const same = await updatePreset(p.id, {});
    expect(same?.key).toBe("bench");
  });
});

describe("deletePreset", () => {
  test("removes the preset", async () => {
    const p = await createPreset(sample);
    const ok = await deletePreset(p.id);
    expect(ok).toBe(true);
    const after = await getPresetById(p.id);
    expect(after).toBe(null);
  });
});
