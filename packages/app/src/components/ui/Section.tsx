import type { ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../../providers/ThemeProvider";
import { spacing, text } from "../../theme/tokens";

export interface SectionProps {
  title?: string;
  /**
   * Slot for a right-aligned action (e.g. an "Edit" button). The parent
   * owns the button so we don't try to be clever about variants here.
   */
  action?: ReactNode;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /**
   * When true, render the title without the bottom divider/label
   * styling — useful for hero sections that want a clean look.
   */
  hero?: boolean;
}

/**
 * Section — the canonical "titled content block" used on every detail
 * page (system, trail, feature). Pairs a small uppercase label with a
 * right-aligned action and stacks content underneath with consistent
 * spacing. Use this anywhere you'd otherwise write `<Text h2>…</Text>` +
 * ad-hoc children.
 */
export function Section({ title, action, children, style, testID, hero }: SectionProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.wrap, style]} testID={testID}>
      {title || action ? (
        <View style={styles.header}>
          {title ? (
            <Text
              style={[
                hero ? text.title : text.h3,
                { color: hero ? colors.text : colors.textMuted },
                styles.title,
              ]}
              testID={testID ? `${testID}-title` : undefined}
            >
              {title}
            </Text>
          ) : (
            <View />
          )}
          {action ? <View style={styles.action}>{action}</View> : null}
        </View>
      ) : null}
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  title: { flexShrink: 1 },
  action: { flexShrink: 0 },
  body: { gap: spacing.sm },
});
