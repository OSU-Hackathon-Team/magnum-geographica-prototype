import { create } from "zustand";

export interface AuthState {
  contributorName: string;
  setContributorName: (name: string) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  contributorName: "anonymous",
  setContributorName: (name) => set({ contributorName: name.trim() || "anonymous" }),
}));
