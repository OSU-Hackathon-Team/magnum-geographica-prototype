import { StyleSheet, View } from "react-native";
import { MapContainer } from "@magnum/map";
import { SearchBar } from "../../src/components/ui/SearchBar";

const MARTIN_URL = process.env.EXPO_PUBLIC_MARTIN_URL;

export default function ExploreScreen() {
  return (
    <View style={styles.container} testID="explore-screen">
      <SearchBar placeholder="Search trails, systems, features..." testID="explore-search" />
      <View style={styles.mapContainer} testID="explore-map">
        <MapContainer
          config={{
            baseTileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
            martinTilesUrl: MARTIN_URL,
            initialCenter: [-82.9988, 39.9612],
            initialZoom: 6,
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  mapContainer: { flex: 1 },
});
