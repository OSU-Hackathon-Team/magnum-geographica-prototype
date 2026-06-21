import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MapContainer } from "@magnum/map";
import { createMagnumClient, type System, type Trail } from "@magnum/shared";
import { Card } from "../../src/components/ui/Card";
import { DifficultyBadge } from "../../src/components/ui/DifficultyBadge";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
const MARTIN_URL = process.env.EXPO_PUBLIC_MARTIN_URL;

function SystemMapPreview() {
  return (
    <View style={styles.mapPreview}>
      <MapContainer
        config={{
          baseTileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
          martinTilesUrl: MARTIN_URL,
          initialCenter: [-82.9988, 39.9612],
          initialZoom: 6,
        }}
      />
    </View>
  );
}

export default function SystemDetail() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const [system, setSystem] = useState<System | null>(null);
  const [trails, setTrails] = useState<Trail[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug || typeof slug !== "string") return;
    const client = createMagnumClient(API_URL);
    client
      .getSystemBySlug(slug)
      .then(async (s) => {
        setSystem(s);
        const t = await client.listSystemTrails(s.id).catch(() => ({ items: [] as Trail[], total: 0 }));
        setTrails(t.items);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, [slug]);

  if (error) {
    return (
      <View style={styles.centered} testID="system-detail-error">
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }
  if (!system) {
    return (
      <View style={styles.centered} testID="system-detail-loading">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: system.name, headerShown: true }} />
      <ScrollView style={styles.container} testID="system-detail-screen">
        <SystemMapPreview />

        <View style={styles.section} testID="system-meta">
          <Text style={styles.title} testID="system-name">{system.name}</Text>
          {system.description ? <Text style={styles.body}>{system.description}</Text> : null}
          {system.ownership_source ? (
            <Text style={styles.meta}>Owner: {system.ownership_source}</Text>
          ) : null}
          {system.external_url ? (
            <Pressable
              onPress={() => Linking.openURL(system.external_url!)}
              style={styles.link}
              testID="system-external-link"
            >
              <Ionicons name="open-outline" size={14} color="#22c55e" />
              <Text style={styles.linkText}>Official page</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.section} testID="system-trails">
          <Text style={styles.h2}>Trails ({trails.length})</Text>
          {trails.length === 0 ? (
            <Text style={styles.body} testID="system-trails-empty">No trails yet for this system.</Text>
          ) : (
            trails.map((t) => (
              <Pressable
                key={t.id}
                onPress={() => router.push(`/trail/${t.slug}` as never)}
                testID={`system-trail-card-${t.slug}`}
              >
                <Card>
                  <View style={styles.row}>
                    <Text style={styles.cardTitle}>{t.name}</Text>
                    {t.difficulty ? <DifficultyBadge difficulty={t.difficulty} /> : null}
                  </View>
                  {t.length_meters ? (
                    <Text style={styles.meta}>
                      {(t.length_meters / 1000).toFixed(1)} km
                      {t.elevation_gain_meters
                        ? ` · ${t.elevation_gain_meters.toFixed(0)} m gain`
                        : ""}
                    </Text>
                  ) : null}
                </Card>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { color: "#ef4444", padding: 16 },
  mapPreview: { height: 240, backgroundColor: "#e8e8e8" },
  section: { padding: 16, gap: 8 },
  title: { fontSize: 22, fontWeight: "700" },
  h2: { fontSize: 18, fontWeight: "600", marginBottom: 8 },
  body: { fontSize: 14, color: "#444", lineHeight: 20 },
  meta: { fontSize: 12, color: "#888" },
  link: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  linkText: { fontSize: 13, color: "#22c55e" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { fontSize: 15, fontWeight: "600" },
});
