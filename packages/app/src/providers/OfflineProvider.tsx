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
  //   device.launchApp({ url: ".../expo-development-client/?url=...&offlineMode=true" })
  // which lands here.  The Expo dev-client URL is read via
  // expo-linking's getInitialURL() (not useURL() — that hook starts as
  // null and the enclosing useEffect would already have finished).
  useEffect(() => {
    if (Platform.OS !== "web") {
      let cancelled = false;
      (async () => {
        try {
          const Linking = await import("expo-linking");
          if (cancelled) return;
          const url = await Linking.getInitialURL();
          console.log("[OfflineProvider] getInitialURL =", url);
          if (url && url.includes("offline")) {
            console.log("[OfflineProvider] forcing offline via deep link");
            setOnline(false);
          }
        } catch (e) {
          console.warn("[OfflineProvider] expo-linking unavailable:", e);
        }
      })();
      return () => {
        cancelled = true;
      };
    }
  }, [setOnline]);

  useEffect(() => {
    let unsubNetInfo: (() => void) | null = null;
    let cancelled = false;

    if (
      Platform.OS === "web" &&
      typeof window !== "undefined" &&
      typeof window.addEventListener === "function"
    ) {
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
        // Default to online until NetInfo confirms otherwise. The store
        // already starts as `isOnline: true`; the listener below will flip
        // us to offline only when the device actually reports it. This
        // avoids the brief offline-during-boot window where NetInfo may
        // transiently report `isConnected: false` before the network is
        // fully up — which would otherwise put the map in offline mode
        // and try to load tiles from a non-existent local store.
        unsubNetInfo = NetInfo.default.addEventListener((state) => {
          if (cancelled) return;
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
    // If the user opens the app offline, the IP fetch on auth-load
    // fails and the contributor stays "anonymous". Re-attempt on every
    // transition back to online so the IP attribution kicks in as soon
    // as the network is available.
    if (!useAuthStore.getState().isAuthenticated) {
      void useAuthStore.getState().fetchIpContributor();
    }
    let cancelled = false;
    const lastSyncedKey = "magnum.lastSyncedAt";

    const doSync = async () => {
      if (cancelled) return;
      setSyncState("syncing");
      try {
        const { synced, conflicts } = await syncContributions(contributorName);
        const sinceRaw =
          typeof window !== "undefined" ? window.localStorage?.getItem(lastSyncedKey) : null;
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
