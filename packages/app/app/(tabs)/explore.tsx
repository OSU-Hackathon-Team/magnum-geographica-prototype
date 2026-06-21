import { StyleSheet, Text, View } from "react-native";
import { useEffect } from "react";
import { useOfflineStore } from "../../src/stores/offlineStore";
import { SearchBar } from "../../src/components/ui/SearchBar";

export default function ExploreScreen() {
  const isOnline = useOfflineStore((s) => s.isOnline);

  useEffect(() => {
    void isOnline;
  }, [isOnline]);

  return (
    <View style={styles.container} testID="explore-screen">
      <SearchBar placeholder="Search trails, systems, features..." testID="explore-search" />
      <View style={styles.mapPlaceholder} testID="explore-map">
        <Text style={styles.mapText}>Map</Text>
        <Text style={styles.mapHint}>Wired up in Phase 1 (OpenLayers + Martin tiles)</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  mapPlaceholder: {
    flex: 1,
    margin: 16,
    borderRadius: 12,
    backgroundColor: "#e8e8e8",
    alignItems: "center",
    justifyContent: "center",
  },
  mapText: { fontSize: 24, fontWeight: "600", color: "#555" },
  mapHint: { fontSize: 12, color: "#888", marginTop: 8 },
});
