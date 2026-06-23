import { describe, expect, test, beforeEach, mock } from "bun:test";

// Mock @react-native-async-storage/async-storage with an in-memory shim BEFORE
// the store module is imported. zustand/persist calls createJSONStorage(() =>
// AsyncStorage) at module load time, so a broken AsyncStorage in the Bun
// runtime would otherwise break the import.
const memoryStore = new Map<string, string>();
mock.module("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => memoryStore.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      memoryStore.set(key, value);
    },
    removeItem: async (key: string) => {
      memoryStore.delete(key);
    },
  },
}));

// Mock react-native: the store transitively imports @magnum/map (for the
// SIMPLIFIED/SATELLITE constants), and that package's index pulls in
// MapContainer.tsx which imports react-native. A minimal stub is enough — we
// only need Platform.OS to exist and a no-op default export for any RN
// components the module graph touches at import time.
mock.module("react-native", () => ({
  Platform: { OS: "ios" },
  View: () => null,
  StyleSheet: { create: <T,>(s: T): T => s },
  Modal: () => null,
  Pressable: () => null,
  Text: () => null,
  default: {},
}));

// Pull constants directly from the map package's shared/config subpath to
// avoid loading the full @magnum/map index (which transitively imports RN
// components). Same path is exported in packages/map/package.json#exports.
const { SIMPLIFIED_BASE_LAYER_ID, SATELLITE_BASE_LAYER_ID } = await import(
  "@magnum/map/shared/config"
);
const { useBaseLayerStore } = await import("../src/stores/baseLayerStore");

const STORAGE_KEY = "magnum.baseLayer.v1";

beforeEach(() => {
  memoryStore.clear();
  useBaseLayerStore.setState({
    baseLayerId: SIMPLIFIED_BASE_LAYER_ID,
    hasHydrated: false,
  });
});

describe("useBaseLayerStore", () => {
  test("initial state defaults to simplified", () => {
    const s = useBaseLayerStore.getState();
    expect(s.baseLayerId).toBe(SIMPLIFIED_BASE_LAYER_ID);
    expect(s.hasHydrated).toBe(false);
  });

  test("setBaseLayerId updates state synchronously", () => {
    useBaseLayerStore.getState().setBaseLayerId(SATELLITE_BASE_LAYER_ID);
    expect(useBaseLayerStore.getState().baseLayerId).toBe(SATELLITE_BASE_LAYER_ID);
  });

  test("setBaseLayerId queues a write to AsyncStorage", async () => {
    useBaseLayerStore.getState().setBaseLayerId(SATELLITE_BASE_LAYER_ID);
    // Zustand persist writes asynchronously; give it a tick.
    await new Promise((r) => setTimeout(r, 10));
    const raw = memoryStore.get(STORAGE_KEY);
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw!) as { state: { baseLayerId: string } };
    expect(parsed.state.baseLayerId).toBe(SATELLITE_BASE_LAYER_ID);
  });

  test("setting back to simplified writes the new value, not the old one", async () => {
    const { setBaseLayerId } = useBaseLayerStore.getState();
    setBaseLayerId(SATELLITE_BASE_LAYER_ID);
    setBaseLayerId(SIMPLIFIED_BASE_LAYER_ID);
    await new Promise((r) => setTimeout(r, 10));
    const parsed = JSON.parse(memoryStore.get(STORAGE_KEY)!) as {
      state: { baseLayerId: string };
    };
    expect(parsed.state.baseLayerId).toBe(SIMPLIFIED_BASE_LAYER_ID);
  });

  test("rehydrating from AsyncStorage restores a previously stored choice", async () => {
    // Simulate a prior session: write a value directly to the mock storage.
    memoryStore.set(
      STORAGE_KEY,
      JSON.stringify({ state: { baseLayerId: SATELLITE_BASE_LAYER_ID }, version: 0 }),
    );
    // Manually trigger rehydration (zustand/persist exposes this).
    await useBaseLayerStore.persist.rehydrate();
    const s = useBaseLayerStore.getState();
    expect(s.baseLayerId).toBe(SATELLITE_BASE_LAYER_ID);
    expect(s.hasHydrated).toBe(true);
  });

  test("rehydrating from missing storage keeps the default", async () => {
    await useBaseLayerStore.persist.rehydrate();
    const s = useBaseLayerStore.getState();
    expect(s.baseLayerId).toBe(SIMPLIFIED_BASE_LAYER_ID);
    expect(s.hasHydrated).toBe(true);
  });

  test("unknown stored id is preserved (resolveDefaultBaseLayerId handles it at render time)", async () => {
    memoryStore.set(
      STORAGE_KEY,
      JSON.stringify({ state: { baseLayerId: "some-old-id" }, version: 0 }),
    );
    await useBaseLayerStore.persist.rehydrate();
    expect(useBaseLayerStore.getState().baseLayerId).toBe("some-old-id");
  });
});
