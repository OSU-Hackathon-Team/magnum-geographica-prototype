import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "../ui/Button";

export interface PendingItem {
  id: number;
  entity_type: string;
  entity_id: string | null;
  action: string;
  payload: unknown;
  contributor_name: string;
  created_at: string;
  sync_status: string;
}

export interface PendingQueueProps {
  items: PendingItem[];
  onDelete: (id: number) => void;
  onSyncAll: () => void;
  syncing?: boolean;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

export function PendingQueue({ items, onDelete, onSyncAll, syncing }: PendingQueueProps) {
  if (items.length === 0) {
    return (
      <View style={styles.container} testID="pending-queue-empty">
        <Text style={styles.heading}>Pending Changes</Text>
        <Text style={styles.empty}>No unsynced changes.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="pending-queue">
      <View style={styles.headerRow}>
        <Text style={styles.heading}>Pending Changes ({items.length})</Text>
        <Button variant="primary" size="small" onPress={onSyncAll} disabled={syncing} testID="pending-sync-all">
          {syncing ? "Syncing..." : "Sync All"}
        </Button>
      </View>

      {items.map((item) => (
        <View key={item.id} style={styles.itemRow} testID={`pending-item-${item.id}`}>
          <View style={styles.itemInfo}>
            <View style={styles.badgeRow}>
              <View style={[styles.actionBadge, item.action === "create" ? styles.createBadge : item.action === "update" ? styles.updateBadge : styles.deleteBadge]}>
                <Text style={styles.actionText}>{item.action}</Text>
              </View>
              <Text style={styles.entityType}>{item.entity_type}</Text>
            </View>
            <Text style={styles.meta}>
              {item.contributor_name} · {formatDate(item.created_at)}
            </Text>
            {item.sync_status === "conflict" ? (
              <Text style={styles.conflict}>Conflict — needs resolution</Text>
            ) : null}
          </View>
          <Button variant="ghost" size="small" onPress={() => onDelete(item.id)} testID={`pending-delete-${item.id}`}>
            <Ionicons name="close-outline" size={14} color="#888" />
          </Button>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  heading: { fontSize: 16, fontWeight: "600" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  empty: { fontSize: 13, color: "#aaa", fontStyle: "italic" },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  itemInfo: { flex: 1, gap: 4 },
  badgeRow: { flexDirection: "row", gap: 6, alignItems: "center" },
  actionBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  createBadge: { backgroundColor: "#dcfce7" },
  updateBadge: { backgroundColor: "#dbeafe" },
  deleteBadge: { backgroundColor: "#fee2e2" },
  actionText: { fontSize: 10, fontWeight: "600", textTransform: "uppercase" },
  entityType: { fontSize: 12, color: "#666" },
  meta: { fontSize: 11, color: "#999" },
  conflict: { fontSize: 11, color: "#ef4444" },
});
