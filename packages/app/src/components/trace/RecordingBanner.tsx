import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTraceStore, sessionElapsedMs } from "../../stores/traceStore";
import { useTheme } from "../../providers/ThemeProvider";

/**
 * Persistent indicator shown above all tab content while a trace is
 * active. The user can tap it from any tab to jump straight back to
 * the Record tab — that's how they get back to the live map / pause /
 * submit / discard controls without having to find the tab manually.
 *
 * This is intentionally light-weight: a single bar, 1Hz tick to
 * redraw the duration. The full controls live on the Record tab
 * (recording controls need more vertical space than a top bar
 * can spare).
 */
export function RecordingBanner() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const status = useTraceStore((s) => s.status);
  const startedAt = useTraceStore((s) => s.startedAt);
  const totalPausedMs = useTraceStore((s) => s.totalPausedMs);
  const pausedAt = useTraceStore((s) => s.pausedAt);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (status !== "recording") return;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [status]);

  if (status === "idle" || status === "submitting") return null;

  const isPaused = status === "paused";
  const elapsedMs = sessionElapsedMs(
    {
      status,
      startedAt,
      pausedAt,
      totalPausedMs,
      livePoints: [],
      totalMeters: 0,
      error: null,
      activeSessionId: null,
      recoveryCandidate: null,
    } as never,
    now,
  );

  return (
    <Pressable
      onPress={() => router.push("/record" as never)}
      style={({ pressed }) => [
        styles.banner,
        { paddingTop: insets.top + 10, backgroundColor: isPaused ? colors.warning : colors.danger, shadowColor: colors.shadow },
        pressed ? styles.bannerPressed : null,
      ]}
      testID="recording-banner"
      accessibilityRole="button"
      accessibilityLabel={
        isPaused ? "Recording paused, tap to return" : "Recording, tap to view"
      }
    >
      <View
        style={[
          styles.dot,
          { backgroundColor: isPaused ? colors.warning : colors.danger },
        ]}
        testID="recording-banner-dot"
      />
      <Text style={[styles.label, { color: colors.textInverse }]} testID="recording-banner-label">
        {isPaused ? "Paused" : "Recording"}
      </Text>
      <Text style={[styles.duration, { color: colors.textInverse }]} testID="recording-banner-duration">
        {formatDuration(Math.floor(elapsedMs / 1000))}
      </Text>
      <Ionicons name="chevron-forward" size={16} color={colors.textInverse} style={{ marginLeft: "auto" }} />
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

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    zIndex: 100,
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  bannerPressed: { opacity: 0.85 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { fontSize: 13, fontWeight: "700" },
  duration: { fontSize: 13, fontWeight: "500", opacity: 0.9 },
});
