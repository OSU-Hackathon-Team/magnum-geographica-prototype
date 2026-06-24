import { useEffect, type ReactNode } from "react";
import { Platform } from "react-native";
import { useOfflineStore } from "../stores/offlineStore";
import { getPendingCount } from "../services/offlineDataService";
import { loadOfflineRegionsIntoStore } from "../services/offlinePackService";
import { syncContributions, fetchUpdates } from "../services/syncService";
import { useAuthStore } from "../stores/authStore";

async function refreshFromDb() {
  try {
    const count = await getPendingCount();
    useOfflineStore.getState().setPendingCount(count);
  } catch {
    // DB not ready
  }
  try {
    await loadOfflineRegionsIntoStore();
  } catch {
    // DB not ready
  }
}

export function OfflineProvider({ children }: { children: ReactNode }) {
  const setOnline = useOfflineStore((s) => s.setOnline);
  const isOnline = useOfflineStore((s) => s.isOnline);
  const setSyncState = useOfflineStore((s) => s.setSyncState);
  const contributorName = useAuthStore((s) => s.contributorName);

  // Detox e2e tests cannot toggle airplane mode (it kills the adb reverse
  // bridge that Metro depends on).  Instead they launch the app with
  //   device.launchApp({ url: "magnum://offline" })
  // which lands here and forces the store into offline mode so the app
  // reads from the local SQLite database.
  useEffect(() => {
    if (Platform.OS !== "web") {
      try {
        const { useURL } = require("expo-linking");
        const url = useURL();
        if (url && url.includes("offline")) {
          setOnline(false);
        }
      } catch { /* expo-linking not available — skip */ }
    }
  }, [setOnline]);

  useEffect(() => {
    let unsubNetInfo: (() => void) | null = null;
    let cancelled = false;

    if (Platform.OS === "web" && typeof window !== "undefined" && typeof window.addEventListener === "function") {
      const handleOnline = () => setOnline(true);
      const handleOffline = () => setOnline(false);
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
      setOnline(window.navigator.onLine);
      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      };
    }

    (async () => {
      try {
        const NetInfo = await import("@react-native-community/netinfo");
        if (cancelled) return;
        const initial = await NetInfo.default.fetch();
        setOnline(Boolean(initial.isConnected && initial.isInternetReachable !== false));
        unsubNetInfo = NetInfo.default.addEventListener((state) => {
          const online = Boolean(state.isConnected && state.isInternetReachable !== false);
          setOnline(online);
        });
      } catch (e) {
        console.warn("NetInfo unavailable, assuming online", e);
        setOnline(true);
      }
    })();

    return () => {
      cancelled = true;
      if (unsubNetInfo) unsubNetInfo();
    };
  }, [setOnline]);

  useEffect(() => {
    void refreshFromDb();
  }, []);

  useEffect(() => {
    if (!isOnline) return;
    let cancelled = false;
    const lastSyncedKey = "magnum.lastSyncedAt";

    const doSync = async () => {
      if (cancelled) return;
      setSyncState("syncing");
      try {
        const { synced, conflicts } = await syncContributions(contributorName);
        const sinceRaw = typeof window !== "undefined" ? window.localStorage?.getItem(lastSyncedKey) : null;
        const since = sinceRaw ?? "1970-01-01T00:00:00.000Z";
        const updateCount = await fetchUpdates(since);
        if (typeof window !== "undefined" && window.localStorage) {
          window.localStorage.setItem(lastSyncedKey, new Date().toISOString());
        }
        if (synced > 0 || conflicts > 0 || updateCount > 0) {
          await refreshFromDb();
        }
        setSyncState("idle");
      } catch (e) {
        console.warn("Sync failed", e);
        setSyncState("error");
      }
    };

    const timer = setTimeout(doSync, 1000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isOnline, contributorName, setSyncState]);

  return <>{children}</>;
}
