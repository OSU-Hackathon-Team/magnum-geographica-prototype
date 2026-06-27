import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useTheme } from "../../src/providers/ThemeProvider";
import { createMagnumClient } from "@magnum/shared/api/endpoints";
import { useAuthStore } from "../../src/stores/authStore";
import { Card } from "../../src/components/ui/Card";
import { Button } from "../../src/components/ui/Button";
import { PATROL_FLAG_REASONS, type PatrolFlagReason } from "@magnum/shared/constants";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

interface PatrolEntry {
  id: string;
  revision_id: string;
  reason: PatrolFlagReason;
  resolved: boolean;
  created_at: string;
  revision_target_type?: string | null;
  revision_target_id?: string | null;
  revision_action?: string | null;
  revision_author_id?: string | null;
  revision_summary?: string | null;
}

const REASON_LABELS: Record<PatrolFlagReason, string> = {
  new_tier_semi_edit: "New-tier edit on protected entity",
  new_tier_revert_burst: "New-tier revert burst",
  negative_karma_delete_revert: "Negative-karma delete/revert",
  mass_revert_popular: "Mass revert of popular system",
  mod_override: "Moderator override",
};

export default function AdminPatrolScreen() {
  const { colors } = useTheme();
  const token = useAuthStore((s) => s.token);
  const [items, setItems] = useState<PatrolEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all" | "unresolved">("unresolved");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchPatrol = useCallback(
    async (p: number, f: "all" | "unresolved") => {
      try {
        const client = createMagnumClient(API_URL, {
          getAuthToken: () => token ?? undefined,
        });
        const result = await client.adminListPatrol({
          page: p,
          pageSize: 20,
          resolved: f === "unresolved" ? false : undefined,
        });
        const next = result.items as unknown as PatrolEntry[];
        setItems((prev) => (p === 1 ? next : [...prev, ...next]));
        setTotal(result.total);
        setPage(p);
      } catch {
        // ignore
      }
    },
    [token],
  );

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await fetchPatrol(1, filter);
      setLoading(false);
    })();
  }, [fetchPatrol, filter]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchPatrol(1, filter);
    setRefreshing(false);
  }, [fetchPatrol, filter]);

  const resolve = useCallback(
    async (entry: PatrolEntry) => {
      Alert.alert("Resolve flag", "Mark this flag as resolved?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Resolve",
          onPress: async () => {
            try {
              const client = createMagnumClient(API_URL, {
                getAuthToken: () => token ?? undefined,
              });
              await client.adminPatrolAct({ flag_id: entry.id, action: "resolve" });
              await fetchPatrol(1, filter);
            } catch {
              Alert.alert("Error", "Failed to resolve flag");
            }
          },
        },
      ]);
    },
    [fetchPatrol, filter, token],
  );

  const renderItem = useCallback(
    ({ item }: { item: PatrolEntry }) => (
      <Card testID={`patrol-entry-${item.id}`}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.reason, { color: colors.text }]}>{REASON_LABELS[item.reason] ?? item.reason}</Text>
            <Text style={[styles.meta, { color: colors.textMuted }]}>
              {item.revision_target_type}/{String(item.revision_target_id ?? "").slice(0, 8)} ·{" "}
              {item.revision_action}
            </Text>
            {item.revision_summary ? (
              <Text style={[styles.summary, { color: colors.textMuted }]}>{item.revision_summary}</Text>
            ) : null}
            <Text style={[styles.timestamp, { color: colors.textMuted }]}>
              {new Date(item.created_at).toLocaleString()}
            </Text>
          </View>
          {!item.resolved ? (
            <Button
              size="small"
              variant="secondary"
              onPress={() => resolve(item)}
              testID={`patrol-resolve-${item.id}`}
            >
              Resolve
            </Button>
          ) : (
            <Text style={[styles.resolved, { color: colors.primary }]}>✓ Resolved</Text>
          )}
        </View>
      </Card>
    ),
    [resolve],
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]} testID="admin-patrol">
      <View style={styles.filterRow}>
        <Text style={styles.heading}>Patrol ({total})</Text>
        <View style={styles.filterButtons}>
          {(["unresolved", "all"] as const).map((f) => (
            <Button
              key={f}
              size="small"
              variant={filter === f ? "primary" : "secondary"}
              onPress={() => setFilter(f)}
              testID={`patrol-filter-${f}`}
            >
              {f}
            </Button>
          ))}
        </View>
      </View>
       {loading && items.length === 0 ? (
        <View style={[styles.centered, { backgroundColor: colors.bg }]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          onEndReached={() => {
            if (items.length < total) void fetchPatrol(page + 1, filter);
          }}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={[styles.empty, { color: colors.textMuted }]}>No patrol flags. 🎉</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  heading: { fontSize: 18, fontWeight: "700" },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    paddingBottom: 8,
  },
  filterButtons: { flexDirection: "row", gap: 6 },
  list: { paddingHorizontal: 16, gap: 8, paddingBottom: 32 },
  row: { flexDirection: "row", alignItems: "center" },
  reason: { fontSize: 14, fontWeight: "600" },
  meta: { fontSize: 12, marginTop: 2 },
  summary: { fontSize: 12, marginTop: 2 },
  timestamp: { fontSize: 11, marginTop: 4 },
  resolved: { fontSize: 12 },
  empty: {},
});

// Suppress unused warning for the constant import (used in dev for type lookup).
void PATROL_FLAG_REASONS;
