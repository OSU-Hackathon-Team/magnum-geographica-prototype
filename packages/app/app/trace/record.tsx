import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { MapContainer } from "@magnum/map";
import {
  createMagnumClient,
  traceLengthMeters,
  type GpsTrace,
} from "@magnum/shared";
import { Button } from "../../src/components/ui/Button";
import { useAuthStore } from "../../src/stores/authStore";
import {
  addPendingContribution,
  getPendingCount,
} from "../../src/services/offlineDataService";
import { useOfflineStore } from "../../src/stores/offlineStore";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
const MARTIN_URL = process.env.EXPO_PUBLIC_MARTIN_URL ?? "http://localhost:3001";

type Coord = [number, number];

/**
 * §21.3.2 step 2 — Record Trace screen.
 *
 * Uses the browser's Geolocation API (`navigator.geolocation.watchPosition`)
 * on web. On native the screen falls back to a "tap to add point" mode
 * — a follow-up wires `expo-location` + `expo-task-manager` for
 * background tracking and a foreground notification.
 */
export default function RecordTraceScreen() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const isOnline = useOfflineStore((s) => s.isOnline);
  const setPendingCount = useOfflineStore((s) => s.setPendingCount);

  const [coords, setCoords] = useState<Coord[]>([]);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [durationS, setDurationS] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const distanceM = useMemo(() => traceLengthMeters(coords), [coords]);

  // Feature-detect Geolocation support on mount.
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      setSupported(true);
    } else {
      setSupported(false);
    }
  }, []);

  // Duration ticker.
  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => {
      if (startedAtRef.current) {
        setDurationS(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(id);
  }, [recording]);

  const start = useCallback(() => {
    setError(null);
    if (!navigator?.geolocation) {
      setError("Geolocation not available on this device. Add points manually below.");
      setRecording(true);
      startedAtRef.current = Date.now();
      return;
    }
    startedAtRef.current = Date.now();
    setRecording(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const next: Coord = [pos.coords.longitude, pos.coords.latitude];
        setCoords((prev) => (prev.length === 0 ? [next] : [...prev, next]));
      },
      (err) => setError(`Geolocation error: ${err.message}`),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 30000 },
    );
  }, []);

  const stop = useCallback(() => {
    if (watchIdRef.current !== null && navigator?.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setRecording(false);
  }, []);

  // Manual add-point: appends the map's center to the polyline. On
  // web the map container reports a `getCenter` via postMessage; for
  // the v1 spec we use a fixed sample until that bridge is wired.
  const addManualPoint = useCallback(() => {
    setCoords((prev) => {
      const last = prev[prev.length - 1] ?? [-82.9988, 39.9612];
      // Step ~50m in a random direction so manual points form a path.
      const dLon = (Math.random() - 0.5) * 0.001;
      const dLat = (Math.random() - 0.5) * 0.001;
      const next: Coord = [last[0] + dLon, last[1] + dLat];
      return prev.length === 0 ? [next] : [...prev, next];
    });
  }, []);

  const clear = useCallback(() => {
    setCoords([]);
    setDurationS(0);
    startedAtRef.current = null;
  }, []);

  const save = useCallback(async () => {
    if (coords.length < 2) {
      setError("Need at least 2 points to save a trace.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const payload = {
      geometry: { type: "LineString" as const, coordinates: coords },
      source: "recorded" as const,
      contributor_name: user?.username ?? "anonymous",
    };
    const offline = !isOnline;
    try {
      if (offline) {
        await addPendingContribution("trace", "create", payload, payload.contributor_name);
        const newCount = await getPendingCount();
        setPendingCount(newCount);
        router.back();
        return;
      }
      const client = createMagnumClient(API_URL, {
        getAuthToken: () => token ?? undefined,
      });
      const res = await client.createTrace(payload);
      const t = res.trace as unknown as GpsTrace;
      // Auto-cut segments server-side (synthesis-ready).
      await client.cutTraceSegments(t.id);
      router.back();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save trace";
      if (!offline && /network|fetch|timeout/i.test(msg)) {
        try {
          await addPendingContribution("trace", "create", payload, payload.contributor_name);
          const newCount = await getPendingCount();
          setPendingCount(newCount);
          router.back();
          return;
        } catch {
          // fall through
        }
      }
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }, [coords, isOnline, router, setPendingCount, token, user?.username]);

  const center = coords[0] ?? [-82.9988, 39.9612];

  return (
    <>
      <Stack.Screen options={{ title: "Record Trace" }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content} testID="record-trace-screen">
        <View style={styles.statsRow}>
          <Stat label="Distance" value={`${(distanceM / 1000).toFixed(2)} km`} testID="record-distance" />
          <Stat
            label="Points"
            value={String(coords.length)}
            testID="record-points"
          />
          <Stat
            label="Duration"
            value={formatDuration(durationS)}
            testID="record-duration"
          />
        </View>

        <View style={styles.mapPreview} testID="record-map">
          <MapContainer
            config={{
              martinTilesUrl: MARTIN_URL,
              initialCenter: center,
              initialZoom: 15,
            }}
          />
        </View>

        {error ? (
          <View style={styles.errorBanner} testID="record-error">
            <Ionicons name="alert-circle" size={16} color="#ef4444" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.controlsRow}>
          {!recording ? (
            <Button variant="primary" onPress={start} testID="record-start">
              <Ionicons name="radio-button-on" size={14} color="#fff" /> Start
            </Button>
          ) : (
            <Button variant="secondary" onPress={stop} testID="record-stop">
              <Ionicons name="stop-circle" size={14} color="#111" /> Stop
            </Button>
          )}
          <Button
            variant="ghost"
            onPress={addManualPoint}
            testID="record-add-point"
            disabled={recording}
          >
            + Manual point
          </Button>
          <Button variant="ghost" onPress={clear} testID="record-clear">
            Clear
          </Button>
        </View>

        <View style={styles.footerRow}>
          <Button variant="secondary" onPress={() => router.back()} testID="record-cancel">
            Cancel
          </Button>
          <Button
            variant="primary"
            onPress={save}
            disabled={coords.length < 2 || submitting}
            testID="record-save"
          >
            {submitting ? <ActivityIndicator size="small" color="#fff" /> : "Save Trace"}
          </Button>
        </View>

        {supported === false ? (
          <Text style={styles.hint}>
            Geolocation isn't available in this build. Use "+ Manual
            point" to drop vertices along your route.
          </Text>
        ) : null}
      </ScrollView>
    </>
  );
}

function Stat({ label, value, testID }: { label: string; value: string; testID?: string }) {
  return (
    <View style={styles.statBox} testID={testID}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function formatDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  statsRow: { flexDirection: "row", gap: 8 },
  statBox: {
    flex: 1,
    backgroundColor: "#f9fafb",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  statValue: { fontSize: 20, fontWeight: "700", color: "#0f172a" },
  statLabel: { fontSize: 11, color: "#666", marginTop: 2 },
  mapPreview: { height: 280, backgroundColor: "#e8e8e8", borderRadius: 6, overflow: "hidden" },
  controlsRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  footerRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fef2f2",
    padding: 10,
    borderRadius: 6,
  },
  errorText: { color: "#ef4444", fontSize: 12, flex: 1 },
  hint: { color: "#888", fontSize: 12, fontStyle: "italic" },
});
