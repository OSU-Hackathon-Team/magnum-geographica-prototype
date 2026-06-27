import { create } from "zustand";

export interface MapState {
  center: [number, number];
  zoom: number;
  showHeatmap: boolean;

  // Per-layer tile version counters.  Each increments independently
  // so editing a system only invalidates system tiles, not trail
  // tiles.  The map effect swaps the Martin source slot (0 ↔ 1)
  // for the affected layer, forcing Martin to serve fresh tiles.
  systemTileVersion: number;
  trailTileVersion: number;
  segmentTileVersion: number;
  featureTileVersion: number;
  superSystemTileVersion: number;

  setViewport: (center: [number, number], zoom: number) => void;
  toggleHeatmap: () => void;
  setShowHeatmap: (v: boolean) => void;
  incrementSystemTileVersion: () => void;
  incrementTrailTileVersion: () => void;
  incrementSegmentTileVersion: () => void;
  incrementFeatureTileVersion: () => void;
  incrementSuperSystemTileVersion: () => void;
}

export const useMapStore = create<MapState>((set) => ({
  center: [-82.9988, 39.9612],
  zoom: 6,
  showHeatmap: false,

  systemTileVersion: 0,
  trailTileVersion: 0,
  segmentTileVersion: 0,
  featureTileVersion: 0,
  superSystemTileVersion: 0,

  setViewport: (center, zoom) => set({ center, zoom }),
  toggleHeatmap: () => set((s) => ({ showHeatmap: !s.showHeatmap })),
  setShowHeatmap: (v) => set({ showHeatmap: v }),
  incrementSystemTileVersion: () =>
    set((s) => ({ systemTileVersion: s.systemTileVersion + 1 })),
  incrementTrailTileVersion: () =>
    set((s) => ({ trailTileVersion: s.trailTileVersion + 1 })),
  incrementSegmentTileVersion: () =>
    set((s) => ({ segmentTileVersion: s.segmentTileVersion + 1 })),
  incrementFeatureTileVersion: () =>
    set((s) => ({ featureTileVersion: s.featureTileVersion + 1 })),
  incrementSuperSystemTileVersion: () =>
    set((s) => ({ superSystemTileVersion: s.superSystemTileVersion + 1 })),
}));
