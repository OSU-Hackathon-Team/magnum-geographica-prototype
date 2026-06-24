import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { User } from "@magnum/shared/types";

const TOKEN_KEY = "magnum_auth_token";
const REFRESH_KEY = "magnum_refresh_token";
const USER_KEY = "magnum_user";

export interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: User | null;
  contributorName: string;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;

  setContributorName: (name: string) => void;
  setAuth: (token: string, refreshToken: string, user: User) => Promise<void>;
  setToken: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  loadStoredAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  refreshToken: null,
  user: null,
  contributorName: "anonymous",
  isAuthenticated: false,
  isAdmin: false,
  isLoading: true,

  setContributorName: (name: string) => {
    set({ contributorName: name.trim() || "anonymous" });
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
      isLoading: false,
    });
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
          isLoading: false,
        });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },
}));
