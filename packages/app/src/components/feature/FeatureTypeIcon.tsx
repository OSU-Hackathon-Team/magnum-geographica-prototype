import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FEATURE_ICONS, FEATURE_TYPES } from "@magnum/shared";

const ICON_NAMES: Record<(typeof FEATURE_TYPES)[number], keyof typeof Ionicons.glyphMap> = {
  trailhead: "flag",
  shelter: "home",
  water_source: "water",
  scenic_point: "eye",
  restroom: "man",
  parking: "car",
  campground: "bonfire",
  bridge: "git-network",
  tunnel: "subway",
  sign: "information-circle",
  intersection: "git-merge",
  other: "ellipse",
};

const ICON_COLORS: Record<(typeof FEATURE_TYPES)[number], string> = {
  trailhead: "#22c55e",
  shelter: "#8B4513",
  water_source: "#3b82f6",
  scenic_point: "#f59e0b",
  restroom: "#6366f1",
  parking: "#64748b",
  campground: "#059669",
  bridge: "#7c3aed",
  tunnel: "#475569",
  sign: "#dc2626",
  intersection: "#f97316",
  other: "#9ca3af",
};

export interface FeatureTypeIconProps {
  type: string;
  size?: number;
}

export function FeatureTypeIcon({ type, size = 16 }: FeatureTypeIconProps) {
  const iconName = ICON_NAMES[type as keyof typeof ICON_NAMES] ?? "ellipse";
  const color = ICON_COLORS[type as keyof typeof ICON_COLORS] ?? "#9ca3af";
  const label = FEATURE_ICONS[type as keyof typeof FEATURE_ICONS] ?? "?";

  return (
    <View style={styles.container}>
      <Ionicons name={iconName} size={size} color={color} />
      <Text style={[styles.label, { fontSize: size * 0.6, color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: "#f8fafc",
    borderRadius: 4,
  },
  label: { fontWeight: "600" },
});
