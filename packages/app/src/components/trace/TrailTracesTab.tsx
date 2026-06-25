import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
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
        <Text style={styles.heading}>Traces ({items.length})</Text>
        <View style={styles.headerActions}>
          <Button
            variant="ghost"
            size="small"
            onPress={() => router.push(`/system/${systemId}/organize` as never)}
            testID="traces-organize"
          >
            <Ionicons name="git-merge" size={14} color="#111" /> Organize
          </Button>
          <Button
            variant="primary"
            size="small"
            onPress={() => router.push(`/system/${systemId}/traces/upload` as never)}
            testID="traces-upload"
          >
            + Upload Trace
          </Button>
        </View>
      </View>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="small" color="#22c55e" />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.hint}>
            No traces yet. Upload a GPX file or record a hike to get
            started.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(t) => t.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heading: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  headerActions: { flexDirection: "row", gap: 6 },
  list: { gap: 6, paddingBottom: 16 },
  centered: { alignItems: "center", justifyContent: "center", padding: 16 },
  errorText: { color: "#ef4444", fontSize: 12 },
  hint: { color: "#888", fontSize: 12, textAlign: "center" },
});
