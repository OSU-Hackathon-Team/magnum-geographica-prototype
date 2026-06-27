import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { createMagnumClient } from "@magnum/shared";
import { SearchBar } from "../../src/components/ui/SearchBar";
import { Card } from "../../src/components/ui/Card";
import { DifficultyBadge } from "../../src/components/ui/DifficultyBadge";
import type { Trail } from "@magnum/shared";
import { useTheme } from "../../src/providers/ThemeProvider";
import { useOfflineStore } from "../../src/stores/offlineStore";
import { getAllDownloadedTrails } from "../../src/services/offlineDataService";
import { spacing, text as textTokens } from "../../src/theme/tokens";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export default function TrailsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
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
    <View style={[styles.container, { backgroundColor: colors.bg }]} testID="trails-screen">
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
          <Text
            style={[textTokens.body, { color: colors.textMuted, textAlign: "center", marginTop: spacing.xxl }]}
            testID="trails-empty"
          >
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
                <Text style={[textTokens.bodyStrong, { color: colors.text, flex: 1 }]}>
                  {item.name}
                </Text>
                {item.difficulty ? <DifficultyBadge difficulty={item.difficulty} /> : null}
              </View>
              {item.description ? (
                <Text
                  style={[textTokens.meta, { color: colors.textSecondary, marginTop: spacing.xxs }]}
                >
                  {item.description}
                </Text>
              ) : null}
              {item.length_meters ? (
                <Text
                  style={[textTokens.meta, { color: colors.textMuted, marginTop: spacing.xxs }]}
                >
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
  container: { flex: 1 },
  list: { padding: spacing.lg, gap: spacing.md },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
});
