import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Revision } from "@magnum/shared";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

export interface RevisionHistoryProps {
  revisions: Revision[];
  onRevert?: (revisionId: string) => void;
}

export function RevisionHistory({ revisions, onRevert }: RevisionHistoryProps) {
  if (revisions.length === 0) {
    return (
      <Text style={styles.empty} testID="revisions-empty">No revisions yet.</Text>
    );
  }

  return (
    <View style={styles.container} testID="revision-history">
      <Text style={styles.heading}>Revision History ({revisions.length})</Text>
      {revisions.map((rev, idx) => (
        <View
          key={rev.id}
          style={[styles.revRow, idx === revisions.length - 1 ? styles.lastRow : null]}
          testID={`revision-${rev.id}`}
        >
          <View style={styles.revInfo}>
            <Text style={styles.revContributor}>{rev.contributor_name}</Text>
            <Text style={styles.revMeta}>
              {formatDate(rev.created_at)} at {formatTime(rev.created_at)}
            </Text>
            {rev.edit_summary ? (
              <Text style={styles.revSummary} testID={`revision-summary-${rev.id}`}>{rev.edit_summary}</Text>
            ) : null}
          </View>
          {onRevert ? (
            <Pressable
              onPress={() => onRevert(rev.id)}
              style={styles.revertBtn}
              testID={`revision-revert-${rev.id}`}
            >
              <Ionicons name="refresh-outline" size={14} color="#888" />
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  heading: { fontSize: 16, fontWeight: "600" },
  empty: { fontSize: 13, color: "#aaa", fontStyle: "italic" },
  revRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  lastRow: { borderBottomWidth: 0 },
  revInfo: { flex: 1, gap: 2 },
  revContributor: { fontSize: 13, fontWeight: "600" },
  revMeta: { fontSize: 11, color: "#888" },
  revSummary: { fontSize: 12, color: "#555", marginTop: 2 },
  revertBtn: { padding: 6 },
});
