import { StyleSheet, Text, View } from "react-native";
import { TIER_COLORS, TIER_LABELS, type TrustTier } from "@magnum/shared/constants";

export interface TrustTierBadgeProps {
  tier: TrustTier;
  karma?: number;
  size?: "small" | "medium";
  testID?: string;
}

/**
 * Small colored badge showing a user's trust tier. The label uses
 * `TIER_LABELS` (New / Established / Trusted / Moderator) and the
 * color comes from `TIER_COLORS` so the badge stays consistent across
 * the app (profile page, comment chips, patrol feed, etc.).
 */
export function TrustTierBadge({ tier, karma, size = "small", testID }: TrustTierBadgeProps) {
  const color = TIER_COLORS[tier];
  const dim = size === "small" ? styles.small : styles.medium;
  return (
    <View
      style={[styles.badge, dim, { backgroundColor: `${color}22`, borderColor: color }]}
      testID={testID}
    >
      <Text style={[styles.label, size === "small" ? styles.labelSmall : null, { color }]}>
        {TIER_LABELS[tier]}
      </Text>
      {karma !== undefined ? (
        <Text style={[styles.karma, { color }]} testID={testID ? `${testID}-karma` : undefined}>
          {` · ${karma.toFixed(0)}`}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 4,
  },
  small: { paddingHorizontal: 6, paddingVertical: 2 },
  medium: { paddingHorizontal: 10, paddingVertical: 4 },
  label: { fontSize: 11, fontWeight: "700" },
  labelSmall: { fontSize: 10 },
  karma: { fontSize: 10, fontWeight: "600" },
});
