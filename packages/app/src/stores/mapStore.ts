import { create } from "zustand";

export interface MapState {
  center: [number, number];
  zoom: number;
  selectedTrailId: string | null;
  selectedSystemId: string | null;
  tileVersion: number;
  showHeatmap: boolean;
  setViewport: (center: [number, number], zoom: number) => void;
  selectTrail: (id: string | null) => void;
  selectSystem: (id: string | null) => void;
  incrementTileVersion: () => void;
  toggleHeatmap: () => void;
}

export const useMapStore = create<MapState>((set) => ({
  center: [-82.9988, 39.9612],
  zoom: 6,
  selectedTrailId: null,
  selectedSystemId: null,
  tileVersion: 0,
  showHeatmap: false,
  setViewport: (center, zoom) => set({ center, zoom }),
  selectTrail: (id) => set({ selectedTrailId: id }),
  selectSystem: (id) => set({ selectedSystemId: id }),
  incrementTileVersion: () => set((s) => ({ tileVersion: s.tileVersion + 1 })),
  toggleHeatmap: () => set((s) => ({ showHeatmap: !s.showHeatmap })),
}));
