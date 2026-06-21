import { create } from "zustand";

export type SyncState = "idle" | "syncing" | "error";

export interface OfflineState {
  isOnline: boolean;
  pendingCount: number;
  syncState: SyncState;
  setOnline: (online: boolean) => void;
  setPendingCount: (n: number) => void;
  setSyncState: (s: SyncState) => void;
}

export const useOfflineStore = create<OfflineState>((set) => ({
  isOnline: true,
  pendingCount: 0,
  syncState: "idle",
  setOnline: (online) => set({ isOnline: online }),
  setPendingCount: (n) => set({ pendingCount: n }),
  setSyncState: (s) => set({ syncState: s }),
}));
