import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SIMPLIFIED_BASE_LAYER_ID, type BaseLayerDef, type BaseLayerKind } from "@magnum/map";

export type { BaseLayerDef, BaseLayerKind };

export interface BaseLayerState {
  baseLayerId: string;
  hasHydrated: boolean;
  setBaseLayerId: (id: string) => void;
  _setHasHydrated: (v: boolean) => void;
}

export const useBaseLayerStore = create<BaseLayerState>()(
  persist(
    (set) => ({
      baseLayerId: SIMPLIFIED_BASE_LAYER_ID,
      hasHydrated: false,
      setBaseLayerId: (id) => set({ baseLayerId: id }),
      _setHasHydrated: (v) => set({ hasHydrated: v }),
    }),
    {
      name: "magnum.baseLayer.v1",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ baseLayerId: state.baseLayerId }),
      onRehydrateStorage: () => (state) => {
        state?._setHasHydrated(true);
      },
    },
  ),
);
