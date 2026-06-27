import { StyleSheet, Text, View } from "react-native";
import { SURFACE_COLORS, type SurfaceType } from "@magnum/shared";
import { useTheme } from "../../providers/ThemeProvider";

export function SegmentTypeBadge({ surface }: { surface: SurfaceType | string }) {
  const { colors } = useTheme();
  const color = (SURFACE_COLORS as Record<string, string>)[surface] ?? SURFACE_COLORS.natural;
  return (
    <View style={[styles.badge, { borderColor: color, backgroundColor: colors.surface }]} testID={`segment-type-badge-${surface}`}>
      <Text style={[styles.text, { color }]} testID="segment-type-label">
        {String(surface).replace("_", " ").toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  text: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
});
