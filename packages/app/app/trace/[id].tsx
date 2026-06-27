import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MapContainer } from "@magnum/map";
import { createMagnumClient } from "@magnum/shared";
import { useAuthStore } from "../../src/stores/authStore";
import { useTheme } from "../../src/providers/ThemeProvider";
import { Card } from "../../src/components/ui/Card";
import { Button } from "../../src/components/ui/Button";
import { spacing, text as textTokens } from "../../src/theme/tokens";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
const MARTIN_URL = process.env.EXPO_PUBLIC_MARTIN_URL ?? "http://localhost:3001";

interface TraceData {
  id: string;
  contributor_name: string;
  source: string;
  weight: number;
  upvotes: number;
  downvotes: number;
  status: string;
  recorded_at: string | null;
  created_at: string;
}

interface TraceSegmentData {
  id: string;
  trace_id: string;
  cluster_id: number | null;
  proposed_trail_id: string | null;
  coordinates: Array<[number, number]>;
  created_at: string;
}

interface SegmentVoteData {
  trail_id: string | null;
  vote: number;
  count: number;
}

export default function TraceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const token = useAuthStore((s) => s.token);
  const contributorName = useAuthStore((s) => s.contributorName);
  const [trace, setTrace] = useState<TraceData | null>(null);
  const [segments, setSegments] = useState<TraceSegmentData[]>([]);
  const [segmentVotes, setSegmentVotes] = useState<Record<string, SegmentVoteData[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [voteBusy, setVoteBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!id || typeof id !== "string") return;
      const client = createMagnumClient(API_URL, {
        getAuthToken: () => token ?? undefined,
      });

      client.getTrace(id)
        .then(async (t) => {
          setTrace(t as unknown as TraceData);
          const segs = await client.listTraceSegments(id);
          const segItems: TraceSegmentData[] = (segs.items as Array<{
            id: string; trace_id: string; cluster_id: number | null;
            proposed_trail_id: string | null; geometry: { coordinates: Array<[number, number]> };
        created_at: string;
      }>).map((s) => ({
        id: s.id,
        trace_id: s.trace_id,
        cluster_id: s.cluster_id,
        proposed_trail_id: s.proposed_trail_id,
        coordinates: s.geometry?.coordinates ?? [],
        created_at: s.created_at,
      }));
      setSegments(segItems);

          // Fetch vote tallies for each segment.
          const votes: Record<string, SegmentVoteData[]> = {};
          await Promise.all(
            segItems.map((s) =>
              client.listTraceSegmentVotes(s.id)
                .then((r) => { votes[s.id] = r.votes; })
                .catch(() => {})
            ),
          );
          setSegmentVotes(votes);
        })
        .catch((e) => setError(e instanceof Error ? e.message : "Failed to load trace"));
    }, [id, token]),
  );

  const handleVoteSegment = async (segmentId: string, trailId: string | null, vote: 1 | -1) => {
    if (!contributorName) {
      Alert.alert("Sign in required", "Log in to annotate trace segments.");
      return;
    }
    setVoteBusy(true);
    try {
      const client = createMagnumClient(API_URL, {
        getAuthToken: () => token ?? undefined,
      });
      await client.voteOnTraceSegment(segmentId, { trail_id: trailId, vote });
      // Refresh votes for this segment.
      const r = await client.listTraceSegmentVotes(segmentId);
      setSegmentVotes((prev) => ({ ...prev, [segmentId]: r.votes }));
      // Refresh segment assignment.
      const segs = await client.listTraceSegments(id);
      const segItems: TraceSegmentData[] = (segs.items as Array<{
        id: string; trace_id: string; cluster_id: number | null;
        proposed_trail_id: string | null; geometry: { coordinates: Array<[number, number]> };
        created_at: string;
      }>).map((s) => ({
        id: s.id,
        trace_id: s.trace_id,
        cluster_id: s.cluster_id,
        proposed_trail_id: s.proposed_trail_id,
        coordinates: s.geometry?.coordinates ?? [],
        created_at: s.created_at,
      }));
      setSegments(segItems);
    } catch (e) {
      Alert.alert("Vote failed", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setVoteBusy(false);
    }
  };

  const handleAssignToTrail = async (segmentId: string, trailId: string) => {
    await handleVoteSegment(segmentId, trailId, 1);
  };

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
      </View>
    );
  }
  if (!trace) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  const segmentCoords = segments
    .filter((s) => s.coordinates.length >= 2)
    .map((s) => ({
      id: s.id,
      coordinates: s.coordinates,
      proposed_trail_id: s.proposed_trail_id,
      color: s.proposed_trail_id ? "#3b82f6" : "#22c55e",
    }));

  const fullCoords = segments.flatMap((s) => s.coordinates);

  return (
    <>
      <Stack.Screen options={{ title: `Trace · ${trace.contributor_name}`, headerShown: true }} />
      <ScrollView style={[styles.root, { backgroundColor: colors.bg }]}>
        <View style={styles.mapWrap}>
          <MapContainer
            config={{
              martinTilesUrl: MARTIN_URL,
              initialCenter: fullCoords.length > 0 ? fullCoords[0] ?? [-82.9988, 39.9612] : [-82.9988, 39.9612],
              initialZoom: 14,
            }}
            highlightTrace={fullCoords.length >= 2 ? { id: trace.id, coordinates: fullCoords } : null}
            traceSegments={segmentCoords}
          />
        </View>

        <View style={styles.section}>
          <View style={styles.headerRow}>
            <Text style={[textTokens.h2, { color: colors.text }]}>{trace.contributor_name}</Text>
          </View>
          <View style={styles.metaRow}>
            <View style={[styles.badge, { backgroundColor: colors.surfaceMutedStrong }]}>
              <Ionicons
                name={trace.source === "import" ? "document-text-outline" : "navigate-outline"}
                size={12}
                color={colors.textMuted}
              />
              <Text style={[styles.badgeText, { color: colors.textMuted }]}>{trace.source}</Text>
            </View>
            {trace.recorded_at ? (
              <Text style={[styles.dateText, { color: colors.textMuted }]}>
                {new Date(trace.recorded_at).toLocaleDateString()}
              </Text>
            ) : null}
            <View style={[styles.badge, { backgroundColor: colors.surfaceMutedStrong }]}>
              <Text style={[styles.badgeText, { color: colors.textMuted }]}>
                w{trace.weight.toFixed(2)} · {trace.upvotes}↑ {trace.downvotes}↓
              </Text>
            </View>
            {trace.status !== "active" ? (
              <View style={[styles.badge, { backgroundColor: colors.dangerMuted }]}>
                <Text style={[styles.badgeText, { color: colors.danger }]}>{trace.status}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[textTokens.h3, { color: colors.text, marginBottom: 8 }]}>
            Segments ({segments.length})
          </Text>
          {segments.length === 0 ? (
            <Text style={[styles.body, { color: colors.textSecondary }]}>
              No server-cut segments yet. Run synthesis to cut this trace.
            </Text>
          ) : (
            segments.map((seg) => {
              const votes = segmentVotes[seg.id] ?? [];
              return <SegmentCard key={seg.id} seg={seg} votes={votes} colors={colors}
                onAssignToTrail={handleAssignToTrail}
                onVoteSegment={handleVoteSegment}
                voteBusy={voteBusy}
                contributorName={contributorName}
              />;
            })
          )}
        </View>
      </ScrollView>
    </>
  );
}

function SegmentCard({
  seg, votes, colors, onAssignToTrail, onVoteSegment, voteBusy, contributorName,
}: {
  seg: TraceSegmentData;
  votes: SegmentVoteData[];
  colors: { text: string; textMuted: string; textSecondary: string; surfaceMuted: string; surfaceMutedStrong: string; primary: string; success: string; danger: string; border: string };
  onAssignToTrail: (id: string, trailId: string) => void;
  onVoteSegment: (id: string, trailId: string | null, vote: 1 | -1) => void;
  voteBusy: boolean;
  contributorName: string | null;
}) {
  const [showVote, setShowVote] = useState(false);
  const [manualTrailId, setManualTrailId] = useState("");

  const totalVotes = votes.reduce((s, v) => s + v.count, 0);
  const agreed = votes.filter((v) => v.trail_id && v.vote === 1).reduce((s, v) => s + v.count, 0);
  const disagree = votes.filter((v) => v.trail_id && v.vote === -1).reduce((s, v) => s + v.count, 0);
  const proposeNew = votes.filter((v) => v.trail_id === null && v.vote === 1).reduce((s, v) => s + v.count, 0);

  return (
    <Card testID={`trace-segment-${seg.id}`}>
      <View style={styles.segmentHeader}>
        <Text style={[textTokens.bodyStrong, { color: colors.text }]}>
          Segment {seg.id.slice(0, 8)}…
        </Text>
        {seg.proposed_trail_id ? (
          <View style={[styles.badge, { backgroundColor: colors.surfaceMutedStrong }]}>
            <Text style={[styles.badgeText, { color: colors.primary }]}>Assigned</Text>
          </View>
        ) : null}
        {seg.cluster_id != null ? (
          <Text style={[styles.dateText, { color: colors.textMuted }]}>Cluster #{seg.cluster_id}</Text>
        ) : null}
      </View>
      <Text style={[styles.body, { color: colors.textSecondary }]}>
        {seg.coordinates.length} pts
        {totalVotes > 0 ? ` · ${totalVotes} vote${totalVotes === 1 ? "" : "s"}` : ""}
        {agreed > 0 ? ` · +${agreed} agree` : ""}
        {disagree > 0 ? ` · ${disagree} disagree` : ""}
        {proposeNew > 0 ? ` · ${proposeNew} propose new` : ""}
      </Text>
      <Pressable onPress={() => setShowVote(!showVote)} style={styles.voteToggle}>
        <Text style={[textTokens.meta, { color: colors.primary }]}>
          {showVote ? "Hide" : "Vote / Assign"}
        </Text>
      </Pressable>
      {showVote ? (
        <View style={[styles.votePanel, { borderTopColor: colors.border }]}>
          {/* Quick yes / no on current proposal */}
          {seg.proposed_trail_id ? (
            <View style={styles.voteRow}>
              <Text style={[textTokens.meta, { color: colors.textMuted }]}>
                Proposed: {seg.proposed_trail_id.slice(0, 8)}…
              </Text>
              <View style={styles.voteBtns}>
                <Button size="small" variant="ghost" onPress={() => onVoteSegment(seg.id, seg.proposed_trail_id!, 1)} disabled={voteBusy}>
                  Agree (+1)
                </Button>
                <Button size="small" variant="ghost" onPress={() => onVoteSegment(seg.id, seg.proposed_trail_id!, -1)} disabled={voteBusy}>
                  Disagree (-1)
                </Button>
              </View>
            </View>
          ) : null}
          {/* Assign to manual trail ID */}
          <View style={styles.voteRow}>
            <TextInput
              style={[styles.trailInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surfaceMuted }]}
              placeholder="Trail ID to assign…"
              value={manualTrailId}
              onChangeText={setManualTrailId}
              autoCapitalize="none"
            />
            <Button size="small" variant="ghost" onPress={() => manualTrailId.trim() && onAssignToTrail(seg.id, manualTrailId.trim())} disabled={voteBusy || !manualTrailId.trim()}>
              Assign
            </Button>
          </View>
          {/* Propose new trail */}
          <View style={styles.voteRow}>
            <Button size="small" variant="ghost" onPress={() => onVoteSegment(seg.id, null, 1)} disabled={voteBusy}>
              Propose new trail
            </Button>
          </View>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16 },
  error: { padding: 16 },
  mapWrap: { height: 280 },
  section: { padding: 16, gap: 8 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  badgeText: { fontSize: 11, fontWeight: "600" },
  dateText: { fontSize: 11 },
  body: { fontSize: 13, lineHeight: 18 },
  segmentHeader: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, justifyContent: "space-between" },
  voteToggle: { paddingVertical: 4 },
  votePanel: { borderTopWidth: 1, paddingTop: 8, marginTop: 4 },
  voteRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  voteBtns: { flexDirection: "row", gap: 4 },
  trailInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 6,
    padding: 6,
    fontSize: 13,
  },
});

import { TextInput } from "react-native";
