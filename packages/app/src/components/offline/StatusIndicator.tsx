import { StyleSheet, Text, View } from "react-native";
import { useOfflineStore } from "../../stores/offlineStore";
import { useTheme } from "../../providers/ThemeProvider";

export function StatusIndicator() {
  const { colors } = useTheme();
  const isOnline = useOfflineStore((s) => s.isOnline);
  const pending = useOfflineStore((s) => s.pendingCount);
  const syncState = useOfflineStore((s) => s.syncState);

  const { color, label } = (() => {
    if (syncState === "syncing") return { color: colors.textMuted, label: "Syncing..." };
    if (!isOnline && pending > 0) return { color: colors.warning, label: `Offline (${pending} pending)` };
    if (!isOnline) return { color: colors.danger, label: "Offline" };
    return { color: colors.success, label: "Online" };
  })();

  return (
    <View style={styles.row} testID="status-indicator">
      <View style={[styles.dot, { backgroundColor: color }]} testID="status-dot" />
      <Text style={[styles.text, { color: colors.textMuted }]} testID="status-label">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  text: { fontSize: 12 },
});
