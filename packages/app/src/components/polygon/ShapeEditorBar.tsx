import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../providers/ThemeProvider";
import { elevation, radii, spacing, text as textTokens } from "../../theme/tokens";

/**
 * §21.5 — the bottom bar of the boundary editor. Three slots:
 *   - left: back button (calls onBack, which the host wraps in a
 *           "are you sure?" Alert when there are unsaved changes)
 *   - center: title (e.g. "Draw the system's region") + a
 *           contextual hint that tells the user how to close the
 *           ring (when 3+ vertices exist).
 *   - right: save button (disabled when the shape isn't valid)
 *
 * The bar sits at the bottom of the editor screen, above the
 * system tab bar (we use `headerShown: false` on the screen so the
 * bar IS the header).
 */
export interface ShapeEditorBarProps {
  onBack: () => void;
  title: string;
  onSave: () => void;
  saveDisabled: boolean;
  saveError?: string | null;
  /**
   * Optional hint to show alongside the title. Used by the host to
   * show "Tap the first vertex to close" once 3+ vertices exist.
   */
  hint?: string | null;
  testID?: string;
}

export function ShapeEditorBar({
  onBack,
  title,
  onSave,
  saveDisabled,
  saveError,
  hint,
  testID,
}: ShapeEditorBarProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.surface, borderTopColor: colors.divider },
        elevation.card,
      ]}
      testID={testID ?? "boundary-bar"}
    >
      <Pressable
        onPress={onBack}
        style={({ pressed }) => [
          styles.btn,
          {
            backgroundColor: pressed ? colors.surfaceMutedStrong : colors.surfaceMuted,
          },
        ]}
        testID="boundary-back"
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Ionicons name="arrow-back" size={20} color={colors.text} />
      </Pressable>
      <View style={styles.titleWrap}>
        <Text
          style={[textTokens.bodyStrong, { color: colors.text }]}
          testID="boundary-title"
          numberOfLines={1}
        >
          {title}
        </Text>
        {hint && !saveError ? (
          <Text
            style={[textTokens.meta, { color: colors.success, marginTop: 2 }]}
            testID="boundary-hint"
            numberOfLines={1}
          >
            {hint}
          </Text>
        ) : null}
        {saveError ? (
          <Text
            style={[textTokens.meta, { color: colors.danger, marginTop: 2 }]}
            testID="boundary-save-error"
            numberOfLines={2}
          >
            {saveError}
          </Text>
        ) : null}
      </View>
      <Pressable
        onPress={onSave}
        style={({ pressed }) => [
          styles.btn,
          {
            backgroundColor: saveDisabled
              ? colors.surfaceMuted
              : pressed
                ? colors.surfaceMutedStrong
                : colors.surfaceMuted,
          },
        ]}
        testID="boundary-save"
        hitSlop={8}
        disabled={saveDisabled}
        accessibilityRole="button"
        accessibilityLabel="Save boundary"
      >
        <Ionicons
          name="checkmark"
          size={22}
          color={saveDisabled ? colors.textMuted : colors.primary}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    gap: spacing.md,
  },
  btn: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  titleWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
