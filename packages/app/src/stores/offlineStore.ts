import { create } from "zustand";

export type SyncState = "idle" | "syncing" | "error";

export interface DownloadedPack {
  systemId: string;
  systemName: string;
  tileSizeBytes: number;
  geojsonSizeBytes: number;
  wikiSizeBytes: number;
  generatedAt: string | null;
  lastSynced: string | null;
}

export interface OfflineState {
  isOnline: boolean;
  pendingCount: number;
  syncState: SyncState;
  downloadedPacks: DownloadedPack[];
  setOnline: (online: boolean) => void;
  setPendingCount: (n: number) => void;
  setSyncState: (s: SyncState) => void;
  setDownloadedPacks: (packs: DownloadedPack[]) => void;
  addDownloadedPack: (pack: DownloadedPack) => void;
  removeDownloadedPack: (systemId: string) => void;
}

export const useOfflineStore = create<OfflineState>((set) => ({
  isOnline: true,
  pendingCount: 0,
  syncState: "idle",
  downloadedPacks: [],
  setOnline: (online) => set({ isOnline: online }),
  setPendingCount: (n) => set({ pendingCount: n }),
  setSyncState: (s) => set({ syncState: s }),
  setDownloadedPacks: (packs) => set({ downloadedPacks: packs }),
  addDownloadedPack: (pack) =>
    set((s) => ({
      downloadedPacks: [
        ...s.downloadedPacks.filter((p) => p.systemId !== pack.systemId),
        pack,
      ],
    })),
  removeDownloadedPack: (systemId) =>
    set((s) => ({
      downloadedPacks: s.downloadedPacks.filter((p) => p.systemId !== systemId),
    })),
}));
