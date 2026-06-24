import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { createMagnumClient } from "@magnum/shared";
import { SearchBar } from "../../src/components/ui/SearchBar";
import { Card } from "../../src/components/ui/Card";
import { DifficultyBadge } from "../../src/components/ui/DifficultyBadge";
import type { Trail } from "@magnum/shared";
import { useOfflineStore } from "../../src/stores/offlineStore";
import { getAllDownloadedTrails } from "../../src/services/offlineDataService";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export default function TrailsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<Trail[]>([]);
  const [q, setQ] = useState("");
  const isOnline = useOfflineStore((s) => s.isOnline);

  useEffect(() => {
    if (!isOnline) {
      void getAllDownloadedTrails().then((rows) => {
        const filtered = q
          ? rows.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()))
          : rows;
        setItems(
          filtered.map((r) => ({
            id: r.id,
            name: r.name,
            slug: r.slug,
            description: r.description,
            difficulty: r.difficulty as Trail["difficulty"],
            length_meters: r.length_meters,
            elevation_gain_meters: r.elevation_gain_meters,
            geometry: null,
            created_at: "",
            updated_at: "",
            verified: Boolean(r.verified),
          })),
        );
      });
      return;
    }
    const client = createMagnumClient(API_URL);
    client
      .listTrails({ q: q || undefined })
      .then((res) => setItems(res.items))
      .catch(() => setItems([]));
  }, [q, isOnline]);

  return (
    <View style={styles.container} testID="trails-screen">
      <SearchBar
        value={q}
        onChangeText={setQ}
        placeholder="Filter trails..."
        testID="trails-search"
      />
      <FlatList
        data={items}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        testID="trails-list"
        ListEmptyComponent={
          <Text style={styles.empty} testID="trails-empty">
            No trails yet.
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/trail/${item.slug}` as never)}
            testID={`trail-card-${item.slug}`}
          >
            <Card>
              <View style={styles.row}>
                <Text style={styles.name}>{item.name}</Text>
                {item.difficulty ? <DifficultyBadge difficulty={item.difficulty} /> : null}
              </View>
              {item.description ? <Text style={styles.desc}>{item.description}</Text> : null}
              {item.length_meters ? (
                <Text style={styles.meta}>
                  {(item.length_meters / 1000).toFixed(1)} km
                  {item.elevation_gain_meters
                    ? ` · ${item.elevation_gain_meters.toFixed(0)} m gain`
                    : ""}
                </Text>
              ) : null}
            </Card>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  list: { padding: 16, gap: 12 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  empty: { textAlign: "center", color: "#888", marginTop: 24 },
  name: { fontSize: 16, fontWeight: "600" },
  desc: { fontSize: 13, color: "#555", marginTop: 4 },
  meta: { fontSize: 12, color: "#888", marginTop: 4 },
});
