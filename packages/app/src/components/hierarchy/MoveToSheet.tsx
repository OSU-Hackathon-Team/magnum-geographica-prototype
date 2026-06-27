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
import { useAuthStore } from "../../stores/authStore";
import { Button } from "../ui/Button";
import { useTheme } from "../../providers/ThemeProvider";
import { elevation, radii, spacing, text as textTokens } from "../../theme/tokens";

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
  const { colors } = useTheme();
  const token = useAuthStore((s) => s.token);
  const [tree, setTree] = useState<HierarchyTreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setError(null);
    const client = createMagnumClient(API_URL, { getAuthToken: () => token ?? undefined });
    client
      .getHierarchyTree()
      .then((res) => setTree(res.nodes as HierarchyTreeNode[]))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load tree"))
      .finally(() => setLoading(false));
  }, [visible, token]);

  const performMove = useCallback(
    async (action: MoveToAction, targetSuperId?: string, targetSystemId?: string) => {
      if (!sourceSystemId && !sourceSubSystemId) return;
      setSubmitting(true);
      try {
        const client = createMagnumClient(API_URL, { getAuthToken: () => token ?? undefined });
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
    [onClose, onMoved, sourceSubSystemId, sourceSystemId, token],
  );

  if (!visible) return null;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.surface, borderColor: colors.border },
        elevation.sheet,
      ]}
      testID={testID}
    >
      <View style={[styles.header, { borderBottomColor: colors.divider }]}>
        <Text style={[textTokens.h2, { color: colors.text }]}>
          Move &ldquo;{sourceName}&rdquo;
        </Text>
        <Pressable onPress={onClose} testID="move-to-close" hitSlop={12}>
          <Ionicons name="close" size={24} color={colors.textSecondary} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : error ? (
          <Text style={[textTokens.meta, { color: colors.danger }]}>{error}</Text>
        ) : tree.length === 0 ? (
          <Text style={[textTokens.body, { color: colors.textMuted, fontStyle: "italic" }]}>
            No destinations available.
          </Text>
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
                <Text
                  style={[
                    textTokens.meta,
                    { color: colors.textMuted, fontStyle: "italic" },
                  ]}
                >
                  A new system is created with this sub-system&rsquo;s name. Trails assigned to
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
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      <Text style={[textTokens.h3, { color: colors.textMuted }]}>{title}</Text>
      <View style={{ gap: spacing.xs }}>{children}</View>
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
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: warning
            ? colors.dangerMuted
            : pressed
              ? colors.surfaceMutedStrong
              : colors.surfaceMuted,
          borderColor: warning ? colors.danger : colors.border,
        },
      ]}
      testID={testID}
    >
      <Ionicons
        name={warning ? "git-merge" : "arrow-forward"}
        size={18}
        color={warning ? colors.danger : colors.primary}
      />
      <View style={{ flex: 1 }}>
        <Text style={[textTokens.bodyStrong, { color: colors.text }]}>{label}</Text>
        {sublabel ? (
          <Text style={[textTokens.meta, { color: colors.textMuted, marginTop: 2 }]}>
            {sublabel}
          </Text>
        ) : null}
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
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    maxHeight: "85%",
    borderWidth: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  body: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },
  centered: { alignItems: "center", padding: spacing.xxl },
  section: { gap: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
  },
});
