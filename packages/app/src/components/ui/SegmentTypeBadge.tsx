import { StyleSheet, Text, View } from "react-native";
import { SURFACE_COLORS, type SurfaceType } from "@magnum/shared";

export function SegmentTypeBadge({ surface }: { surface: SurfaceType | string }) {
  const color =
    (SURFACE_COLORS as Record<string, string>)[surface] ?? SURFACE_COLORS.natural;
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.text, { color }]}>{String(surface).replace("_", " ").toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    backgroundColor: "#fff",
  },
  text: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
});
