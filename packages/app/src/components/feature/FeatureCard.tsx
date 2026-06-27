import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ReactNode } from "react";
import { FeatureTypeIcon } from "./FeatureTypeIcon";
import { Card } from "../ui/Card";
import { useTheme } from "../../providers/ThemeProvider";

export interface FeatureCardProps {
  id: string;
  name: string;
  typeTag: string;
  description?: string | null;
  onPress: () => void;
  rightElement?: ReactNode;
  testID?: string;
}

export function FeatureCard({
  id,
  name,
  typeTag,
  description,
  onPress,
  rightElement,
  testID,
}: FeatureCardProps) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} testID={testID}>
      <Card testID={`feature-card-${id}`}>
        <View style={styles.row}>
          <View style={styles.left}>
            <View style={styles.nameRow}>
              <FeatureTypeIcon type={typeTag} size={14} />
              <Text style={[styles.name, { color: colors.text }]}>{name}</Text>
            </View>
            {description ? (
              <Text style={[styles.desc, { color: colors.textSecondary }]} numberOfLines={2}>
                {description}
              </Text>
            ) : null}
          </View>
          {rightElement}
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  left: { flex: 1, gap: 4 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { fontSize: 15, fontWeight: "600" },
  desc: { fontSize: 13, marginTop: 4 },
});
