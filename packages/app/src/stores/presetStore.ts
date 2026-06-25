import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createMagnumClient, type Preset } from "@magnum/shared";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

const STORAGE_KEY = "magnum_presets_cache_v1";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24h

interface CachedPresets {
  fetchedAt: number;
  items: Preset[];
}

export interface PresetStoreState {
  presets: Preset[];
  loading: boolean;
  error: string | null;
  lastFetched: number | null;
  fetchPresets: (force?: boolean) => Promise<void>;
  loadFromCache: () => Promise<void>;
  reset: () => void;
}

export const usePresetStore = create<PresetStoreState>((set, get) => ({
  presets: [],
  loading: false,
  error: null,
  lastFetched: null,

  loadFromCache: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as CachedPresets;
      set({ presets: parsed.items, lastFetched: parsed.fetchedAt });
    } catch {
      // ignore — cache is best-effort
    }
  },

  fetchPresets: async (force = false) => {
    const { lastFetched, presets } = get();
    if (!force && presets.length > 0 && lastFetched && Date.now() - lastFetched < CACHE_TTL_MS) {
      return;
    }
    set({ loading: true, error: null });
    try {
      const client = createMagnumClient(API_URL);
      const result = await client.raw.request<{ items: Preset[] }>("GET", "/api/presets");
      const items = result.items;
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ fetchedAt: Date.now(), items } satisfies CachedPresets),
      );
      set({ presets: items, lastFetched: Date.now(), loading: false });
    } catch (e) {
      // Network failure is expected offline — keep whatever we have.
      set({
        loading: false,
        error: e instanceof Error ? e.message : "Failed to load presets",
      });
    }
  },

  reset: () => set({ presets: [], lastFetched: null, error: null, loading: false }),
}));

/**
 * Group presets by category. The Add-Feature bottom sheet renders one
 * section per category, with the section order matching `CATEGORY_ORDER`
 * (most-frequent first, per the §21.4 spec).
 */
const CATEGORY_ORDER: Array<"navigation" | "landmarks" | "water_sanitation" | "rest_shelter" | "hazards_obstacles"> = [
  "navigation",
  "landmarks",
  "water_sanitation",
  "rest_shelter",
  "hazards_obstacles",
];

export function groupPresetsByCategory(presets: Preset[]): Array<{
  category: string;
  presets: Preset[];
}> {
  const groups = new Map<string, Preset[]>();
  for (const p of presets) {
    const arr = groups.get(p.category) ?? [];
    arr.push(p);
    groups.set(p.category, arr);
  }
  const ordered: Array<{ category: string; presets: Preset[] }> = [];
  for (const cat of CATEGORY_ORDER) {
    const arr = groups.get(cat);
    if (arr && arr.length > 0) {
      arr.sort((a, b) => a.sort_order - b.sort_order);
      ordered.push({ category: cat, presets: arr });
    }
  }
  // Tail: any unknown category.
  for (const [cat, arr] of groups) {
    if (!CATEGORY_ORDER.includes(cat as never)) {
      arr.sort((a, b) => a.sort_order - b.sort_order);
      ordered.push({ category: cat, presets: arr });
    }
  }
  return ordered;
}
