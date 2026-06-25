import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { createMagnumClient } from "@magnum/shared/api/endpoints";
import { useAuthStore } from "../../src/stores/authStore";
import { Card } from "../../src/components/ui/Card";
import { Button } from "../../src/components/ui/Button";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

interface Proposal {
  id: string;
  trace_id: string;
  segment_id: string;
  cluster_id: number | null;
  reason: string;
}

export default function AdminSynthesisScreen() {
  const token = useAuthStore((s) => s.token);
  const [systemId, setSystemId] = useState<string | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [systemInput, setSystemInput] = useState("");
  const [selected, setSelected] = useState<Proposal | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (sys: string) => {
      const client = createMagnumClient(API_URL, {
        getAuthToken: () => token ?? undefined,
      });
      const r = await client.listSynthesisProposals(sys);
      setProposals(r.proposals);
    },
    [token],
  );

  useEffect(() => {
    if (!systemId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    load(systemId)
      .catch(() => setProposals([]))
      .finally(() => setLoading(false));
  }, [systemId, load]);

  const onRefresh = useCallback(async () => {
    if (!systemId) return;
    setRefreshing(true);
    try {
      await load(systemId);
    } finally {
      setRefreshing(false);
    }
  }, [systemId, load]);

  async function approve(segId: string, trailName: string) {
    if (!systemId) return;
    setBusy(true);
    try {
      const client = createMagnumClient(API_URL, {
        getAuthToken: () => token ?? undefined,
      });
      await client.approveSynthesisProposal(segId, { system_id: systemId, name: trailName });
      setSelected(null);
      setName("");
      await load(systemId);
    } finally {
      setBusy(false);
    }
  }

  async function reject(segId: string) {
    if (!systemId) return;
    setBusy(true);
    try {
      const client = createMagnumClient(API_URL, {
        getAuthToken: () => token ?? undefined,
      });
      await client.rejectSynthesisProposal(segId, { system_id: systemId });
      setSelected(null);
      await load(systemId);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <Card style={styles.headerCard}>
        <Text style={styles.h1}>Synthesis proposals</Text>
        <Text style={styles.muted}>
          Segments cut from GPS traces that don't fit any existing synthesized trail.
          Approve to create a new trail, or reject to drop the segment.
        </Text>
        <View style={styles.systemRow}>
          <TextInput
            style={styles.input}
            placeholder="System id (uuid)"
            value={systemInput}
            onChangeText={setSystemInput}
            autoCapitalize="none"
            testID="synthesis-system-input"
          />
          <Button
            size="small"
            onPress={() => setSystemId(systemInput.trim() || null)}
            testID="synthesis-system-set"
          >
            Load
          </Button>
        </View>
      </Card>

      {systemId == null ? (
        <Text style={styles.mutedCenter} testID="synthesis-empty">
          Enter a system id to load its proposal queue.
        </Text>
      ) : loading ? (
        <ActivityIndicator size="large" color="#0a84ff" />
      ) : (
        <FlatList
          data={proposals}
          keyExtractor={(p) => p.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setSelected(item)}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: "#f3f4f6" }]}
              testID={`synthesis-row-${item.id}`}
            >
              <View style={styles.rowMain}>
                <Text style={styles.rowTitle}>Cluster #{item.cluster_id ?? "?"}</Text>
                <Text style={styles.rowSub}>
                  Segment {item.segment_id.slice(0, 8)}… · Trace {item.trace_id.slice(0, 8)}…
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#6b7280" />
            </Pressable>
          )}
          ListEmptyComponent={
            <Text style={styles.mutedCenter} testID="synthesis-no-proposals">
              No pending proposals.
            </Text>
          }
        />
      )}

      <Modal
        visible={selected !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setSelected(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Approve as new trail</Text>
              <Pressable onPress={() => setSelected(null)} testID="synthesis-modal-close">
                <Ionicons name="close" size={22} color="#111" />
              </Pressable>
            </View>
            <Text style={styles.muted}>
              Segment {selected?.segment_id.slice(0, 8)}… · cluster{" "}
              {selected?.cluster_id ?? "?"}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Trail name (e.g. Sycamore Ridge)"
              value={name}
              onChangeText={setName}
              testID="synthesis-name"
            />
            <View style={styles.modalActions}>
              <Button
                variant="secondary"
                size="small"
                onPress={() => selected && reject(selected.segment_id)}
                disabled={busy}
                testID="synthesis-reject"
              >
                Reject
              </Button>
              <Button
                variant="primary"
                size="small"
                disabled={busy || !name.trim()}
                onPress={() => selected && name.trim() && approve(selected.segment_id, name.trim())}
                testID="synthesis-approve"
              >
                {busy ? "Saving…" : "Approve"}
              </Button>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16, backgroundColor: "#fff" },
  headerCard: { marginBottom: 12 },
  h1: { fontSize: 18, fontWeight: "700", marginBottom: 4 },
  muted: { color: "#6b7280" },
  mutedCenter: { color: "#6b7280", textAlign: "center", marginTop: 24 },
  systemRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  rowMain: { flex: 1 },
  rowTitle: { fontWeight: "600", color: "#111" },
  rowSub: { color: "#6b7280", fontSize: 12 },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  modalCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    minHeight: 260,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#111" },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 16,
  },
});
