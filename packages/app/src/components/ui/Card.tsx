import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../../providers/ThemeProvider";
import { elevation, radii, spacing } from "../../theme/tokens";

export interface CardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /**
   * "flat"  – the default: white surface with a 1px border, no shadow.
   *           Use for list rows, panels, content blocks.
   * "tinted" – subtle surface (e.g. a "Coming soon" placeholder).
   * "elevated" – adds the card elevation shadow. Use sparingly for
   *           tappable cards that need a clear tap affordance.
   */
  variant?: "flat" | "tinted" | "elevated";
}

/**
 * Card — the canonical surface for a discrete chunk of content.
 * The old card used ad-hoc `#f8f8f8` + `#eee` colors; this version
 * pulls from tokens so light and dark themes stay in sync and
 * all cards share the same border/radius.
 */
export function Card({ children, style, testID, variant = "flat" }: CardProps) {
  const { colors } = useTheme();
  const isTinted = variant === "tinted";
  const isElevated = variant === "elevated";
  return (
    <View
      style={[
        styles.base,
        isTinted
          ? { backgroundColor: colors.surfaceMuted, borderColor: colors.border }
          : isElevated
            ? { backgroundColor: colors.surface, borderColor: colors.border }
            : { backgroundColor: colors.surface, borderColor: colors.border },
        isElevated ? elevation.card : null,
        style,
      ]}
      testID={testID}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
});
