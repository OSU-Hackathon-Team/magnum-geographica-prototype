import { StyleSheet, Text, View } from "react-native";
import { DIFFICULTY_COLORS, type Difficulty } from "@magnum/shared";

export function DifficultyBadge({ difficulty }: { difficulty: Difficulty | string }) {
  const color =
    (DIFFICULTY_COLORS as Record<string, string>)[difficulty] ?? DIFFICULTY_COLORS.easy;
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.text}>{String(difficulty).toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  text: { color: "#fff", fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
});
