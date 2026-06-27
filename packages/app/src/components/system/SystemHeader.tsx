import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../providers/ThemeProvider";
import { StatusPill } from "../ui/StatusPill";
import { radii, spacing, text as textTokens } from "../../theme/tokens";
import type { System } from "@magnum/shared";

export interface SystemHeaderProps {
  system: System;
  isOfflineAvailable: boolean;
  testID?: string;
}

/**
 * SystemHeader — the hero block at the top of the system detail page.
 * Holds the system name (always visible across tabs), the offline
 * pill, the "Official page" link, and a small metadata strip. The
 * overflow menu and "View on map" CTA are mounted by the parent so
 * the header can stay presentational.
 */
export function SystemHeader({ system, isOfflineAvailable, testID }: SystemHeaderProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: colors.bg, borderBottomColor: colors.divider },
      ]}
      testID={testID ?? "system-header"}
    >
      <View style={styles.titleRow}>
        <Text
          style={[textTokens.title, { color: colors.text, flex: 1 }]}
          testID="system-name"
        >
          {system.name}
        </Text>
        {isOfflineAvailable ? (
          <StatusPill
            label="Offline"
            icon="cloud-done-outline"
            tone="success"
            testID="system-offline-ready"
          />
        ) : null}
      </View>
      {(system.ownership_source || system.external_url) && (
        <View style={styles.metaRow}>
          {system.ownership_source ? (
            <View style={styles.metaItem}>
              <Ionicons name="shield-checkmark-outline" size={13} color={colors.textMuted} />
              <Text style={[textTokens.meta, { color: colors.textMuted }]}>
                {system.ownership_source}
              </Text>
            </View>
          ) : null}
          {system.external_url ? (
            <Pressable
              onPress={() => Linking.openURL(system.external_url!)}
              style={styles.metaItem}
              testID="system-external-link"
            >
              <Ionicons name="open-outline" size={13} color={colors.primary} />
              <Text style={[textTokens.meta, { color: colors.primary, fontWeight: "600" }]}>
                Official page
              </Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: 1,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.xxs,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.sm,
  },
});
