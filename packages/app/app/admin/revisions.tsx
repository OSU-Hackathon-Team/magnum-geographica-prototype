import { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Card } from "../../src/components/ui/Card";
import { Button } from "../../src/components/ui/Button";
import { useAuthStore } from "../../src/stores/authStore";
import { createMagnumClient } from "@magnum/shared/api/endpoints";
import type { Revision } from "@magnum/shared/types";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
const PAGE_SIZE = 30;

interface RevisionWithTarget extends Revision {
  target_type?: string;
  target_id?: string;
}

export default function AdminRevisions() {
  const token = useAuthStore((s) => s.token);
  const [items, setItems] = useState<RevisionWithTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchRevisions = useCallback(
    async (p: number) => {
      setLoading(true);
      try {
        const client = createMagnumClient(API_URL, { getAuthToken: () => token ?? undefined });
        const result = await client.adminListRevisions({ page: p, pageSize: PAGE_SIZE });
        setItems((prev) => (p === 1 ? result.items : [...prev, ...result.items]));
        setTotal(result.total);
        setPage(p);
      } catch {
        // ignore errors
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    void fetchRevisions(1);
  }, [fetchRevisions]);

  const handleRevert = async (revisionId: string) => {
    Alert.alert("Revert", "Revert to this revision?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Revert",
        style: "destructive",
        onPress: async () => {
          try {
            const client = createMagnumClient(API_URL, { getAuthToken: () => token ?? undefined });
            await client.adminRevertRevision(revisionId);
            Alert.alert("Done", "Revision reverted successfully");
            void fetchRevisions(1);
          } catch {
            Alert.alert("Error", "Failed to revert revision");
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: RevisionWithTarget }) => (
    <Card testID={`admin-revision-${item.id.slice(0, 8)}`}>
      <Text style={styles.revMeta}>
        {item.contributor_name} on {new Date(item.created_at).toLocaleDateString()}
      </Text>
      {item.edit_summary && <Text style={styles.revSummary}>{item.edit_summary}</Text>}
      <Text style={styles.revContent} numberOfLines={3}>
        {item.content_md.slice(0, 200)}
      </Text>
      <View style={styles.revActions}>
        <Button variant="ghost" size="small" onPress={() => handleRevert(item.id)}>
          Revert
        </Button>
      </View>
    </Card>
  );

  return (
    <View style={styles.container} testID="admin-revisions">
      <Text style={styles.heading}>
        Recent Revisions ({total})
      </Text>
      {loading && items.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#22c55e" />
        </View>
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          onEndReached={() => {
            if (items.length < total) void fetchRevisions(page + 1);
          }}
          onEndReachedThreshold={0.5}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  heading: { fontSize: 18, fontWeight: "700", padding: 16, paddingBottom: 8 },
  list: { paddingHorizontal: 16, gap: 8, paddingBottom: 32 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  revMeta: { fontSize: 12, color: "#888", marginBottom: 2 },
  revSummary: { fontSize: 13, fontStyle: "italic", color: "#555", marginBottom: 4 },
  revContent: { fontSize: 13, color: "#333", marginBottom: 4 },
  revActions: { flexDirection: "row", justifyContent: "flex-end" },
});
