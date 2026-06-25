import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { createMagnumClient, type HierarchyTreeNode } from "@magnum/shared";
import { Button } from "../ui/Button";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export type MoveToAction =
  | "move_to_super"
  | "move_out_of_super"
  | "promote_to_system"
  | "demote_to_sub_system"
  | "merge_into";

export interface MoveToSheetProps {
  visible: boolean;
  onClose: () => void;
  /**
   * The "source" entity. For `move_to_super`/`move_out_of_super`/`merge_into`
   * this is a system id; for `promote_to_system` it's a sub-system id.
   */
  sourceSystemId?: string;
  sourceSubSystemId?: string;
  sourceName: string;
  onMoved?: () => void;
  testID?: string;
}

/**
 * §21.5 — the Move-to action sheet (§21.3.4 step 4).
 *
 * Surfaces a pickable list of possible targets grouped by the kind of
 * action that's available:
 *   - Add to super-system / Remove from super-system
 *   - Promote this sub-system to its own system
 *   - Merge this system into another system
 *
 * Targets are loaded from the hierarchy tree endpoint so the user sees
 * the whole system list and any existing super-system groupings.
 */
export function MoveToSheet({
  visible,
  onClose,
  sourceSystemId,
  sourceSubSystemId,
  sourceName,
  onMoved,
  testID,
}: MoveToSheetProps) {
  const [tree, setTree] = useState<HierarchyTreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setError(null);
    const client = createMagnumClient(API_URL);
    client
      .getHierarchyTree()
      .then((res) => setTree(res.nodes as HierarchyTreeNode[]))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load tree"))
      .finally(() => setLoading(false));
  }, [visible]);

  const performMove = useCallback(
    async (action: MoveToAction, targetSuperId?: string, targetSystemId?: string) => {
      if (!sourceSystemId && !sourceSubSystemId) return;
      setSubmitting(true);
      try {
        const client = createMagnumClient(API_URL);
        const body: Record<string, unknown> = { action };
        if (targetSuperId) body.target_super_id = targetSuperId;
        if (targetSystemId) body.target_system_id = targetSystemId;
        if (sourceSubSystemId) body.sub_system_id = sourceSubSystemId;
        if (sourceSystemId) {
          await client.moveSystem(sourceSystemId, body as Parameters<typeof client.moveSystem>[1]);
        }
        onMoved?.();
        onClose();
      } catch (e) {
        Alert.alert("Move failed", e instanceof Error ? e.message : "Unknown error");
      } finally {
        setSubmitting(false);
      }
    },
    [onClose, onMoved, sourceSubSystemId, sourceSystemId],
  );

  if (!visible) return null;

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Move “{sourceName}”</Text>
        <Pressable onPress={onClose} testID="move-to-close" hitSlop={12}>
          <Ionicons name="close" size={24} color="#666" />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="small" color="#22c55e" />
          </View>
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : tree.length === 0 ? (
          <Text style={styles.hint}>No destinations available.</Text>
        ) : (
          <>
            {sourceSystemId ? (
              <Section title="Add to a super-system">
                {tree
                  .filter((n) => n.tier === "super" && n.id !== "__loose__")
                  .map((sup) => (
                    <ActionRow
                      key={sup.id}
                      label={sup.name}
                      sublabel={sup.tier}
                      onPress={() => performMove("move_to_super", sup.id)}
                      testID={`move-to-super-${sup.slug}`}
                    />
                  ))}
                <ActionRow
                  label="Remove from all super-systems"
                  sublabel="Make this system loose"
                  onPress={() => performMove("move_out_of_super", "00000000-0000-0000-0000-000000000000")}
                  testID="move-to-loose"
                  warning
                />
              </Section>
            ) : null}
            {sourceSystemId ? (
              <Section title="Merge into another system">
                {tree
                  .flatMap((n) => n.children)
                  .filter((s) => s.tier === "system" && s.id !== sourceSystemId)
                  .map((sys) => (
                    <ActionRow
                      key={sys.id}
                      label={sys.name}
                      sublabel={sys.tier}
                      onPress={() => performMove("merge_into", undefined, sys.id)}
                      testID={`move-to-merge-${sys.slug}`}
                      warning
                    />
                  ))}
              </Section>
            ) : null}
            {sourceSubSystemId ? (
              <Section title="Promote this sub-system to a system">
                <Text style={styles.hint}>
                  A new system is created with this sub-system’s name. Trails assigned to
                  the sub-system move to the new system; the original sub-system is kept.
                </Text>
                <Button
                  variant="primary"
                  onPress={() => performMove("promote_to_system")}
                  disabled={submitting}
                  testID="move-to-promote"
                >
                  {submitting ? "Promoting…" : "Promote to system"}
                </Button>
              </Section>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={{ gap: 6 }}>{children}</View>
    </View>
  );
}

function ActionRow({
  label,
  sublabel,
  onPress,
  testID,
  warning,
}: {
  label: string;
  sublabel?: string;
  onPress: () => void;
  testID?: string;
  warning?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.row, warning ? styles.rowWarning : null]}
      testID={testID}
    >
      <Ionicons
        name={warning ? "git-merge" : "arrow-forward"}
        size={18}
        color={warning ? "#dc2626" : "#22c55e"}
      />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {sublabel ? <Text style={styles.rowSub}>{sublabel}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "85%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  headerTitle: { fontSize: 16, fontWeight: "700" },
  body: { padding: 16, gap: 16, paddingBottom: 32 },
  centered: { alignItems: "center", padding: 24 },
  section: { gap: 8 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#666",
    textTransform: "uppercase",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#f9fafb",
    borderRadius: 8,
  },
  rowWarning: { backgroundColor: "#fef2f2" },
  rowLabel: { fontSize: 14, fontWeight: "600", color: "#111" },
  rowSub: { fontSize: 11, color: "#666", marginTop: 2 },
  error: { color: "#ef4444", fontSize: 12 },
  hint: { color: "#888", fontSize: 12, fontStyle: "italic" },
});
