import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../providers/ThemeProvider";
import { radii, spacing } from "../../theme/tokens";

/**
 * §21.5 — the floating mode toggle on the LEFT edge of the
 * boundary editor. Two stacked buttons:
 *   - ＋ : normal mode (tap to add vertices)
 *   - ✕ : delete mode (tap vertices/edges to remove)
 *
 * Rendered absolutely over the map (the parent positions it on
 * the left). The active mode is highlighted.
 */
export interface ShapeEditorModeToggleProps {
  mode: "normal" | "delete";
  onChange: (mode: "normal" | "delete") => void;
  testID?: string;
}

export function ShapeEditorModeToggle({
  mode,
  onChange,
  testID,
}: ShapeEditorModeToggleProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.container} testID={testID ?? "boundary-mode-toggle"}>
      <Pressable
        onPress={() => onChange("normal")}
        style={[
          styles.btn,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            shadowColor: colors.shadow,
          },
          mode === "normal" && {
            backgroundColor: colors.primary,
            borderColor: colors.primaryStrong,
          },
        ]}
        testID="boundary-mode-normal"
        accessibilityRole="button"
        accessibilityLabel="Normal mode"
      >
        <Ionicons
          name="add"
          size={22}
          color={mode === "normal" ? colors.textInverse : colors.text}
        />
        <Text
          style={[
            styles.label,
            { color: colors.text },
            mode === "normal" && { color: colors.textInverse },
          ]}
        >
          Add
        </Text>
      </Pressable>
      <Pressable
        onPress={() => onChange("delete")}
        style={[
          styles.btn,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            shadowColor: colors.shadow,
          },
          mode === "delete" && {
            backgroundColor: colors.danger,
            borderColor: colors.danger,
          },
        ]}
        testID="boundary-mode-delete"
        accessibilityRole="button"
        accessibilityLabel="Delete mode"
      >
        <Ionicons
          name="trash-outline"
          size={20}
          color={mode === "delete" ? colors.textInverse : colors.danger}
        />
        <Text
          style={[
            styles.label,
            { color: colors.text },
            mode === "delete" && { color: colors.textInverse },
          ]}
        >
          Delete
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: spacing.md,
    top: "50%",
    transform: [{ translateY: -44 }],
    gap: spacing.sm,
  },
  btn: {
    width: 56,
    height: 56,
    borderRadius: radii.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  label: {
    fontSize: 10,
    marginTop: 2,
    fontWeight: "600",
  },
});
