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
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/Button";
import { useTheme } from "@/providers/ThemeProvider";
import { radii, spacing, text as textTokens } from "@/theme/tokens";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
const MARTIN_URL = process.env.EXPO_PUBLIC_MARTIN_URL ?? "http://localhost:3001";

/**
 * §21.6 phase 2 — Organize view.
 *
 * A full-screen segment map for moderators to:
 *   - assign a cut segment to the nearest synthesized trail, or
 *   - propose a new trail (queues into the moderator proposal queue)
 *   - downvote / agree on a segment vote
 *
 * v1 uses simple flat lists; the "tap a segment on the map" UX is
 * the next iteration. The bottom sheet is the primary interaction.
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
  const [synthLoading, setSynthLoading] = useState(false);
  const [synthError, setSynthError] = useState<string | null>(null);
  const [synthResult, setSynthResult] = useState<{
    assigned: number;
    proposed: number;
    trails_updated: number;
  } | null>(null);
  const [selectedSegment, setSelectedSegment] = useState<(typeof proposals)[number] | null>(null);
  const [newTrailName, setNewTrailName] = useState("");
  const [approving, setApproving] = useState(false);

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
      setSynthError((err as Error).message);
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
      setSynthError((err as Error).message);
    }
  }, [client, system]);

  useEffect(() => {
    if (system) loadProposals();
  }, [system, loadProposals]);

  async function runSynthesis() {
    if (!system) return;
    setSynthLoading(true);
    setSynthError(null);
    setSynthResult(null);
    try {
      const r = await client.synthesize(system.id);
      setSynthResult({
        assigned: r.assigned,
        proposed: r.proposed,
        trails_updated: r.trails_updated,
      });
      await loadProposals();
    } catch (err) {
      setSynthError((err as Error).message);
    } finally {
      setSynthLoading(false);
    }
  }

  async function approveProposal(segmentId: string, name: string) {
    if (!system) return;
    setApproving(true);
    try {
      await client.approveSynthesisProposal(segmentId, { system_id: system.id, name });
      setSelectedSegment(null);
      setNewTrailName("");
      await loadProposals();
    } catch (err) {
      setSynthError((err as Error).message);
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
      setSynthError((err as Error).message);
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Screen
        options={{
          title: system?.name ? `Organize · ${system.name}` : "Organize",
          headerRight: () =>
            isModerator ? (
              <Pressable
                accessibilityRole="button"
                onPress={runSynthesis}
                disabled={synthLoading}
                testID="organize-run-synthesis"
                style={({ pressed }) => [
                  styles.headerBtn,
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Ionicons name="refresh" size={18} color={colors.primary} />
                <Text style={[textTokens.buttonSmall, { color: colors.primary }]}>
                  {synthLoading ? "Running…" : "Run synthesis"}
                </Text>
              </Pressable>
            ) : null,
        }}
      />

      <View
        style={[
          styles.map,
          { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
        ]}
        testID="organize-map"
      >
        <MapContainer
          config={{
            martinTilesUrl: MARTIN_URL,
            initialCenter: [-82.9988, 39.9612],
            initialZoom: 10,
          }}
        />
      </View>

      <View style={styles.summary} testID="organize-summary">
        {synthResult ? (
          <View
            style={[
              styles.summaryCard,
              {
                backgroundColor: colors.surfaceTint,
                borderColor: colors.success,
              },
            ]}
          >
            <Ionicons name="checkmark-circle" size={16} color={colors.success} />
            <Text style={[textTokens.meta, { color: colors.success, flex: 1 }]}>
              Assigned {synthResult.assigned} · Proposed {synthResult.proposed} · Updated{" "}
              {synthResult.trails_updated}
            </Text>
          </View>
        ) : null}
        {synthError ? (
          <View
            style={[
              styles.summaryCard,
              { backgroundColor: colors.dangerMuted, borderColor: colors.danger },
            ]}
          >
            <Ionicons name="alert-circle" size={16} color={colors.danger} />
            <Text style={[textTokens.meta, { color: colors.danger, flex: 1 }]}>
              {synthError}
            </Text>
          </View>
        ) : null}
      </View>

      <ScrollView style={styles.list} testID="organize-proposals">
        <Text style={[textTokens.h3, { color: colors.textMuted, marginVertical: spacing.sm }]}>
          Proposals · {proposals.length}
        </Text>
        {proposals.length === 0 ? (
          <Text style={[textTokens.body, { color: colors.textMuted, fontStyle: "italic" }]}>
            No outstanding segments. Tap &ldquo;Run synthesis&rdquo; to cut the latest traces and
            queue proposals.
          </Text>
        ) : null}
        {proposals.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => setSelectedSegment(p)}
            style={({ pressed }) => [
              styles.row,
              {
                borderBottomColor: colors.divider,
                backgroundColor: pressed ? colors.surfaceMuted : "transparent",
              },
            ]}
            testID={`proposal-${p.id}`}
          >
            <View style={styles.rowMain}>
              <Text style={[textTokens.bodyStrong, { color: colors.text }]}>
                Cluster #{p.cluster_id ?? "?"}
              </Text>
              <Text style={[textTokens.meta, { color: colors.textMuted, marginTop: 2 }]}>
                Trace {p.trace_id.slice(0, 8)}…
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        ))}
      </ScrollView>

      <Modal
        visible={selectedSegment !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedSegment(null)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
            testID="proposal-sheet"
          >
            <View style={styles.modalHeader}>
              <Text style={[textTokens.h2, { color: colors.text }]}>
                Segment {selectedSegment?.segment_id.slice(0, 8)}…
              </Text>
              <Pressable
                onPress={() => setSelectedSegment(null)}
                testID="proposal-sheet-close"
              >
                <Ionicons name="close" size={22} color={colors.text} />
              </Pressable>
            </View>
            <Text style={[textTokens.meta, { color: colors.textMuted, marginBottom: spacing.md }]}>
              Cluster #{selectedSegment?.cluster_id ?? "?"} · no nearby trail
            </Text>

            <Text style={[textTokens.h3, { color: colors.textMuted, marginBottom: spacing.xs }]}>
              Or assign to existing trail
            </Text>
            <ScrollView
              style={styles.trailsList}
              testID="proposal-sheet-trails"
            >
              {trails.length === 0 ? (
                <Text style={[textTokens.body, { color: colors.textMuted, fontStyle: "italic" }]}>
                  No synthesized trails in this system yet.
                </Text>
              ) : null}
              {trails.map((t) => (
                <Pressable
                  key={t.id}
                  onPress={() => selectedSegment && approveProposal(selectedSegment.segment_id, t.name)}
                  style={({ pressed }) => [
                    styles.trailRow,
                    {
                      borderBottomColor: colors.divider,
                      backgroundColor: pressed ? colors.surfaceMuted : "transparent",
                    },
                  ]}
                  testID={`proposal-sheet-trail-${t.id}`}
                >
                  <Ionicons name="trail-sign" size={16} color={colors.primary} />
                  <Text style={[textTokens.body, { color: colors.text, flex: 1 }]}>{t.name}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text
              style={[
                textTokens.h3,
                { color: colors.textMuted, marginTop: spacing.md, marginBottom: spacing.xs },
              ]}
            >
              Or propose a new trail
            </Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.text },
              ]}
              placeholder="Trail name (e.g. Sycamore Ridge)"
              placeholderTextColor={colors.textMuted}
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

      {synthLoading ? (
        <View style={styles.overlay} testID="organize-loading">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : null}

      <Text
        style={[
          textTokens.meta,
          { color: colors.textMuted, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
        ]}
        testID="organize-foot"
      >
        contributor: {contributorName} · {isModerator ? "moderator" : "viewer"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  map: { height: 220, borderBottomWidth: 1 },
  summary: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  list: { flex: 1, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  rowMain: { flex: 1 },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 23, 42, 0.45)",
  },
  modalCard: {
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    padding: spacing.xl,
    minHeight: 320,
    borderWidth: 1,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  trailsList: { maxHeight: 160 },
  trailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  input: {
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    fontSize: 14,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  overlay: {
    position: "absolute",
    inset: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.5)",
  },
});
