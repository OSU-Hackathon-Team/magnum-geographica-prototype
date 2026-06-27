import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../providers/ThemeProvider";
import { radii, spacing, text } from "../../theme/tokens";

export type StatusPillTone = "success" | "warning" | "danger" | "muted" | "primary";

export interface StatusPillProps {
  label: string;
  tone?: StatusPillTone;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * StatusPill — a small colored chip for surfacing a state ("Available
 * offline", "Synced 2d ago", "1 pending change"). Replaces the plain
 * `<Text style={styles.meta}>` callouts used throughout the system
 * flow with a consistent, theme-aware surface.
 */
export function StatusPill({ label, tone = "muted", icon, style, testID }: StatusPillProps) {
  const { colors } = useTheme();
  const palette = paletteFor(tone, colors);
  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: palette.bg, borderColor: palette.border },
        style,
      ]}
      testID={testID}
    >
      {icon ? <Ionicons name={icon} size={12} color={palette.fg} /> : null}
      <Text style={[text.small, { color: palette.fg }]}>{label}</Text>
    </View>
  );
}

function paletteFor(
  tone: StatusPillTone,
  colors: ReturnType<typeof useTheme>["colors"],
) {
  switch (tone) {
    case "success":
      return { bg: colors.successMuted, border: colors.success, fg: colors.success };
    case "warning":
      return { bg: colors.warningMuted, border: colors.warning, fg: colors.warning };
    case "danger":
      return { bg: colors.dangerMuted, border: colors.danger, fg: colors.danger };
    case "primary":
      return { bg: colors.primaryMuted, border: colors.primary, fg: colors.primaryStrong };
    case "muted":
    default:
      return {
        bg: colors.surfaceMuted,
        border: colors.border,
        fg: colors.textSecondary,
      };
  }
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
});
