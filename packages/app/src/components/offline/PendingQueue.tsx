import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Button } from "../ui/Button";
import { useTheme } from "../../providers/ThemeProvider";
import { spacing, text as textTokens } from "../../theme/tokens";

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
  try { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
  catch { return iso; }
}

export function PendingQueue({ items, onDelete, onSyncAll, syncing }: PendingQueueProps) {
  const router = useRouter();
  const { colors } = useTheme();

  if (items.length === 0) {
    return (
      <View style={styles.container} testID="pending-queue-empty">
        <Text style={[textTokens.h3, { color: colors.textMuted }]}>Pending Changes</Text>
        <Text style={[textTokens.meta, { color: colors.textMuted, fontStyle: "italic", marginTop: spacing.xs }]}>No unsynced changes.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="pending-queue">
      <View style={styles.headerRow}>
        <Text style={[textTokens.h3, { color: colors.textMuted }]}>Pending Changes ({items.length})</Text>
        <Button variant="primary" size="small" onPress={onSyncAll} disabled={syncing} testID="pending-sync-all">
          {syncing ? "Syncing..." : "Sync All"}
        </Button>
      </View>
      {items.map((item) => (
        <View key={item.id} style={[styles.itemRow, { borderBottomColor: colors.divider }]} testID={`pending-item-${item.id}`}>
          <View style={styles.itemInfo}>
            <View style={styles.badgeRow}>
              <View style={[styles.actionBadge, { backgroundColor: item.action === "create" ? colors.successMuted : item.action === "update" ? colors.surfaceMutedStrong : colors.dangerMuted }]}>
                <Text style={[styles.actionText, { color: item.action === "create" ? colors.success : item.action === "update" ? colors.textSecondary : colors.danger }]}>{item.action}</Text>
              </View>
              <Text style={[textTokens.meta, { color: colors.textMuted }]}>{item.entity_type}</Text>
            </View>
            <Text style={[textTokens.meta, { color: colors.textMuted }]}>{item.contributor_name} · {formatDate(item.created_at)}</Text>
            {item.sync_status === "conflict" ? (
              <View style={styles.conflictRow}>
                <Text style={[textTokens.meta, { color: colors.danger, flex: 1 }]}>Conflict</Text>
                <Button variant="primary" size="small" onPress={() => router.push(`/conflict/${item.id}` as never)} testID={`pending-resolve-${item.id}`}>Resolve</Button>
              </View>
            ) : null}
          </View>
          <Button variant="ghost" size="small" onPress={() => onDelete(item.id)} testID={`pending-delete-${item.id}`}>
            <Ionicons name="close-outline" size={14} color={colors.textMuted} />
          </Button>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  itemRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingVertical: spacing.sm, borderBottomWidth: 1 },
  itemInfo: { flex: 1, gap: spacing.xxs },
  badgeRow: { flexDirection: "row", gap: spacing.xs, alignItems: "center" },
  actionBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3 },
  actionText: { fontSize: 10, fontWeight: "600", textTransform: "uppercase" },
  conflictRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xxs },
});
