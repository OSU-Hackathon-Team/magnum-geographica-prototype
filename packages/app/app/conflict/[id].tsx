import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Button } from "../../src/components/ui/Button";
import { Card } from "../../src/components/ui/Card";
import {
  getPendingContributions,
  deletePendingContribution,
  markContributionSynced,
  type PendingContributionRow,
} from "../../src/services/offlineDataService";
import { useOfflineStore } from "../../src/stores/offlineStore";

export default function ConflictScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<PendingContributionRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const pending = await getPendingContributions();
      const match = pending.find(
        (p: PendingContributionRow) => p.sync_status === "conflict" && String(p.id) === id,
      );
      setItem(match ?? null);
      setLoading(false);
    })();
  }, [id]);

  async function handleKeepMine() {
    if (!item) return;
    const serverId = item.conflict_revision_id ?? item.server_id ?? "local";
    await markContributionSynced(item.id, serverId);
    useOfflineStore.getState().setPendingCount(
      useOfflineStore.getState().pendingCount - 1,
    );
    router.back();
  }

  async function handleDiscard() {
    if (!item) return;
    await deletePendingContribution(item.id);
    useOfflineStore.getState().setPendingCount(
      Math.max(0, useOfflineStore.getState().pendingCount - 1),
    );
    router.back();
  }

  if (loading) {
    return (
      <View style={styles.centered} testID="conflict-loading">
        <ActivityIndicator />
      </View>
    );
  }

  if (!item) {
    return (
      <View style={styles.centered} testID="conflict-not-found">
        <Text style={styles.errorText}>Conflict not found</Text>
        <Button variant="ghost" size="small" onPress={() => router.back()}>
          Go Back
        </Button>
      </View>
    );
  }

  const payload =
    typeof item.payload === "object" && item.payload
      ? (item.payload as Record<string, unknown>)
      : null;

  return (
    <>
      <Stack.Screen options={{ title: "Resolve Conflict" }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        testID="conflict-screen"
      >
        <Card>
          <Text style={styles.heading}>Edit Conflict</Text>
          <Text style={styles.description}>
            Your offline edit conflicts with a newer version on the server. Choose
            how to resolve it.
          </Text>
        </Card>

        <Card>
          <Text style={styles.label}>Entity Type</Text>
          <Text style={styles.value}>{item.entity_type}</Text>
        </Card>

        <Card>
          <Text style={styles.label}>Action</Text>
          <View
            style={[
              styles.actionBadge,
              item.action === "create"
                ? styles.createBadge
                : item.action === "update"
                  ? styles.updateBadge
                  : styles.deleteBadge,
            ]}
          >
            <Text style={styles.actionText}>{item.action}</Text>
          </View>
        </Card>

        {payload ? (
          <Card>
            <Text style={styles.label}>Your Changes</Text>
            {payload.title ? (
              <Text style={styles.fieldLabel}>Title</Text>
            ) : null}
            {payload.title ? (
              <Text style={styles.fieldValue}>
                {String(payload.title).slice(0, 200)}
              </Text>
            ) : null}
            {payload.content_md ? (
              <Text style={styles.fieldLabel}>Content</Text>
            ) : null}
            {payload.content_md ? (
              <Text style={styles.fieldValue}>
                {String(payload.content_md).slice(0, 500)}
              </Text>
            ) : null}
          </Card>
        ) : null}

        <View style={styles.actions}>
          <Button
            variant="primary"
            size="medium"
            onPress={handleKeepMine}
            testID="conflict-keep-mine"
          >
            Keep My Version
          </Button>
          <Button
            variant="ghost"
            size="medium"
            onPress={handleDiscard}
            testID="conflict-discard"
          >
            Discard My Changes
          </Button>
        </View>

        <Text style={styles.hint}>
          "Keep My Version" overwrites the server version with yours.
          {"\n"}
          "Discard My Changes" removes your local edit.
        </Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 16, gap: 12 },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    gap: 12,
  },
  errorText: { color: "#ef4444", fontSize: 14 },
  heading: { fontSize: 18, fontWeight: "700", marginBottom: 4 },
  description: { fontSize: 13, color: "#666", lineHeight: 18 },
  label: { fontSize: 11, color: "#888", marginBottom: 4 },
  value: { fontSize: 14, fontWeight: "500" },
  actionBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  createBadge: { backgroundColor: "#dcfce7" },
  updateBadge: { backgroundColor: "#dbeafe" },
  deleteBadge: { backgroundColor: "#fee2e2" },
  actionText: { fontSize: 11, fontWeight: "600", textTransform: "uppercase" },
  fieldLabel: {
    fontSize: 11,
    color: "#888",
    marginTop: 8,
    marginBottom: 2,
  },
  fieldValue: {
    fontSize: 13,
    color: "#333",
    backgroundColor: "#f5f5f5",
    padding: 8,
    borderRadius: 4,
    fontFamily: "monospace",
  },
  actions: { gap: 8 },
  hint: { fontSize: 11, color: "#aaa", textAlign: "center", lineHeight: 16 },
});
