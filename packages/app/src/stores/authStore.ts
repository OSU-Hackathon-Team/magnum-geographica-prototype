import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createMagnumClient } from "@magnum/shared/api/endpoints";
import type { User } from "@magnum/shared/types";

const TOKEN_KEY = "magnum_auth_token";
const REFRESH_KEY = "magnum_refresh_token";
const USER_KEY = "magnum_user";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: User | null;
  contributorName: string;
  isIpContributor: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;

  setContributorName: (name: string) => void;
  setAuth: (token: string, refreshToken: string, user: User) => Promise<void>;
  setToken: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  loadStoredAuth: () => Promise<void>;
  fetchIpContributor: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  refreshToken: null,
  user: null,
  contributorName: "anonymous",
  isIpContributor: false,
  isAuthenticated: false,
  isAdmin: false,
  isLoading: true,

  setContributorName: (name: string) => {
    const trimmed = name.trim() || "anonymous";
    set({ contributorName: trimmed, isIpContributor: false });
  },

  setAuth: async (token: string, refreshToken: string, user: User) => {
    await AsyncStorage.multiSet([
      [TOKEN_KEY, token],
      [REFRESH_KEY, refreshToken],
      [USER_KEY, JSON.stringify(user)],
    ]);
    set({
      token,
      refreshToken,
      user,
      isAuthenticated: true,
      isAdmin: user.role === "admin" || user.role === "moderator",
      contributorName: user.username,
      isIpContributor: false,
      isLoading: false,
    });
  },

  setToken: async (token: string) => {
    await AsyncStorage.setItem(TOKEN_KEY, token);
    set({ token });
  },

  logout: async () => {
    await AsyncStorage.multiRemove([TOKEN_KEY, REFRESH_KEY, USER_KEY]);
    set({
      token: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,
      isAdmin: false,
      contributorName: "anonymous",
      isIpContributor: false,
      isLoading: false,
    });
    void get().fetchIpContributor();
  },

  loadStoredAuth: async () => {
    try {
      const entries = await AsyncStorage.multiGet([TOKEN_KEY, REFRESH_KEY, USER_KEY]);
      const token = entries[0]?.[1] ?? null;
      const refreshToken = entries[1]?.[1] ?? null;
      const userJson = entries[2]?.[1] ?? null;
      if (token && refreshToken && userJson) {
        const user = JSON.parse(userJson) as User;
        set({
          token,
          refreshToken,
          user,
          isAuthenticated: true,
          isAdmin: user.role === "admin" || user.role === "moderator",
          contributorName: user.username,
          isIpContributor: false,
          isLoading: false,
        });
      } else {
        set({ isLoading: false });
        void get().fetchIpContributor();
      }
    } catch {
      set({ isLoading: false });
      void get().fetchIpContributor();
    }
  },

  // Wikipedia-style anonymous attribution: the server reports the client's
  // public IP, and we use "IP:<address>" as the contributor name for
  // unauthenticated edits. The IP is fetched fresh on each app start
  // (not persisted) so it tracks the current network.
  fetchIpContributor: async () => {
    try {
      const client = createMagnumClient(API_URL);
      const { ip } = await client.getClientIp();
      if (!ip) return;
      if (get().isAuthenticated) return;
      set({ contributorName: `IP:${ip}`, isIpContributor: true });
    } catch {
      // Leave the contributor as the default "anonymous" fallback.
    }
  },
}));
