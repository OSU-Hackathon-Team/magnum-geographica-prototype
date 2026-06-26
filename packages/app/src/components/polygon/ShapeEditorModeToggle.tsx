import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

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
  return (
    <View style={styles.container} testID={testID ?? "boundary-mode-toggle"}>
      <Pressable
        onPress={() => onChange("normal")}
        style={[styles.btn, mode === "normal" && styles.btnActive]}
        testID="boundary-mode-normal"
        accessibilityRole="button"
        accessibilityLabel="Normal mode"
      >
        <Ionicons
          name="add"
          size={22}
          color={mode === "normal" ? "#fff" : "#0f172a"}
        />
        <Text
          style={[
            styles.label,
            mode === "normal" ? styles.labelActive : null,
          ]}
        >
          Add
        </Text>
      </Pressable>
      <Pressable
        onPress={() => onChange("delete")}
        style={[styles.btn, mode === "delete" && styles.btnActiveDelete]}
        testID="boundary-mode-delete"
        accessibilityRole="button"
        accessibilityLabel="Delete mode"
      >
        <Ionicons
          name="trash-outline"
          size={20}
          color={mode === "delete" ? "#fff" : "#dc2626"}
        />
        <Text
          style={[
            styles.label,
            mode === "delete" ? styles.labelActive : null,
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
    left: 12,
    top: "50%",
    transform: [{ translateY: -44 }],
    gap: 8,
  },
  btn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  btnActive: {
    backgroundColor: "#22c55e",
    borderColor: "#16a34a",
  },
  btnActiveDelete: {
    backgroundColor: "#dc2626",
    borderColor: "#b91c1c",
  },
  label: {
    fontSize: 10,
    color: "#0f172a",
    marginTop: 2,
    fontWeight: "600",
  },
  labelActive: {
    color: "#fff",
  },
});
