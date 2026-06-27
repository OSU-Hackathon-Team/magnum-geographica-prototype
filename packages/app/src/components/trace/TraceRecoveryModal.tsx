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
import { useTheme } from "../../providers/ThemeProvider";
import { hexToRgba } from "../../theme/hexToRgba";
import { spacing, text as textTokens } from "../../theme/tokens";

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
  const { colors } = useTheme();
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
      <View style={[styles.overlay, { backgroundColor: hexToRgba(colors.shadow, 0.55) }]}>
        <View
          style={[
            styles.dialog,
            { backgroundColor: colors.surface, shadowColor: colors.shadow },
          ]}
        >
          <View style={styles.header}>
            <Ionicons name="walk-outline" size={28} color={colors.primary} />
            <Text style={[styles.title, { color: colors.text }]}>
              Continue your trace?
            </Text>
          </View>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
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
                { backgroundColor: colors.primary },
                pressed ? styles.btnPressed : null,
              ]}
              testID="trace-recovery-continue"
            >
              <Ionicons name="play" size={18} color={colors.textInverse} />
              <Text style={[styles.primaryBtnText, { color: colors.textInverse }]}>
                Continue
              </Text>
            </Pressable>
            <Pressable
              onPress={handleEndAndSave}
              disabled={busy}
              style={({ pressed }) => [
                styles.secondaryBtn,
                { backgroundColor: colors.border },
                pressed ? styles.btnPressed : null,
              ]}
              testID="trace-recovery-end"
            >
              <Ionicons name="checkmark" size={18} color={colors.text} />
              <Text style={[styles.secondaryBtnText, { color: colors.text }]}>
                End &amp; Save
              </Text>
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
              <Ionicons name="trash-outline" size={16} color={colors.danger} />
              <Text style={[styles.discardBtnText, { color: colors.danger }]}>
                Discard
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function RecoveryStat({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.statBox, { backgroundColor: colors.surfaceMuted }]}>
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textMuted }]}>{label}</Text>
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
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  dialog: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 14,
    padding: spacing.xl,
    gap: 14,
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { fontSize: 18, fontWeight: "700" },
  subtitle: { fontSize: 13, lineHeight: 18 },
  statsRow: { flexDirection: "row", gap: spacing.sm },
  statBox: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  statValue: { fontSize: 16, fontWeight: "700" },
  statLabel: { fontSize: 11, marginTop: 2 },
  actions: { gap: spacing.sm },
  primaryBtn: {
    paddingVertical: spacing.md,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  primaryBtnText: { fontSize: 15, fontWeight: "700" },
  secondaryBtn: {
    paddingVertical: spacing.md,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  secondaryBtnText: { fontSize: 15, fontWeight: "600" },
  discardBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: spacing.sm,
  },
  discardBtnText: { fontSize: 13, fontWeight: "600" },
  btnPressed: { opacity: 0.8 },
});
