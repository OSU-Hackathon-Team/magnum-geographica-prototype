import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { createMagnumClient } from "@magnum/shared";
import { SearchBar } from "../../src/components/ui/SearchBar";
import { Card } from "../../src/components/ui/Card";
import { DifficultyBadge } from "../../src/components/ui/DifficultyBadge";
import type { Trail } from "@magnum/shared";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export default function TrailsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<Trail[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    const client = createMagnumClient(API_URL);
    client
      .listTrails({ q: q || undefined })
      .then((res) => setItems(res.items))
      .catch(() => setItems([]));
  }, [q]);

  return (
    <View style={styles.container}>
      <SearchBar value={q} onChangeText={setQ} placeholder="Filter trails..." />
      <FlatList
        data={items}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No trails yet.</Text>}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/trail/${item.slug}` as never)}>
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
