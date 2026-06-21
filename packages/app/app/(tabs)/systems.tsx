import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { createMagnumClient } from "@magnum/shared";
import { SearchBar } from "../../src/components/ui/SearchBar";
import { Card } from "../../src/components/ui/Card";
import type { System } from "@magnum/shared";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export default function SystemsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<System[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    const client = createMagnumClient(API_URL);
    setLoading(true);
    client
      .listSystems({ q: q || undefined })
      .then((res) => setItems(res.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [q]);

  return (
    <View style={styles.container} testID="systems-screen">
      <SearchBar value={q} onChangeText={setQ} placeholder="Filter systems..." testID="systems-search" />
      <FlatList
        data={items}
        keyExtractor={(s) => s.id}
        contentContainerStyle={styles.list}
        testID="systems-list"
        ListEmptyComponent={
          <Text style={styles.empty} testID="systems-empty">
            {loading ? "Loading..." : "No systems yet."}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/system/${item.slug}` as never)}
            testID={`system-card-${item.slug}`}
          >
            <Card>
              <Text style={styles.name}>{item.name}</Text>
              {item.description ? <Text style={styles.desc}>{item.description}</Text> : null}
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
  empty: { textAlign: "center", color: "#888", marginTop: 24 },
  name: { fontSize: 16, fontWeight: "600" },
  desc: { fontSize: 13, color: "#555", marginTop: 4 },
});
