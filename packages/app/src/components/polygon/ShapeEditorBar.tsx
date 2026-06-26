import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

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
  return (
    <View style={styles.container} testID={testID ?? "boundary-bar"}>
      <Pressable
        onPress={onBack}
        style={styles.btn}
        testID="boundary-back"
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Ionicons name="arrow-back" size={20} color="#0f172a" />
      </Pressable>
      <View style={styles.titleWrap}>
        <Text style={styles.title} testID="boundary-title" numberOfLines={1}>
          {title}
        </Text>
        {hint && !saveError ? (
          <Text style={styles.hint} testID="boundary-hint" numberOfLines={1}>
            {hint}
          </Text>
        ) : null}
        {saveError ? (
          <Text style={styles.error} testID="boundary-save-error" numberOfLines={2}>
            {saveError}
          </Text>
        ) : null}
      </View>
      <Pressable
        onPress={onSave}
        style={[styles.btn, saveDisabled && styles.btnDisabled]}
        testID="boundary-save"
        hitSlop={8}
        disabled={saveDisabled}
        accessibilityRole="button"
        accessibilityLabel="Save boundary"
      >
        <Ionicons name="checkmark" size={22} color={saveDisabled ? "#cbd5e1" : "#22c55e"} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    gap: 12,
  },
  btn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  btnDisabled: {
    backgroundColor: "#f8fafc",
  },
  titleWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0f172a",
    textAlign: "center",
  },
  hint: {
    fontSize: 11,
    color: "#16a34a",
    textAlign: "center",
    marginTop: 2,
  },
  error: {
    fontSize: 11,
    color: "#dc2626",
    textAlign: "center",
    marginTop: 2,
  },
});

