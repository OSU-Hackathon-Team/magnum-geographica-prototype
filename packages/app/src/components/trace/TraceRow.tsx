import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { createMagnumClient } from "@magnum/shared";
import { type TrustTier, TIER_COLORS, TIER_LABELS } from "@magnum/shared";
import { useAuthStore } from "../../stores/authStore";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export interface TraceRowData {
  id: string;
  contributor_name: string;
  source: "import" | "recorded";
  weight: number;
  upvotes: number;
  downvotes: number;
  status: "active" | "ignored" | "removed";
  recorded_at: string | null;
  created_at: string;
}

export interface TraceRowProps extends TraceRowData {
  testID?: string;
  onChanged?: () => void;
}

/**
 * §21.4 — compact trace row in the Trails & Traces list. Shows the
 * contributor, date, vote score, and a weight badge. Mod+ can soft-
 * delete via the trash icon.
 */
export function TraceRow(props: TraceRowProps) {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const role = user?.role;
  const [busy, setBusy] = useState(false);
  const [myVote, setMyVote] = useState<-1 | 0 | 1>(0);

  const fetchScore = useCallback(async () => {
    try {
      const client = createMagnumClient(API_URL, {
        getAuthToken: () => token ?? undefined,
      });
      const res = await client.raw.request<{
        upvotes: number;
        downvotes: number;
        net: number;
        my_vote?: -1 | 0 | 1;
      }>("GET", `/api/votes/trace/${props.id}`);
      // Only the locally-known `my_vote` matters here; the row's
      // net score is already cached on the trace itself.
      setMyVote((res.my_vote ?? 0) as -1 | 0 | 1);
    } catch {
      // ignore — best-effort
    }
  }, [props.id, token]);

  useEffect(() => {
    void fetchScore();
  }, [fetchScore]);

  const handleVote = useCallback(
    async (next: 1 | -1) => {
      if (!user) {
        Alert.alert("Sign in required", "Log in to vote on traces.");
        return;
      }
      setBusy(true);
      try {
        const client = createMagnumClient(API_URL, {
          getAuthToken: () => token ?? undefined,
        });
        if (myVote === next) {
          await client.retractTraceVote(props.id);
          setMyVote(0);
        } else {
          await client.voteOnTrace(props.id, next);
          setMyVote(next);
        }
        props.onChanged?.();
      } catch (e) {
        Alert.alert("Vote failed", e instanceof Error ? e.message : "Unknown error");
      } finally {
        setBusy(false);
      }
    },
    [myVote, props, token, user],
  );

  const handleRemove = useCallback(async () => {
    if (role !== "admin" && role !== "moderator") return;
    Alert.alert("Remove trace", "Mark this trace as removed? Synthesizer will ignore it.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            const client = createMagnumClient(API_URL, {
              getAuthToken: () => token ?? undefined,
            });
            await client.removeTrace(props.id);
            props.onChanged?.();
          } catch (e) {
            Alert.alert("Error", e instanceof Error ? e.message : "Failed");
          }
        },
      },
    ]);
  }, [props, role, token]);

  const net = props.upvotes - props.downvotes;
  const date = new Date(props.created_at).toLocaleDateString();

  return (
    <View style={[styles.row, props.status === "removed" ? styles.rowRemoved : null]} testID={props.testID}>
      <View style={styles.colMain}>
        <View style={styles.contributorRow}>
          <Ionicons
            name={props.source === "import" ? "document-text-outline" : "navigate-outline"}
            size={14}
            color="#64748b"
          />
          <Text style={styles.contributor}>{props.contributor_name}</Text>
          <Text style={styles.date}>· {date}</Text>
          <WeightBadge weight={props.weight} status={props.status} />
        </View>
        <View style={styles.actionsRow}>
          <Pressable
            style={[styles.voteBtn, myVote === 1 ? styles.upActive : null]}
            onPress={() => handleVote(1)}
            disabled={busy || props.status === "removed"}
            testID={props.testID ? `${props.testID}-up` : undefined}
          >
            <Ionicons
              name="arrow-up"
              size={14}
              color={myVote === 1 ? "#22c55e" : "#64748b"}
            />
          </Pressable>
          <Text
            style={[styles.score, net < 0 ? styles.scoreNegative : null, net > 0 ? styles.scorePositive : null]}
            testID={props.testID ? `${props.testID}-score` : undefined}
          >
            {net}
          </Text>
          <Pressable
            style={[styles.voteBtn, myVote === -1 ? styles.downActive : null]}
            onPress={() => handleVote(-1)}
            disabled={busy || props.status === "removed"}
            testID={props.testID ? `${props.testID}-down` : undefined}
          >
            <Ionicons
              name="arrow-down"
              size={14}
              color={myVote === -1 ? "#ef4444" : "#64748b"}
            />
          </Pressable>
          {busy ? <ActivityIndicator size="small" /> : null}
        </View>
      </View>
      {role === "admin" || role === "moderator" ? (
        <Pressable onPress={handleRemove} style={styles.removeBtn} testID={props.testID ? `${props.testID}-remove` : undefined}>
          <Ionicons name="trash-outline" size={18} color="#ef4444" />
        </Pressable>
      ) : null}
    </View>
  );
}

function WeightBadge({
  weight,
  status,
}: {
  weight: number;
  status: "active" | "ignored" | "removed";
}) {
  if (status !== "active") {
    return (
      <View style={[styles.badge, styles.badgeRemoved]}>
        <Text style={styles.badgeTextRemoved}>{status}</Text>
      </View>
    );
  }
  // 0.0..1.0 → green→amber→red shading. Above the floor (0.3) we
  // mark the trace as a "heavy" contributor.
  const tier: TrustTier = weight >= 0.7 ? "trusted" : weight >= 0.3 ? "established" : "new";
  const color = TIER_COLORS[tier];
  return (
    <View style={[styles.badge, { backgroundColor: `${color}22`, borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{`w${weight.toFixed(2)}`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: "#f9fafb",
    borderRadius: 6,
  },
  rowRemoved: { opacity: 0.5 },
  colMain: { flex: 1, gap: 4 },
  contributorRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  contributor: { fontSize: 13, fontWeight: "600", color: "#0f172a" },
  date: { fontSize: 11, color: "#94a3b8" },
  actionsRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  voteBtn: {
    padding: 4,
    borderRadius: 4,
  },
  upActive: { backgroundColor: "#dcfce7" },
  downActive: { backgroundColor: "#fee2e2" },
  score: { fontSize: 12, fontWeight: "700", minWidth: 22, textAlign: "center", color: "#0f172a" },
  scorePositive: { color: "#22c55e" },
  scoreNegative: { color: "#ef4444" },
  removeBtn: { padding: 6 },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  badgeRemoved: { backgroundColor: "#fee2e2", borderColor: "#dc2626" },
  badgeText: { fontSize: 10, fontWeight: "700" },
  badgeTextRemoved: { fontSize: 10, fontWeight: "700", color: "#dc2626" },
});
