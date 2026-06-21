import { useEffect, type ReactNode } from "react";
import { useOfflineStore } from "../stores/offlineStore";

export function OfflineProvider({ children }: { children: ReactNode }) {
  const setOnline = useOfflineStore((s) => s.setOnline);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
      setOnline(window.navigator.onLine);
      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      };
    }
  }, [setOnline]);

  return <>{children}</>;
}
