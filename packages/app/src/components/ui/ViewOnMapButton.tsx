import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { buildExploreDeepLink, type MapCenter } from "@magnum/shared";

export interface ViewOnMapButtonProps {
  center: MapCenter | null | undefined;
  zoom?: number;
  label?: string;
  testID?: string;
}

export function ViewOnMapButton({ center, zoom, label, testID }: ViewOnMapButtonProps) {
  const router = useRouter();

  if (!center) return null;

  const handlePress = () => {
    router.push(buildExploreDeepLink({ center, zoom }) as never);
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
      testID={testID ?? "view-on-map"}
    >
      <View style={styles.row}>
        <Ionicons name="map-outline" size={14} color="#fff" />
        <Text style={styles.text}>{label ?? "View on map"}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    alignSelf: "flex-start",
    backgroundColor: "#22c55e",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  btnPressed: { opacity: 0.85 },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  text: { color: "#fff", fontSize: 13, fontWeight: "600" },
});
