import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { createMagnumClient } from "@magnum/shared";
import { TraceRow, type TraceRowData } from "./TraceRow";
import { Button } from "../ui/Button";
import { useTheme } from "../../providers/ThemeProvider";
import { spacing, text as textTokens } from "../../theme/tokens";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export interface TrailTracesTabProps {
  systemId: string;
  testID?: string;
}

/**
 * §21.4 — Trails & Traces tab content.
 *
 * Lists every trace that has been auto-tagged into this system. The
 * "Organize" button jumps to the (Phase 5) organize view; for now
 * it just navigates to the trace list screen which we already
 * expose via the API. The "Upload Trace" button opens the
 * UploadTraceSheet (passed via the parent).
 */
export function TrailTracesTab({ systemId, testID }: TrailTracesTabProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const [items, setItems] = useState<TraceRowData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTraces = useCallback(async () => {
    setError(null);
    try {
      const client = createMagnumClient(API_URL);
      const res = await client.listTraces({ system_id: systemId, pageSize: 50 });
      setItems(res.items as unknown as TraceRowData[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load traces");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [systemId]);

  useEffect(() => {
    void fetchTraces();
  }, [fetchTraces]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void fetchTraces();
  }, [fetchTraces]);

  const renderItem = useCallback(
    ({ item }: { item: TraceRowData }) => (
      <TraceRow
        {...item}
        testID={`traces-row-${item.id}`}
        onChanged={() => void fetchTraces()}
      />
    ),
    [fetchTraces],
  );

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <Text style={[textTokens.h3, { color: colors.textMuted }]}>Traces</Text>
          <Text
            style={[
              textTokens.bodyStrong,
              { color: colors.text, marginTop: 2 },
            ]}
            testID="traces-count"
          >
            {items.length}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Button
            variant="ghost"
            size="small"
            onPress={() => router.push(`/system/${systemId}/edit` as never)}
            testID="traces-edit-trails"
          >
            <Ionicons name="git-branch-outline" size={14} color={colors.text} /> Edit Trails
          </Button>
          <Button
            variant="primary"
            size="small"
            onPress={() => router.push(`/system/${systemId}/traces/upload` as never)}
            testID="traces-upload"
          >
            <Ionicons name="add" size={14} color={colors.textInverse} /> Upload
          </Button>
        </View>
      </View>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={[textTokens.meta, { color: colors.danger }]}>{error}</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="navigate-outline" size={32} color={colors.textMuted} />
          <Text
            style={[
              textTokens.body,
              { color: colors.textMuted, textAlign: "center" },
            ]}
          >
            No traces yet. Upload a GPX file or record a hike to get started.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(t) => t.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          scrollEnabled={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md, paddingTop: spacing.sm },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  headerInfo: { flexShrink: 1 },
  headerActions: { flexDirection: "row", gap: spacing.xs, flexShrink: 0 },
  list: { gap: spacing.xs, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  centered: { alignItems: "center", justifyContent: "center", padding: spacing.lg },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
    gap: spacing.sm,
  },
});
