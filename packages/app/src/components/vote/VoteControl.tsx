import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View, ActivityIndicator } from "react-native";
import { createMagnumClient } from "@magnum/shared/api/endpoints";
import { useAuthStore } from "../../stores/authStore";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export interface VoteControlProps {
  targetType: "feature" | "trace" | "preset" | "system" | "wiki_page" | "trail";
  targetId: string;
  initialUpvotes?: number;
  initialDownvotes?: number;
  initialMyVote?: -1 | 0 | 1;
  size?: "small" | "medium";
  testID?: string;
  onScoreChange?: (net: number, hidden: boolean) => void;
}

/**
 * Compact ↑/↓ + score control used on feature cards, trace rows, system
 * and preset pages (§21.7). The control is optimistic: clicking updates
 * the local state immediately, then calls the API; on failure, the local
 * state reverts.
 *
 * Logged-out users can read the score but cannot vote — the buttons
 * become informational only.
 */
export function VoteControl({
  targetType,
  targetId,
  initialUpvotes = 0,
  initialDownvotes = 0,
  initialMyVote = 0,
  size = "medium",
  testID,
  onScoreChange,
}: VoteControlProps) {
  const token = useAuthStore((s) => s.token);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [upvotes, setUpvotes] = useState(initialUpvotes);
  const [downvotes, setDownvotes] = useState(initialDownvotes);
  const [myVote, setMyVote] = useState<-1 | 0 | 1>(initialMyVote);
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Fetch initial score on mount so the control renders the live count.
  useEffect(() => {
    if (hydrated) return;
    const client = createMagnumClient(API_URL, { getAuthToken: () => token ?? undefined });
    client
      .getVoteScore(targetType, targetId)
      .then((s) => {
        setUpvotes(s.upvotes);
        setDownvotes(s.downvotes);
        setMyVote((s.my_vote ?? 0) as -1 | 0 | 1);
        setHydrated(true);
        onScoreChange?.(s.net, s.hidden);
      })
      .catch(() => setHydrated(true));
  }, [hydrated, onScoreChange, targetId, targetType, token]);

  const submit = useCallback(
    async (next: -1 | 0 | 1) => {
      if (!isAuthenticated) {
        // Logged-out: read-only display.
        return;
      }
      const prevMyVote = myVote;
      const prevUp = upvotes;
      const prevDown = downvotes;
      // Optimistic update.
      const deltaUp = next === 1 ? 1 : 0;
      const deltaDown = next === -1 ? 1 : 0;
      const prevUpDelta = prevMyVote === 1 ? -1 : 0;
      const prevDownDelta = prevMyVote === -1 ? -1 : 0;
      const newUp = Math.max(0, prevUp + deltaUp + prevUpDelta);
      const newDown = Math.max(0, prevDown + deltaDown + prevDownDelta);
      setMyVote(next);
      setUpvotes(newUp);
      setDownvotes(newDown);
      onScoreChange?.(newUp - newDown, (newUp - newDown) <= -3);

      setLoading(true);
      try {
        const client = createMagnumClient(API_URL, {
          getAuthToken: () => token ?? undefined,
        });
        if (next === 0) {
          const res = await client.retractVote(targetType, targetId);
          setUpvotes(res.upvotes);
          setDownvotes(res.downvotes);
        } else {
          const res = await client.castVote({
            target_type: targetType,
            target_id: targetId,
            value: next,
          });
          setUpvotes(res.upvotes);
          setDownvotes(res.downvotes);
          onScoreChange?.(res.net, res.hidden);
        }
      } catch {
        // Revert on failure.
        setMyVote(prevMyVote);
        setUpvotes(prevUp);
        setDownvotes(prevDown);
      } finally {
        setLoading(false);
      }
    },
    [isAuthenticated, myVote, onScoreChange, targetId, targetType, token, upvotes, downvotes],
  );

  const net = upvotes - downvotes;
  const dim = size === "small" ? styles.small : styles.medium;
  const arrowDim = size === "small" ? styles.arrowSmall : styles.arrow;

  return (
    <View style={[styles.row, dim]} testID={testID}>
      <Pressable
        onPress={() => submit(myVote === 1 ? 0 : 1)}
        disabled={loading || !isAuthenticated}
        style={[styles.button, myVote === 1 ? styles.upActive : null]}
        testID={testID ? `${testID}-up` : undefined}
        accessibilityRole="button"
        accessibilityLabel="Upvote"
      >
        <Text style={[styles.arrow, arrowDim, myVote === 1 ? styles.upActiveText : null]}>▲</Text>
      </Pressable>
      {loading ? (
        <ActivityIndicator size="small" color="#22c55e" style={styles.scoreLoader} />
      ) : (
        <Text
          style={[
            styles.score,
            size === "small" ? styles.scoreSmall : null,
            net < 0 ? styles.scoreNegative : null,
            net > 0 ? styles.scorePositive : null,
          ]}
          testID={testID ? `${testID}-score` : undefined}
        >
          {net}
        </Text>
      )}
      <Pressable
        onPress={() => submit(myVote === -1 ? 0 : -1)}
        disabled={loading || !isAuthenticated}
        style={[styles.button, myVote === -1 ? styles.downActive : null]}
        testID={testID ? `${testID}-down` : undefined}
        accessibilityRole="button"
        accessibilityLabel="Downvote"
      >
        <Text style={[styles.arrow, arrowDim, myVote === -1 ? styles.downActiveText : null]}>▼</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  small: { gap: 2 },
  medium: {},
  button: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  upActive: { backgroundColor: "#dcfce7" },
  downActive: { backgroundColor: "#fee2e2" },
  arrow: { fontSize: 14, color: "#888" },
  arrowSmall: { fontSize: 11, color: "#888" },
  upActiveText: { color: "#22c55e", fontWeight: "700" },
  downActiveText: { color: "#ef4444", fontWeight: "700" },
  score: {
    minWidth: 28,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "600",
    color: "#111",
  },
  scoreSmall: { fontSize: 11, minWidth: 22 },
  scorePositive: { color: "#22c55e" },
  scoreNegative: { color: "#ef4444" },
  scoreLoader: { minWidth: 28, height: 14 },
});
