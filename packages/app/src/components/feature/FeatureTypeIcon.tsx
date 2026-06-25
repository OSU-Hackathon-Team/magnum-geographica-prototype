import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FEATURE_ICONS, FEATURE_TYPES } from "@magnum/shared";

/**
 * Fallback map for legacy `type_tag`-based features. The new code path
 * is DB-driven via the `preset` prop (preset.icon_name → Ionicons glyph).
 * When a feature has neither preset nor legacy tag we render a neutral
 * "?" dot.
 */
const LEGACY_ICON_NAMES: Record<(typeof FEATURE_TYPES)[number], string> = {
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

const LEGACY_ICON_COLORS: Record<(typeof FEATURE_TYPES)[number], string> = {
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

/**
 * Map preset key → Ionicons glyph. The full preset table is in
 * `packages/api/drizzle/0004_presets.sql`; this map mirrors the icons
 * chosen there. Adding a preset requires updating both places (the
 * preset table is the source of truth, this map is the rendering
 * fallback when offline and the preset hasn't been synced yet).
 */
const PRESET_ICON_NAMES: Record<string, string> = {
  bench: "cafe",
  picnic_table: "restaurant",
  shelter: "home",
  campsite: "bonfire",
  drinking_water: "water",
  spring: "water",
  restroom: "man",
  waste_basket: "trash",
  trailhead: "flag",
  map_board: "map",
  guidepost: "navigate",
  sign: "information-circle",
  intersection: "git-merge",
  fallen_tree: "warning",
  washout: "warning",
  steep_section: "trending-up",
  road_connector: "car-sport",
  viewpoint: "eye",
  notable_tree: "leaf",
  waterfall: "rainy",
  cave_entrance: "moon",
  bridge: "git-network",
  tunnel: "subway",
};

const PRESET_ICON_COLORS: Record<string, string> = {
  bench: "#8B4513",
  picnic_table: "#8B4513",
  shelter: "#059669",
  campsite: "#059669",
  drinking_water: "#3b82f6",
  spring: "#3b82f6",
  restroom: "#6366f1",
  waste_basket: "#6366f1",
  trailhead: "#22c55e",
  map_board: "#22c55e",
  guidepost: "#22c55e",
  sign: "#dc2626",
  intersection: "#f97316",
  fallen_tree: "#dc2626",
  washout: "#dc2626",
  steep_section: "#f59e0b",
  road_connector: "#888888",
  viewpoint: "#f59e0b",
  notable_tree: "#16a34a",
  waterfall: "#3b82f6",
  cave_entrance: "#475569",
  bridge: "#7c3aed",
  tunnel: "#475569",
};

export interface PresetIconInfo {
  /** DB-driven icon name. Takes precedence over legacy `type_tag`. */
  iconName?: string;
  iconColor?: string;
  /** Preset key for the fallback map. */
  presetKey?: string;
}

export interface FeatureTypeIconProps {
  /**
   * Legacy `type_tag` (deprecated, kept for offline data that hasn't
   * been backfilled). Falls back when no `preset` is provided.
   */
  type?: string;
  /**
   * DB-driven preset info. When supplied, the icon and color come from
   * the preset, not the legacy `FEATURE_ICONS` map.
   */
  preset?: PresetIconInfo;
  /** Short label shown next to the icon. */
  label?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

function resolveIcon(
  type: string | undefined,
  preset: PresetIconInfo | undefined,
): { name: string; color: string } {
  if (preset?.iconName) {
    return {
      name: preset.iconName,
      color: preset.iconColor ?? "#9ca3af",
    };
  }
  if (preset?.presetKey && PRESET_ICON_NAMES[preset.presetKey]) {
    return {
      name: PRESET_ICON_NAMES[preset.presetKey] ?? "ellipse",
      color: PRESET_ICON_COLORS[preset.presetKey] ?? "#9ca3af",
    };
  }
  if (type && (FEATURE_TYPES as readonly string[]).includes(type)) {
    return {
      name: LEGACY_ICON_NAMES[type as keyof typeof LEGACY_ICON_NAMES] ?? "ellipse",
      color: LEGACY_ICON_COLORS[type as keyof typeof LEGACY_ICON_COLORS] ?? "#9ca3af",
    };
  }
  return { name: "ellipse", color: "#9ca3af" };
}

export function FeatureTypeIcon({
  type,
  preset,
  label,
  size = 16,
  style,
  testID,
}: FeatureTypeIconProps) {
  const { name, color } = resolveIcon(type, preset);
  const displayLabel =
    label ?? preset?.presetKey ?? type ?? "?";
  return (
    <View style={[styles.container, style]} testID={testID}>
      <Ionicons name={name as never} size={size} color={color} />
      <Text
        style={[
          styles.label,
          { fontSize: size * 0.6, color },
        ]}
        numberOfLines={1}
      >
        {displayLabel.replace(/_/g, " ")}
      </Text>
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

// Suppress unused-import warning — FEATURE_ICONS is exposed for legacy
// code that hasn't migrated to presets yet, but FeatureTypeIcon now uses
// its own label fallback.
void FEATURE_ICONS;
