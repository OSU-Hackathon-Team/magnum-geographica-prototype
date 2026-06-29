import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTraceStore } from "../../stores/traceStore";
import { persistTraceAnnotation } from "../../services/backgroundGeolocationService";
import { useTheme } from "../../providers/ThemeProvider";
import { radii, spacing } from "../../theme/tokens";

const SURFACE_OPTIONS = [
  { key: "natural", label: "Natural", icon: "leaf-outline" },
  { key: "gravel", label: "Gravel", icon: "ellipse-outline" },
  { key: "paved", label: "Paved", icon: "hardware-chip-outline" },
  { key: "boardwalk", label: "Boardwalk", icon: "grid-outline" },
  { key: "road_connector", label: "Road", icon: "car-outline" },
] as const;

/**
 * §Phase 10 — Inline annotation dock. Rendered during recording
 * below the stats row. Three buttons, no typing, 1-2 taps each.
 */
export function AnnotationDock() {
  const { colors } = useTheme();
  const activeSessionId = useTraceStore((s) => s.activeSessionId);
  const isPseudoActive = useTraceStore((s) => s.isPseudoActive);
  const setPseudoActive = useTraceStore((s) => s.setPseudoActive);

  const [showSurfacePicker, setShowSurfacePicker] = useState(false);
  const [showTrailNameInput, setShowTrailNameInput] = useState(false);
  const [trailName, setTrailName] = useState("");

  const recordAnnotation = useCallback(
    (type: string, value: string | null = null) => {
      if (!activeSessionId) return;
      persistTraceAnnotation(activeSessionId, type, value).catch(console.warn);
    },
    [activeSessionId],
  );

  const handleSurfaceLongPress = useCallback(() => {
    setShowSurfacePicker(true);
  }, []);

  const handleSurfaceSelect = useCallback(
    (surfaceKey: string) => {
      recordAnnotation("surface_change", surfaceKey);
      setShowSurfacePicker(false);
    },
    [recordAnnotation],
  );

  const handleRoadCrossing = useCallback(() => {
    recordAnnotation("road_crossing");
  }, [recordAnnotation]);

  const handlePseudoToggle = useCallback(() => {
    if (isPseudoActive) {
      recordAnnotation("pseudo_trail_end");
      setPseudoActive(false);
    } else {
      recordAnnotation("pseudo_trail_start");
      setPseudoActive(true);
    }
  }, [isPseudoActive, recordAnnotation, setPseudoActive]);

  const handleTrailTransition = useCallback(() => {
    recordAnnotation("trail_transition", trailName.trim() || null);
    setShowTrailNameInput(false);
    setTrailName("");
  }, [recordAnnotation, trailName]);

  const handleTrailPress = useCallback(() => {
    setShowTrailNameInput((v) => !v);
  }, []);

  return (
    <View style={styles.container} testID="annotation-dock">
      {isPseudoActive ? (
        <View
          style={[styles.pseudoBanner, { backgroundColor: colors.danger }]}
          testID="annotation-pseudo-banner"
        >
          <Ionicons name="warning" size={14} color={colors.textInverse} />
          <Text style={[styles.pseudoBannerText, { color: colors.textInverse }]}>
            Pseudo-trail active — tap again to end
          </Text>
        </View>
      ) : null}

      {showSurfacePicker ? (
        <View style={styles.surfacePicker} testID="annotation-surface-picker">
          {SURFACE_OPTIONS.map((opt) => (
            <Pressable
              key={opt.key}
              onPress={() => handleSurfaceSelect(opt.key)}
              style={({ pressed }) => [
                styles.surfaceOption,
                { backgroundColor: colors.surfaceMuted },
                pressed && styles.btnPressed,
              ]}
              testID={`annotation-surface-${opt.key}`}
            >
              <Ionicons name={opt.icon} size={16} color={colors.primary} />
              <Text style={[styles.surfaceLabel, { color: colors.text }]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {showTrailNameInput ? (
        <TextInput
          style={[styles.nameInput, { color: colors.text, backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}
          placeholder="Trail name (optional)"
          placeholderTextColor={colors.textMuted}
          value={trailName}
          onChangeText={setTrailName}
          autoFocus
          testID="annotation-trail-name-input"
        />
      ) : null}

      <View style={[styles.row, { backgroundColor: colors.surfaceMutedStrong }]}>
        <Pressable
          onLongPress={handleSurfaceLongPress}
          onPress={() => recordAnnotation("surface_change", "gravel")}
          style={({ pressed }) => [
            styles.btn,
            { backgroundColor: colors.surfaceMuted },
            pressed && styles.btnPressed,
          ]}
          testID="annotation-surface"
        >
          <Ionicons name="layers-outline" size={18} color={colors.primary} />
          <Text style={[styles.btnLabel, { color: colors.textSecondary }]}>
            Surface
          </Text>
        </Pressable>

        <Pressable
          onPress={handleRoadCrossing}
          style={({ pressed }) => [
            styles.btn,
            { backgroundColor: colors.surfaceMuted },
            pressed && styles.btnPressed,
          ]}
          testID="annotation-road-crossing"
        >
          <Ionicons name="car-outline" size={18} color={colors.warning} />
          <Text style={[styles.btnLabel, { color: colors.textSecondary }]}>
            Road cross
          </Text>
        </Pressable>

        <Pressable
          onPress={handlePseudoToggle}
          style={({ pressed }) => [
            styles.btn,
            {
              backgroundColor: isPseudoActive
                ? colors.dangerMuted
                : colors.surfaceMuted,
            },
            pressed && styles.btnPressed,
          ]}
          testID="annotation-pseudo-toggle"
        >
          <Ionicons
            name={isPseudoActive ? "footsteps" : "footsteps-outline"}
            size={18}
            color={isPseudoActive ? colors.danger : colors.textSecondary}
          />
          <Text
            style={[
              styles.btnLabel,
              { color: isPseudoActive ? colors.danger : colors.textSecondary },
            ]}
          >
            {isPseudoActive ? "End pseudo" : "Pseudo"}
          </Text>
        </Pressable>

        <Pressable
          onPress={showTrailNameInput ? handleTrailTransition : handleTrailPress}
          style={({ pressed }) => [
            styles.btn,
            { backgroundColor: showTrailNameInput ? colors.primaryMuted : colors.surfaceMuted },
            pressed && styles.btnPressed,
          ]}
          testID="annotation-trail-transition"
        >
          <Ionicons name="flag-outline" size={18} color={showTrailNameInput ? colors.primary : "#3b82f6"} />
          <Text style={[styles.btnLabel, { color: showTrailNameInput ? colors.primary : colors.textSecondary }]}>
            {showTrailNameInput ? "Save" : "Trail"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  pseudoBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
  },
  pseudoBannerText: { fontSize: 12, fontWeight: "700", flex: 1 },
  row: {
    flexDirection: "row",
    gap: 8,
    padding: 6,
    borderRadius: 10,
  },
  btn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 8,
    gap: 4,
  },
  btnPressed: { opacity: 0.7 },
  btnLabel: { fontSize: 11, fontWeight: "600" },
  surfacePicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  surfaceOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
  },
  surfaceLabel: { fontSize: 12, fontWeight: "600" },
  nameInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
  },
});
