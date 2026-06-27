import { StyleSheet, Text, View } from "react-native";
import { DIFFICULTY_COLORS, type Difficulty } from "@magnum/shared";
import { useTheme } from "../../providers/ThemeProvider";

export function DifficultyBadge({ difficulty }: { difficulty: Difficulty | string }) {
  const { colors } = useTheme();
  const color = (DIFFICULTY_COLORS as Record<string, string>)[difficulty] ?? DIFFICULTY_COLORS.easy;
  return (
    <View
      style={[styles.badge, { backgroundColor: color }]}
      testID={`difficulty-badge-${difficulty}`}
    >
      <Text style={[styles.text, { color: colors.textInverse }]} testID="difficulty-label">
        {String(difficulty).toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  text: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
});
