import { StyleSheet, Text, View } from "react-native";
import { TRAIL_TIER_COLORS, TRAIL_TIER_LABELS, type TrailTier } from "@magnum/shared";
import { useTheme } from "../../providers/ThemeProvider";

/**
 * §21.6 — Trail tier badge. Renders Premium / Elevated / Synthesized
 * next to the trail name and the existing `verified` badge. The colour
 * comes from the shared `TRAIL_TIER_COLORS` map; the label comes from
 * `TRAIL_TIER_LABELS` so the wording stays in sync with the rest of
 * the client (admin queue, etc.).
 */
export function TrailTierBadge({ tier }: { tier: TrailTier | string }) {
  const { colors } = useTheme();
  const color =
    (TRAIL_TIER_COLORS as Record<string, string>)[tier] ?? TRAIL_TIER_COLORS.synthesized;
  const label = (TRAIL_TIER_LABELS as Record<string, string>)[tier] ?? tier;
  return (
    <View
      style={[styles.badge, { backgroundColor: color }]}
      testID={`trail-tier-badge-${tier}`}
    >
      <Text style={[styles.text, { color: colors.textInverse }]} testID="trail-tier-label">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  text: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
});
