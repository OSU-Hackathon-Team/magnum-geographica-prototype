import { StyleSheet, Text, View } from "react-native";
import { useOfflineStore } from "../../stores/offlineStore";

export function StatusIndicator() {
  const isOnline = useOfflineStore((s) => s.isOnline);
  const pending = useOfflineStore((s) => s.pendingCount);
  const syncState = useOfflineStore((s) => s.syncState);

  const { color, label } = (() => {
    if (syncState === "syncing") return { color: "#a3a3a3", label: "Syncing..." };
    if (!isOnline && pending > 0)
      return { color: "#eab308", label: `Offline (${pending} pending)` };
    if (!isOnline) return { color: "#ef4444", label: "Offline" };
    return { color: "#22c55e", label: "Online" };
  })();

  return (
    <View style={styles.row} testID="status-indicator">
      <View style={[styles.dot, { backgroundColor: color }]} testID="status-dot" />
      <Text style={styles.text} testID="status-label">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  text: { fontSize: 12, color: "#666" },
});
