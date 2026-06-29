import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { MapContainer } from "@magnum/map";
import { useTraceStore, sessionElapsedMs } from "../../src/stores/traceStore";
import { useOfflineStore } from "../../src/stores/offlineStore";
import { AnnotationDock } from "../../src/components/trace/AnnotationDock";
import {
  startTraceRecording,
  pauseTraceRecording,
  resumeAfterPause,
  submitTraceSession,
  discardTraceSessionById,
  type TraceSession,
} from "../../src/services/backgroundGeolocationService";
import {
  getActiveTraceSession,
  listRecentTraceSessions,
  listTracePoints,
  type TraceSession as StoredSession,
} from "../../src/services/offlineDataService";
import { useTheme } from "../../src/providers/ThemeProvider";
import { radii, spacing, text as textTokens } from "../../src/theme/tokens";

const MARTIN_URL = process.env.EXPO_PUBLIC_MARTIN_URL ?? "http://localhost:3001";

/**
 * §21.6 / §TraceMode — "Record" tab. The home-screen entry point for
 * starting a trace. Idle state shows a big primary CTA; active state
 * shows the live map, stats, and the three core actions (pause,
 * submit, discard). Recent submitted/discarded traces appear below
 * the CTA in the idle state and below the live map in the active
 * state, so the user can review what they've recorded.
 */
export default function RecordScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const status = useTraceStore((s) => s.status);
  const activeSessionId = useTraceStore((s) => s.activeSessionId);
  const livePoints = useTraceStore((s) => s.livePoints);
  const error = useTraceStore((s) => s.error);
  const beginSession = useTraceStore((s) => s.beginSession);
  const setStatus = useTraceStore((s) => s.setStatus);
  const setPaused = useTraceStore((s) => s.setPaused);
  const endSession = useTraceStore((s) => s.endSession);
  const setError = useTraceStore((s) => s.setError);
  const isOnline = useOfflineStore((s) => s.isOnline);

  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<StoredSession[]>([]);
  const [persistedPoints, setPersistedPoints] = useState<Array<[number, number]>>([]);
  const [activeSession, setActiveSession] = useState<StoredSession | null>(null);

  const isWeb = Platform.OS === "web";
  const isActive = status === "recording" || status === "paused";
  // isMountedRef guards against setState after the screen unmounts
  // when a recording is in flight (e.g. user pops the tab).
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // On focus, re-read the active session from SQLite. This handles the
  // case where the user re-opens the tab after navigating away.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const active = await getActiveTraceSession();
          if (cancelled) return;
          setActiveSession(active);
          if (active && status === "idle") {
            // The recovery modal handles the Continue/End/Discard UI.
            // If the user dismisses it but then comes back to the
            // tab, re-surface the candidate so they can decide.
            useTraceStore.getState().setRecoveryCandidate(active);
          } else if (!active) {
            setPersistedPoints([]);
          }
          const recent = await listRecentTraceSessions(5);
          if (!cancelled) setRecent(recent);
        } catch (e) {
          console.warn("[record] focus load failed", e);
        }
      })();
      return () => {
        cancelled = true;
      };
      // The `status` dependency is intentionally only used to make
      // the effect re-run on transitions; we don't read it during
      // the effect body otherwise.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  // Pull persisted points for the live polyline. We re-read on every
  // point write so the SQLite row count is the source of truth.
  useEffect(() => {
    if (!activeSessionId) {
      setPersistedPoints([]);
      return;
    }
    let cancelled = false;
    const reload = async () => {
      try {
        const pts = await listTracePoints(activeSessionId);
        if (!cancelled) setPersistedPoints(pts.map((p) => [p.lon, p.lat]));
      } catch (e) {
        console.warn("[record] reload points failed", e);
      }
    };
    void reload();
    const id = setInterval(reload, 2_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [activeSessionId, livePoints.length]);

  const handleStart = useCallback(async () => {
    if (isWeb) {
      // Fall back to the legacy browser Geolocation API for the web
      // dev build. The native recording path is the production target.
      const res = await startWebBrowserRecording();
      if (res) beginSession(res);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const session = await startTraceRecording();
      if (!isMountedRef.current) return;
      beginSession(session);
      setActiveSession({
        id: session.id,
        started_at: session.started_at,
        ended_at: null,
        status: "recording",
        source: "recorded",
        total_points: 0,
        total_meters: 0,
        server_trace_id: null,
        pending_contribution_id: null,
        updated_at: session.updated_at,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start recording");
    } finally {
      if (isMountedRef.current) setBusy(false);
    }
  }, [beginSession, isWeb, setError]);

  const handlePauseToggle = useCallback(async () => {
    if (isWeb) return;
    setBusy(true);
    try {
      if (status === "paused") {
        await resumeAfterPause();
        setPaused(false);
      } else {
        await pauseTraceRecording();
        setPaused(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update tracking");
    } finally {
      if (isMountedRef.current) setBusy(false);
    }
  }, [setError, setPaused, status, isWeb]);

  const handleSubmit = useCallback(async () => {
    if (!activeSessionId) return;
    setStatus("submitting");
    setBusy(true);
    try {
      const res = await submitTraceSession(activeSessionId);
      if (res.error) {
        setError(res.error);
        setStatus("recording");
        return;
      }
      const newRecent = await listRecentTraceSessions(5);
      if (isMountedRef.current) setRecent(newRecent);
      setActiveSession(null);
      setPersistedPoints([]);
      endSession();
      Alert.alert(
        res.queued ? "Saved offline" : "Trace submitted",
        res.queued
          ? "You're offline. The trace was queued and will sync when you're back online."
          : "Your trace was uploaded. It's now in the synthesis queue.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit trace");
      setStatus("recording");
    } finally {
      if (isMountedRef.current) setBusy(false);
    }
  }, [activeSessionId, endSession, setError, setStatus]);

  const handleDiscard = useCallback(() => {
    if (!activeSessionId) return;
    Alert.alert("Discard trace?", "All recorded points will be lost. This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await discardTraceSessionById(activeSessionId);
            if (isMountedRef.current) {
              setActiveSession(null);
              setPersistedPoints([]);
              endSession();
            }
          } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to discard trace");
          } finally {
            if (isMountedRef.current) setBusy(false);
          }
        },
      },
    ]);
  }, [activeSessionId, endSession, setError]);

  // ----- Recovery flow: the TraceRecoveryModal handles its own
  // Continue / End & Save / Discard UI on app launch. The Record
  // tab only needs to surface the candidate again if the user
  // dismisses the modal and returns here — which the focus effect
  // above does via `setRecoveryCandidate`. -----

  const liveRouteCoords = useMemo<Array<[number, number]>>(() => {
    if (persistedPoints.length >= 2) return persistedPoints;
    if (livePoints.length >= 2) return livePoints.map((p) => [p.lon, p.lat] as [number, number]);
    return [];
  }, [livePoints, persistedPoints]);

  const followTarget = useMemo(() => {
    const tail = livePoints[livePoints.length - 1] ?? null;
    if (tail) return { lon: tail.lon, lat: tail.lat };
    if (persistedPoints.length > 0) {
      const last = persistedPoints[persistedPoints.length - 1]!;
      return { lon: last[0], lat: last[1] };
    }
    return null;
  }, [livePoints, persistedPoints]);

  useEffect(() => {
    console.log(
      "[record] state update: status=", status,
      "livePoints=", livePoints.length,
      "persistedPoints=", persistedPoints.length,
      "routeCoords=", liveRouteCoords.length,
      "followTarget=", followTarget ? `${followTarget.lon.toFixed(5)},${followTarget.lat.toFixed(5)}` : null,
    );
  }, [status, livePoints, persistedPoints, liveRouteCoords, followTarget]);

  const mapCenter = followTarget
    ? [followTarget.lon, followTarget.lat]
    : activeSession
      ? liveRouteCoords[0]
        ? liveRouteCoords[0]
        : [-82.9988, 39.9612]
      : [-82.9988, 39.9612];

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]} testID="record-screen">
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        testID="record-scroll"
      >
        {!isActive ? (
          <IdleView
            onStart={handleStart}
            busy={busy}
            isWeb={isWeb}
            isOnline={isOnline}
            onOpenFileImport={() => router.push("/trace/import" as never)}
            error={error}
          />
        ) : (
          <ActiveView
            isWeb={isWeb}
            error={error}
            livePoints={livePoints}
            persistedPoints={persistedPoints}
            liveRouteCoords={liveRouteCoords}
            mapCenter={mapCenter}
            followTarget={followTarget}
            onPauseToggle={handlePauseToggle}
            onSubmit={handleSubmit}
            onDiscard={handleDiscard}
          />
        )}

        {recent.length > 0 ? (
          <View style={styles.recentSection} testID="record-recent">
            <Text style={[styles.recentHeading, { color: colors.textMuted }]}>Recent</Text>
            {recent.map((s) => (
              <RecentRow
                key={s.id}
                session={s}
                onPress={
                  s.status === "submitted" && s.server_trace_id
                    ? () => router.push(`/trace/${s.server_trace_id}` as never)
                    : undefined
                }
              />
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

// ============================================================
// Idle state — big Start button + import link + recent list.
// ============================================================

function IdleView({
  onStart,
  busy,
  isWeb,
  isOnline,
  onOpenFileImport,
  error,
}: {
  onStart: () => void;
  busy: boolean;
  isWeb: boolean;
  isOnline: boolean;
  onOpenFileImport: () => void;
  error: string | null;
}) {
  const { colors } = useTheme();

  return (
    <View style={styles.idleContent} testID="record-idle">
      <View style={styles.idleHero}>
        <View style={[styles.idleIcon, { backgroundColor: colors.successMuted }]}>
          <Ionicons name="radio-button-on" size={56} color={colors.primary} />
        </View>
        <Text style={[styles.idleTitle, { color: colors.text }]}>Record a hike</Text>
        <Text style={[styles.idleSubtitle, { color: colors.textSecondary }]}>
          High-accuracy GPS tracking, even with the screen off. Your points save as they happen
          {isWeb ? " (browser fallback on web)" : ""}.
        </Text>
      </View>

      {error ? (
        <View style={[styles.errorBanner, { backgroundColor: colors.dangerMuted }]} testID="record-error">
          <Ionicons name="alert-circle" size={16} color={colors.danger} />
          <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
        </View>
      ) : null}

      <Pressable
        onPress={onStart}
        disabled={busy}
        style={({ pressed }) => [
          styles.startButton,
          { backgroundColor: colors.primary, shadowColor: colors.primary },
          pressed ? styles.startButtonPressed : null,
        ]}
        testID="record-start"
      >
        {busy ? (
          <ActivityIndicator color={colors.textInverse} />
        ) : (
          <>
            <Ionicons name="radio-button-on" size={22} color={colors.textInverse} />
            <Text style={[styles.startButtonText, { color: colors.textInverse }]}>Start recording</Text>
          </>
        )}
      </Pressable>

      <View style={styles.secondaryRow}>
        <Pressable
          onPress={onOpenFileImport}
          style={styles.secondaryBtn}
          testID="record-import-link"
        >
          <Ionicons name="document-text-outline" size={18} color={colors.primary} />
          <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>Import a GPX or GeoJSON file</Text>
        </Pressable>
      </View>

      <View style={styles.statusHint}>
        <Ionicons
          name={isOnline ? "cloud-done-outline" : "cloud-offline-outline"}
          size={14}
          color={isOnline ? colors.primary : colors.warning}
        />
        <Text style={[styles.statusHintText, { color: colors.textMuted }]}>
          {isOnline
            ? "Online — submitted traces upload immediately."
            : "Offline — submitted traces queue and sync when you're back online."}
        </Text>
      </View>
    </View>
  );
}

// ============================================================
// Active state — live map, stats, big actions.
// ============================================================

function ActiveView({
  isWeb,
  error,
  livePoints,
  persistedPoints,
  liveRouteCoords,
  mapCenter,
  followTarget,
  onPauseToggle,
  onSubmit,
  onDiscard,
}: {
  isWeb: boolean;
  error: string | null;
  livePoints: Array<{ lon: number; lat: number; recorded_at: string }>;
  persistedPoints: Array<[number, number]>;
  liveRouteCoords: Array<[number, number]>;
  mapCenter: number[];
  followTarget: { lon: number; lat: number } | null;
  onPauseToggle: () => void;
  onSubmit: () => void;
  onDiscard: () => void;
}) {
  const { colors } = useTheme();
  const status_ = useTraceStore((s) => s.status);
  const startedAt = useTraceStore((s) => s.startedAt);
  const totalPausedMs = useTraceStore((s) => s.totalPausedMs);
  const pausedAt = useTraceStore((s) => s.pausedAt);
  const totalMeters = useTraceStore((s) => s.totalMeters);
  const setTotalMeters = useTraceStore((s) => s.setTotalMeters);
  const isSubmitting = useTraceStore((s) => s.status === "submitting");
  const submitBusy = useTraceStore((s) => s.status === "submitting");

  const [flyTo, setFlyTo] = useState<{ lon: number; lat: number; zoom: number } | null>(null);

  const handleRecenter = useCallback(() => {
    if (followTarget) {
      setFlyTo({ lon: followTarget.lon, lat: followTarget.lat, zoom: 17 });
    }
  }, [followTarget]);

  // 1Hz elapsed ticker. Single timer; the displayed duration is
  // derived from sessionElapsedMs so a paused session freezes the
  // clock cleanly.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (status_ === "recording") {
      const id = setInterval(() => setNow(Date.now()), 1_000);
      return () => clearInterval(id);
    }
  }, [status_]);

  // Recompute total_meters as new points arrive. We use a memoized
  // walk over the persisted + live points. Cheap on long traces
  // because we only run when the array length changes.
  useEffect(() => {
    const coords: Array<[number, number]> =
      persistedPoints.length > 0
        ? persistedPoints
        : livePoints.map((p) => [p.lon, p.lat] as [number, number]);
    if (coords.length < 2) {
      if (totalMeters !== 0) setTotalMeters(0);
      return;
    }
    const cosLat = Math.cos((coords[0]![1] * Math.PI) / 180);
    let total = 0;
    for (let i = 1; i < coords.length; i++) {
      const [lon1, lat1] = coords[i - 1]!;
      const [lon2, lat2] = coords[i]!;
      const dx = (lon2 - lon1) * cosLat;
      const dy = lat2 - lat1;
      total += Math.hypot(dx, dy) * 111_320;
    }
    if (Math.abs(total - totalMeters) > 1) setTotalMeters(total);
  }, [livePoints, persistedPoints, totalMeters, setTotalMeters]);

  const elapsedMs = sessionElapsedMs(
    {
      status: status_,
      startedAt,
      pausedAt,
      totalPausedMs,
      livePoints: [],
      totalMeters,
      error: null,
      activeSessionId: null,
      recoveryCandidate: null,
    } as never,
    now,
  );

  return (
    <View style={styles.activeContent} testID="record-active">
      <View
        style={[
          styles.statusPill,
          { backgroundColor: status_ === "paused" ? colors.warningMuted : colors.dangerMuted },
        ]}
      >
        <View
          style={[
            styles.statusPillDot,
            { backgroundColor: status_ === "paused" ? colors.warning : colors.danger },
          ]}
        />
        <Text style={[styles.statusPillText, { color: colors.text }]}>
          {isSubmitting
            ? "Submitting…"
            : status_ === "paused"
              ? "Paused"
              : "Recording"}
        </Text>
      </View>

      <View style={[styles.mapWrap, { backgroundColor: colors.surfaceMutedStrong }]} testID="record-map">
        <MapContainer
          config={{
            martinTilesUrl: MARTIN_URL,
            initialCenter: [mapCenter[0]!, mapCenter[1]!],
            initialZoom: 15,
          }}
          liveRoute={
            liveRouteCoords.length >= 2
              ? {
                  coordinates: liveRouteCoords,
                  followLon: followTarget?.lon ?? null,
                  followLat: followTarget?.lat ?? null,
                }
              : null
          }
          flyTo={flyTo}
        />
        {followTarget ? (
          <Pressable
            onPress={handleRecenter}
            style={({ pressed }) => [
              styles.recenterBtn,
              { backgroundColor: colors.bg, shadowColor: colors.shadow },
              pressed && styles.recenterBtnPressed,
            ]}
            testID="record-recenter"
          >
            <Ionicons name="locate" size={20} color={colors.text} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.statsRow}>
        <Stat label="Duration" value={formatDuration(Math.floor(elapsedMs / 1000))} />
        <Stat
          label="Distance"
          value={
            totalMeters >= 1000
              ? `${(totalMeters / 1000).toFixed(2)} km`
              : `${totalMeters.toFixed(0)} m`
          }
        />
        <Stat label="Points" value={String(Math.max(persistedPoints.length, livePoints.length))} />
      </View>

      {error ? (
        <View style={[styles.errorBanner, { backgroundColor: colors.dangerMuted }]} testID="record-error">
          <Ionicons name="alert-circle" size={16} color={colors.danger} />
          <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
        </View>
      ) : null}

      <AnnotationDock />

      <View style={styles.actionsRow}>
        <Pressable
          onPress={onPauseToggle}
          disabled={submitBusy}
          style={({ pressed }) => [
            styles.actionBtn,
            { backgroundColor: colors.surfaceMutedStrong },
            pressed ? styles.actionBtnPressed : null,
          ]}
          testID="record-pause-toggle"
        >
          <Ionicons
            name={status_ === "paused" ? "play" : "pause"}
            size={20}
            color={status_ === "paused" ? colors.primary : colors.text}
          />
          <Text style={[styles.pauseBtnText, { color: colors.text }]}>{status_ === "paused" ? "Resume" : "Pause"}</Text>
        </Pressable>
        <Pressable
          onPress={onSubmit}
          disabled={submitBusy || liveRouteCoords.length < 2}
          style={({ pressed }) => [
            styles.actionBtn,
            { backgroundColor: colors.primary },
            pressed ? styles.actionBtnPressed : null,
          ]}
          testID="record-submit"
        >
          {submitBusy ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <>
              <Ionicons name="checkmark" size={20} color={colors.textInverse} />
              <Text style={[styles.submitBtnText, { color: colors.textInverse }]}>Submit</Text>
            </>
          )}
        </Pressable>
      </View>
      <Pressable
        onPress={onDiscard}
        disabled={submitBusy}
        style={({ pressed }) => [
          styles.discardBtn,
          pressed ? styles.discardBtnPressed : null,
        ]}
        testID="record-discard"
      >
        <Ionicons name="trash-outline" size={16} color={colors.danger} />
        <Text style={[styles.discardBtnText, { color: colors.danger }]}>Discard trace</Text>
      </Pressable>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();

  return (
    <View style={[styles.statBox, { backgroundColor: colors.surfaceMuted }]}>
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

function RecentRow({
  session,
  onPress,
}: {
  session: StoredSession;
  onPress?: () => void;
}) {
  const { colors } = useTheme();

  const started = new Date(session.started_at);
  const dateLabel = started.toLocaleDateString();
  const timeLabel = started.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const distanceLabel =
    session.total_meters >= 1000
      ? `${(session.total_meters / 1000).toFixed(1)} km`
      : `${session.total_meters.toFixed(0)} m`;
  const subtitle =
    session.status === "submitted"
      ? session.pending_contribution_id != null
        ? `${dateLabel} · queued offline · ${distanceLabel} · ${session.total_points} pts`
        : `${dateLabel} · ${distanceLabel} · ${session.total_points} pts`
      : `${dateLabel} · ${distanceLabel} · ${session.status}`;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.recentRow,
        { backgroundColor: colors.surfaceMuted },
        pressed && onPress ? styles.recentRowPressed : null,
      ]}
      testID={`record-recent-${session.id}`}
    >
      <View style={styles.recentRowMain}>
        <Text style={[styles.recentRowTime, { color: colors.text }]}>{timeLabel}</Text>
        <Text style={[styles.recentRowSub, { color: colors.textMuted }]}>{subtitle}</Text>
      </View>
      <Ionicons
        name={
          session.status === "submitted"
            ? session.pending_contribution_id != null
              ? "cloud-offline-outline"
              : "cloud-done-outline"
            : "ellipse-outline"
        }
        size={16}
        color={session.status === "submitted" ? colors.primary : colors.textMuted}
      />
    </Pressable>
  );
}

function formatDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/**
 * Web-only fallback: wraps `navigator.geolocation.watchPosition` in a
 * shape compatible with the live store. We don't persist these points
 * to SQLite on web; they're held in memory and submitted via
 * `createTrace` when the user taps Submit.
 */
async function startWebBrowserRecording(): Promise<TraceSession | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    Alert.alert(
      "Geolocation unavailable",
      "This browser does not expose geolocation. Use the native Android/iOS build for the full recording experience.",
    );
    return null;
  }
  const id = `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const session: TraceSession = {
    id,
    started_at: new Date().toISOString(),
    ended_at: null,
    status: "recording",
    source: "recorded",
    total_points: 0,
    total_meters: 0,
    server_trace_id: null,
    pending_contribution_id: null,
    updated_at: new Date().toISOString(),
  };
  navigator.geolocation.watchPosition(
    (pos) => {
      useTraceStore.getState().appendPoint({
        lon: pos.coords.longitude,
        lat: pos.coords.latitude,
        recorded_at: new Date(pos.timestamp).toISOString(),
        elevation: pos.coords.altitude ?? null,
        accuracy: pos.coords.accuracy ?? null,
        speed: pos.coords.speed ?? null,
        heading: pos.coords.heading ?? null,
      });
    },
    (err) => {
      console.warn("[record] web geolocation error", err);
    },
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 30000 },
  );
  return session;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40, gap: 16 },

  // ---- Idle ----
  idleContent: { gap: 16 },
  idleHero: { alignItems: "center", paddingVertical: 24, gap: 8 },
  idleIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  idleTitle: { fontSize: 24, fontWeight: "700" },
  idleSubtitle: {
    fontSize: 13,
    textAlign: "center",
    paddingHorizontal: 16,
    lineHeight: 18,
  },
  startButton: {
    paddingVertical: 18,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  startButtonPressed: { opacity: 0.85 },
  startButtonText: { fontSize: 17, fontWeight: "700" },
  secondaryRow: { flexDirection: "row", justifyContent: "center" },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  secondaryBtnText: { fontSize: 13, fontWeight: "600" },
  statusHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 4,
  },
  statusHintText: { fontSize: 12, flex: 1 },

  // ---- Active ----
  activeContent: { gap: 12 },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    gap: 6,
  },
  statusPillDot: { width: 8, height: 8, borderRadius: 4 },
  statusPillText: { fontSize: 12, fontWeight: "700" },
  mapWrap: {
    height: 280,
    borderRadius: 12,
    overflow: "hidden",
  },
  recenterBtn: {
    position: "absolute",
    bottom: 10,
    right: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  recenterBtnPressed: { opacity: 0.75 },
  statsRow: { flexDirection: "row", gap: 8 },
  statBox: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  statValue: { fontSize: 18, fontWeight: "700" },
  statLabel: { fontSize: 11, marginTop: 2 },

  actionsRow: { flexDirection: "row", gap: 8 },
  actionBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  actionBtnPressed: { opacity: 0.8 },
  pauseBtnText: { fontSize: 15, fontWeight: "700" },
  submitBtnText: { fontSize: 15, fontWeight: "700" },
  discardBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
  },
  discardBtnPressed: { opacity: 0.7 },
  discardBtnText: { fontSize: 13, fontWeight: "600" },

  // ---- Recent ----
  recentSection: { gap: 8 },
  recentHeading: { fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 10,
  },
  recentRowPressed: { opacity: 0.7 },
  recentRowMain: { flex: 1, gap: 2 },
  recentRowTime: { fontSize: 14, fontWeight: "600" },
  recentRowSub: { fontSize: 12 },

  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 10,
    borderRadius: 6,
  },
  errorText: { fontSize: 12, flex: 1 },
});
