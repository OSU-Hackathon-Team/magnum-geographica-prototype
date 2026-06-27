import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Revision } from "@magnum/shared";
import { Button } from "../ui/Button";
import { useTheme } from "../../providers/ThemeProvider";
import { spacing } from "../../theme/tokens";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
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
  const { colors } = useTheme();
  const [pendingRevertId, setPendingRevertId] = useState<string | null>(null);

  const pending = pendingRevertId
    ? (revisions.find((r) => r.id === pendingRevertId) ?? null)
    : null;

  function confirmRevert() {
    if (!pendingRevertId || !onRevert) return;
    onRevert(pendingRevertId);
    setPendingRevertId(null);
  }

  if (revisions.length === 0) {
    return (
      <Text style={[styles.empty, { color: colors.textMuted }]} testID="revisions-empty">
        No revisions yet.
      </Text>
    );
  }

  return (
    <View style={styles.container} testID="revision-history">
      <Text style={styles.heading}>Revision History ({revisions.length})</Text>
      {revisions.map((rev, idx) => (
        <View
          key={rev.id}
          style={[
            styles.revRow,
            { borderBottomColor: colors.divider },
            idx === revisions.length - 1 ? styles.lastRow : null,
          ]}
          testID={`revision-${rev.id}`}
        >
          <View style={styles.revInfo}>
            <Text style={styles.revContributor}>{rev.contributor_name}</Text>
            <Text style={[styles.revMeta, { color: colors.textMuted }]}>
              {formatDate(rev.created_at)} at {formatTime(rev.created_at)}
            </Text>
            {rev.edit_summary ? (
              <Text style={[styles.revSummary, { color: colors.textSecondary }]} testID={`revision-summary-${rev.id}`}>
                {rev.edit_summary}
              </Text>
            ) : null}
          </View>
          {onRevert ? (
            <Pressable
              onPress={() => setPendingRevertId(rev.id)}
              style={styles.revertBtn}
              testID={`revision-revert-${rev.id}`}
            >
              <Ionicons name="refresh-outline" size={14} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      ))}

      <Modal
        visible={pending !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingRevertId(null)}
        testID="revert-confirm-modal"
      >
        <View style={styles.backdrop}>
          <View style={[styles.dialog, { backgroundColor: colors.surface }]} testID="revert-confirm-dialog">
            <Text style={[styles.title, { color: colors.text }]}>Revert to this revision?</Text>
            {pending ? (
              <Text style={[styles.body, { color: colors.textSecondary }]}>
                By {pending.contributor_name} on {formatDate(pending.created_at)} at{" "}
                {formatTime(pending.created_at)}.{"\n\n"}This will create a new revision with the
                old content. The current content is not lost.
              </Text>
            ) : null}
            <View style={styles.actions}>
              <Button
                variant="ghost"
                size="small"
                onPress={() => setPendingRevertId(null)}
                testID="revert-confirm-cancel"
                title="Cancel"
              />
              <Button
                variant="primary"
                size="small"
                onPress={confirmRevert}
                testID="revert-confirm-confirm"
                title="Revert"
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  heading: { fontSize: 16, fontWeight: "600" },
  empty: { fontSize: 13, fontStyle: "italic" },
  revRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  lastRow: { borderBottomWidth: 0 },
  revInfo: { flex: 1, gap: spacing.xxs },
  revContributor: { fontSize: 13, fontWeight: "600" },
  revMeta: { fontSize: 11 },
  revSummary: { fontSize: 12, marginTop: 2 },
  revertBtn: { padding: 6 },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  dialog: {
    borderRadius: 10,
    padding: spacing.xl,
    gap: spacing.md,
    width: "100%",
    maxWidth: 400,
  },
  title: { fontSize: 16, fontWeight: "700" },
  body: { fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm, marginTop: spacing.xs },
});
