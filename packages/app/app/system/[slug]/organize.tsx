import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MapContainer } from "@magnum/map";
import { createMagnumClient, type Trail, type System } from "@magnum/shared";
import { useAuthStore } from "../../../src/stores/authStore";
import { useTheme } from "../../../src/providers/ThemeProvider";
import { hexToRgba } from "../../../src/theme/hexToRgba";
import { Button } from "../../../src/components/ui/Button";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
const MARTIN_URL = process.env.EXPO_PUBLIC_MARTIN_URL ?? "http://localhost:3001";

/**
 * §21.6 / Phase 10 — Organize view.
 *
 * A full-screen segment map and proposal list. Synthesis runs
 * automatically in the background (no manual trigger needed).
 * Proposals are visible to any logged-in user; the approve /
 * reject actions are moderator-only.
 */
export default function SystemOrganize() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const token = useAuthStore((s) => s.token);
  const contributorName = useAuthStore((s) => s.contributorName);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const isModerator = isAdmin;
  const [system, setSystem] = useState<System | null>(null);
  const [trails, setTrails] = useState<Trail[]>([]);
  const [proposals, setProposals] = useState<
    Array<{
      id: string;
      trace_id: string;
      segment_id: string;
      cluster_id: number | null;
      reason: string;
    }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedSegment, setSelectedSegment] = useState<(typeof proposals)[number] | null>(null);
  const [newTrailName, setNewTrailName] = useState("");
  const [approving, setApproving] = useState(false);

  // The client must receive the auth token so moderator-only routes
  // (§21.6 synthesis + premium import) can authorize the request.
  const client = useMemo(
    () => createMagnumClient(API_URL, { getAuthToken: () => token ?? undefined }),
    [token],
  );

  const load = useCallback(async () => {
    if (!slug) return;
    try {
      const sys = await client.getSystemBySlug(String(slug));
      setSystem(sys);
      const tr = await client
        .listTrails({ systemId: sys.id, pageSize: 100 })
        .catch(() => ({ items: [] as Trail[] }));
      setTrails(tr.items.filter((t) => t.tier === "synthesized"));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [slug, client]);

  useEffect(() => {
    load();
  }, [load]);

  const loadProposals = useCallback(async () => {
    if (!system) return;
    try {
      const r = await client.listSynthesisProposals(system.id);
      setProposals(r.proposals);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [client, system]);

  useEffect(() => {
    if (system) loadProposals();
  }, [system, loadProposals]);

  async function approveProposal(segmentId: string, name: string) {
    if (!system) return;
    setApproving(true);
    try {
      await client.approveSynthesisProposal(segmentId, { system_id: system.id, name });
      setSelectedSegment(null);
      setNewTrailName("");
      await loadProposals();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setApproving(false);
    }
  }

  async function rejectProposal(segmentId: string) {
    if (!system) return;
    try {
      await client.rejectSynthesisProposal(segmentId, { system_id: system.id });
      setSelectedSegment(null);
      await loadProposals();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Screen
        options={{
          title: system?.name ? `Organize · ${system.name}` : "Organize",
        }}
      />

      <View style={[styles.map, { backgroundColor: colors.border }]} testID="organize-map">
        <MapContainer
          config={{
            martinTilesUrl: MARTIN_URL,
            initialCenter: [-82.9988, 39.9612],
            initialZoom: 10,
          }}
        />
      </View>

      {error ? (
        <View style={styles.summary} testID="organize-summary">
          <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
        </View>
      ) : null}

      <ScrollView style={styles.list} testID="organize-proposals">
        <Text style={[styles.h2, { color: colors.text }]}>Proposals ({proposals.length})</Text>
        {proposals.length === 0 ? (
          <Text style={[styles.muted, { color: colors.textMuted }]}>
            No outstanding proposals. Synthesis runs automatically when new traces are submitted.
          </Text>
        ) : null}
        {proposals.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => setSelectedSegment(p)}
            style={({ pressed }) => [styles.row, { borderBottomColor: colors.divider }, pressed && { backgroundColor: colors.surfaceMutedStrong }]}
            testID={`proposal-${p.id}`}
          >
              <View style={styles.rowMain}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>Cluster #{p.cluster_id ?? "?"}</Text>
                <Text style={[styles.rowSub, { color: colors.textMuted }]}>Trace {p.trace_id.slice(0, 8)}…</Text>
              </View>
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <Button variant="ghost" size="small" onPress={() => router.push(`/trace/${p.trace_id}` as never)}>
                  View
                </Button>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </View>
          </Pressable>
        ))}
      </ScrollView>

      <Modal
        visible={selectedSegment !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedSegment(null)}
      >
          <View style={[styles.modalBackdrop, { backgroundColor: hexToRgba(colors.shadow, 0.4) }]}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]} testID="proposal-sheet">
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Segment {selectedSegment?.segment_id.slice(0, 8)}…
              </Text>
              <Pressable onPress={() => setSelectedSegment(null)} testID="proposal-sheet-close">
                <Ionicons name="close" size={22} color={colors.text} />
              </Pressable>
            </View>
            <Text style={[styles.muted, { color: colors.textMuted }]}>
              Cluster #{selectedSegment?.cluster_id ?? "?"} · no nearby trail
            </Text>

            <Text style={[styles.label, { color: colors.textSecondary }]}>Or assign to existing trail</Text>
            <ScrollView style={styles.trailsList} testID="proposal-sheet-trails">
              {trails.length === 0 ? (
                <Text style={[styles.muted, { color: colors.textMuted }]}>No synthesized trails in this system yet.</Text>
              ) : null}
              {trails.map((t) => (
                <Pressable
                  key={t.id}
                  onPress={() => selectedSegment && approveProposal(selectedSegment.segment_id, t.name)}
                  style={[styles.trailRow, { borderBottomColor: colors.divider }]}
                  testID={`proposal-sheet-trail-${t.id}`}
                >
                  <Ionicons name="trail-sign" size={16} color={colors.primary} />
                  <Text style={[styles.trailName, { color: colors.text }]}>{t.name}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={[styles.label, { color: colors.textSecondary }]}>Or propose a new trail</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.borderStrong, color: colors.text, backgroundColor: colors.surfaceMuted }]}
              placeholder="Trail name (e.g. Sycamore Ridge)"
              value={newTrailName}
              onChangeText={setNewTrailName}
              testID="proposal-sheet-name"
            />
            <View style={styles.modalActions}>
              <Button
                variant="secondary"
                size="small"
                onPress={() => selectedSegment && rejectProposal(selectedSegment.segment_id)}
                testID="proposal-sheet-reject"
              >
                Reject
              </Button>
              <Button
                variant="primary"
                size="small"
                disabled={!newTrailName.trim() || approving}
                onPress={() =>
                  selectedSegment &&
                  newTrailName.trim() &&
                  approveProposal(selectedSegment.segment_id, newTrailName.trim())
                }
                testID="proposal-sheet-approve"
              >
                {approving ? "Saving…" : "Propose"}
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      <Text style={[styles.foot, { color: colors.textMuted }]} testID="organize-foot">
        contributor: {contributorName} · {isModerator ? "moderator" : "viewer"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8 },
  headerBtnText: { fontWeight: "600" },
  map: { height: 220 },
  summary: { paddingHorizontal: 16, paddingVertical: 8 },
  summaryText: { fontWeight: "600" },
  errorText: {},
  list: { flex: 1, paddingHorizontal: 16, paddingBottom: 16 },
  h2: { fontSize: 16, fontWeight: "700", marginVertical: 8 },
  muted: {},
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  rowMain: { flex: 1 },
  rowTitle: { fontWeight: "600" },
  rowSub: { fontSize: 12 },
  modalBackdrop: { flex: 1, justifyContent: "flex-end" },
  modalCard: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    minHeight: 320,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  modalTitle: { fontSize: 18, fontWeight: "700" },
  label: { marginTop: 16, marginBottom: 6, fontWeight: "600" },
  trailsList: { maxHeight: 160 },
  trailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  trailName: {},
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 16,
  },
  overlay: {
    position: "absolute",
    inset: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  foot: { fontSize: 10, paddingHorizontal: 16, paddingBottom: 12 },
});
