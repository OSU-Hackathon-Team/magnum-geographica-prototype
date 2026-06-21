import { create } from "zustand";

export type ThemeMode = "light" | "dark" | "system";

export interface UiState {
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;
}

export const useUiStore = create<UiState>((set) => ({
  theme: "system",
  setTheme: (theme) => set({ theme }),
}));
