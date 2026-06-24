import { create } from "zustand";

export type SyncState = "idle" | "syncing" | "error";

export interface OfflineRegion {
  id: string;
  name: string;
  baseLayerId: string;
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
  minZoom: number;
  maxZoom: number;
  totalTiles: number;
  tileSizeBytes: number;
  geojsonSizeBytes: number;
  wikiSizeBytes: number;
  tilesPath: string | null;
  generatedAt: string | null;
  lastSynced: string | null;
  createdAt: string;
}

export interface OfflineState {
  isOnline: boolean;
  pendingCount: number;
  syncState: SyncState;
  offlineRegions: OfflineRegion[];
  setOnline: (online: boolean) => void;
  setPendingCount: (n: number) => void;
  setSyncState: (s: SyncState) => void;
  setOfflineRegions: (regions: OfflineRegion[]) => void;
  addOfflineRegion: (region: OfflineRegion) => void;
  removeOfflineRegion: (id: string) => void;
}

export const useOfflineStore = create<OfflineState>((set) => ({
  isOnline: true,
  pendingCount: 0,
  syncState: "idle",
  offlineRegions: [],
  setOnline: (online) => set({ isOnline: online }),
  setPendingCount: (n) => set({ pendingCount: n }),
  setSyncState: (s) => set({ syncState: s }),
  setOfflineRegions: (regions) => set({ offlineRegions: regions }),
  addOfflineRegion: (region) =>
    set((s) => ({
      offlineRegions: [...s.offlineRegions.filter((r) => r.id !== region.id), region],
    })),
  removeOfflineRegion: (id) =>
    set((s) => ({
      offlineRegions: s.offlineRegions.filter((r) => r.id !== id),
    })),
}));
