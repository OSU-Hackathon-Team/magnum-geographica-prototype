import { useCallback, useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  checkForRecoverableSession,
  resumeTraceRecording,
  submitTraceSession,
  discardTraceSessionById,
} from "../../services/backgroundGeolocationService";
import { useTraceStore } from "../../stores/traceStore";
import {
  recomputeTraceDistance,
  listTracePoints,
} from "../../services/offlineDataService";

/**
 * Shown on app launch whenever the SQLite mirror has a session in
 * `recording` or `paused` state. The user can:
 *   • Continue — re-attach the background tracker
 *   • End & Save — submit the recovered trace
 *   • Discard — drop it
 *
 * The modal lives in the root layout so it can surface from any tab.
 * It reads its candidate from the `recoveryCandidate` field on the
 * trace store (which is set by the recovery probe on launch).
 */
export function TraceRecoveryModal() {
  const recoveryCandidate = useTraceStore((s) => s.recoveryCandidate);
  const clearRecovery = useTraceStore((s) => s.clearRecovery);
  const beginSession = useTraceStore((s) => s.beginSession);
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState<{
    distanceMeters: number;
    pointCount: number;
    durationMs: number;
  } | null>(null);

  // On launch, look for an unfinished session and seed the store.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await checkForRecoverableSession();
        if (cancelled) return;
        if (session) {
          // Pull a quick metadata snapshot for the modal summary.
          const distance = await recomputeTraceDistance(session.id);
          const pts = await listTracePoints(session.id);
          if (cancelled) return;
          const startMs = new Date(session.started_at).getTime();
          const endedMs = session.ended_at ? new Date(session.ended_at).getTime() : Date.now();
          setMeta({
            distanceMeters: distance,
            pointCount: pts.length,
            durationMs: Math.max(0, endedMs - startMs),
          });
          useTraceStore.getState().setRecoveryCandidate(session);
        }
      } catch (e) {
        console.warn("[recovery] probe failed", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleContinue = useCallback(async () => {
    if (!recoveryCandidate) return;
    setBusy(true);
    try {
      await resumeTraceRecording(recoveryCandidate);
      beginSession(recoveryCandidate);
      clearRecovery();
    } catch (e) {
      console.warn("[recovery] continue failed", e);
    } finally {
      setBusy(false);
    }
  }, [beginSession, clearRecovery, recoveryCandidate]);

  const handleEndAndSave = useCallback(async () => {
    if (!recoveryCandidate) return;
    setBusy(true);
    try {
      const res = await submitTraceSession(recoveryCandidate.id);
      if (res.error) {
        // Surface as a console warning for now; the recovery flow
        // only has three buttons. The active state of the trace
        // store is set by `submitTraceSession` (it returns an
        // error; the row stays in `recording`).
        console.warn("[recovery] submit failed", res.error);
      }
      clearRecovery();
    } finally {
      setBusy(false);
    }
  }, [clearRecovery, recoveryCandidate]);

  const handleDiscard = useCallback(async () => {
    if (!recoveryCandidate) return;
    setBusy(true);
    try {
      await discardTraceSessionById(recoveryCandidate.id);
      clearRecovery();
    } finally {
      setBusy(false);
    }
  }, [clearRecovery, recoveryCandidate]);

  if (!recoveryCandidate || !meta) return null;

  const started = new Date(recoveryCandidate.started_at);
  const dateLabel = started.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const distanceLabel =
    meta.distanceMeters >= 1000
      ? `${(meta.distanceMeters / 1000).toFixed(2)} km`
      : `${meta.distanceMeters.toFixed(0)} m`;

  return (
    <Modal
      transparent
      animationType="fade"
      visible={!!recoveryCandidate}
      onRequestClose={() => {
        // Hardware back dismisses the modal without acting. The
        // candidate stays in the store so the Record tab can
        // re-prompt via the focus effect.
        clearRecovery();
      }}
      testID="trace-recovery-modal"
    >
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <View style={styles.header}>
            <Ionicons name="walk-outline" size={28} color="#22c55e" />
            <Text style={styles.title}>Continue your trace?</Text>
          </View>
          <Text style={styles.subtitle}>
            You have an unfinished recording from {dateLabel}.
          </Text>

          <View style={styles.statsRow}>
            <RecoveryStat label="Duration" value={formatDuration(Math.floor(meta.durationMs / 1000))} />
            <RecoveryStat label="Distance" value={distanceLabel} />
            <RecoveryStat label="Points" value={String(meta.pointCount)} />
          </View>

          <View style={styles.actions}>
            <Pressable
              onPress={handleContinue}
              disabled={busy}
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed ? styles.btnPressed : null,
              ]}
              testID="trace-recovery-continue"
            >
              <Ionicons name="play" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>Continue</Text>
            </Pressable>
            <Pressable
              onPress={handleEndAndSave}
              disabled={busy}
              style={({ pressed }) => [
                styles.secondaryBtn,
                pressed ? styles.btnPressed : null,
              ]}
              testID="trace-recovery-end"
            >
              <Ionicons name="checkmark" size={18} color="#0f172a" />
              <Text style={styles.secondaryBtnText}>End &amp; Save</Text>
            </Pressable>
            <Pressable
              onPress={handleDiscard}
              disabled={busy}
              style={({ pressed }) => [
                styles.discardBtn,
                pressed ? styles.btnPressed : null,
              ]}
              testID="trace-recovery-discard"
            >
              <Ionicons name="trash-outline" size={16} color="#ef4444" />
              <Text style={styles.discardBtnText}>Discard</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function RecoveryStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statBox}>
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
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  dialog: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 20,
    gap: 14,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { fontSize: 18, fontWeight: "700", color: "#0f172a" },
  subtitle: { fontSize: 13, color: "#475569", lineHeight: 18 },
  statsRow: { flexDirection: "row", gap: 8 },
  statBox: {
    flex: 1,
    backgroundColor: "#f1f5f9",
    padding: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  statValue: { fontSize: 16, fontWeight: "700", color: "#0f172a" },
  statLabel: { fontSize: 11, color: "#64748b", marginTop: 2 },
  actions: { gap: 8 },
  primaryBtn: {
    backgroundColor: "#22c55e",
    paddingVertical: 12,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  secondaryBtn: {
    backgroundColor: "#e2e8f0",
    paddingVertical: 12,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  secondaryBtnText: { color: "#0f172a", fontSize: 15, fontWeight: "600" },
  discardBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
  },
  discardBtnText: { color: "#ef4444", fontSize: 13, fontWeight: "600" },
  btnPressed: { opacity: 0.8 },
});
