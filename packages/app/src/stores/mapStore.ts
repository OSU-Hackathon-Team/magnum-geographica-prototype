import { create } from "zustand";

export interface MapState {
  center: [number, number];
  zoom: number;
  selectedTrailId: string | null;
  selectedSystemId: string | null;
  setViewport: (center: [number, number], zoom: number) => void;
  selectTrail: (id: string | null) => void;
  selectSystem: (id: string | null) => void;
}

export const useMapStore = create<MapState>((set) => ({
  center: [-82.9988, 39.9612],
  zoom: 6,
  selectedTrailId: null,
  selectedSystemId: null,
  setViewport: (center, zoom) => set({ center, zoom }),
  selectTrail: (id) => set({ selectedTrailId: id }),
  selectSystem: (id) => set({ selectedSystemId: id }),
}));
