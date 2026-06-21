import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MapContainer } from "@magnum/map";
import { createMagnumClient, type Trail, type TrailSegment, type Feature } from "@magnum/shared";
import { Card } from "../../src/components/ui/Card";
import { DifficultyBadge } from "../../src/components/ui/DifficultyBadge";
import { SegmentTypeBadge } from "../../src/components/ui/SegmentTypeBadge";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
const MARTIN_URL = process.env.EXPO_PUBLIC_MARTIN_URL;

function TrailMapPreview() {
  return (
    <View style={styles.mapPreview}>
      <MapContainer
        config={{
          baseTileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
          martinTilesUrl: MARTIN_URL,
          initialCenter: [-82.9988, 39.9612],
          initialZoom: 8,
        }}
      />
    </View>
  );
}

export default function TrailDetail() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const [trail, setTrail] = useState<Trail | null>(null);
  const [segments, setSegments] = useState<TrailSegment[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug || typeof slug !== "string") return;
    const client = createMagnumClient(API_URL);
    client
      .getTrailBySlug(slug)
      .then(async (t) => {
        setTrail(t);
        const [segs, feats] = await Promise.all([
          client.listTrailSegments(t.id).catch(() => ({ items: [] as TrailSegment[], total: 0 })),
          client.listTrailFeatures(t.id).catch(() => ({ items: [] as Feature[], total: 0 })),
        ]);
        setSegments(segs.items);
        setFeatures(feats.items);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, [slug]);

  if (error) {
    return (
      <View style={styles.centered} testID="trail-detail-error">
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }
  if (!trail) {
    return (
      <View style={styles.centered} testID="trail-detail-loading">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: trail.name, headerShown: true }} />
      <ScrollView style={styles.container} testID="trail-detail-screen">
        <TrailMapPreview />

        <View style={styles.section} testID="trail-meta">
          <View style={styles.row}>
            <Text style={styles.title} testID="trail-name">{trail.name}</Text>
            {trail.difficulty ? <DifficultyBadge difficulty={trail.difficulty} /> : null}
          </View>
          <View style={styles.statsRow} testID="trail-stats">
            {trail.length_meters ? (
              <Text style={styles.stat} testID="trail-length">
                <IoniconsLabel name="resize" /> {(trail.length_meters / 1000).toFixed(1)} km
              </Text>
            ) : null}
            {trail.elevation_gain_meters ? (
              <Text style={styles.stat} testID="trail-elevation">
                <IoniconsLabel name="trending-up" /> {trail.elevation_gain_meters.toFixed(0)} m
              </Text>
            ) : null}
            {trail.verified ? (
              <Text style={[styles.stat, styles.verified]} testID="trail-verified">
                <IoniconsLabel name="checkmark-circle" /> Verified
              </Text>
            ) : null}
          </View>
          {trail.description ? <Text style={styles.body}>{trail.description}</Text> : null}
        </View>

        <View style={styles.section} testID="trail-segments">
          <Text style={styles.h2}>Segments ({segments.length})</Text>
          {segments.length === 0 ? (
            <Text style={styles.body} testID="trail-segments-empty">No segments yet.</Text>
          ) : (
            segments.map((s) => (
              <Card key={s.id} testID={`trail-segment-${s.id}`}>
                <View style={styles.row}>
                  <Text style={styles.cardTitle}>
                    {s.name ?? `Segment ${s.sort_order + 1}`}
                  </Text>
                  {s.surface_type ? <SegmentTypeBadge surface={s.surface_type} /> : null}
                </View>
                {s.hazards.length > 0 ? (
                  <Text style={styles.meta} testID={`trail-segment-hazards-${s.id}`}>
                    Hazards: {s.hazards.join(", ")}
                  </Text>
                ) : null}
                <View style={styles.flagsRow}>
                  {s.steep_grade ? <Text style={styles.flag}>Steep</Text> : null}
                  {s.is_road_connector ? <Text style={styles.flag}>Road connector</Text> : null}
                  {s.one_way ? <Text style={styles.flag}>One-way</Text> : null}
                  {s.length_meters ? (
                    <Text style={styles.flag} testID={`trail-segment-length-${s.id}`}>
                      {(s.length_meters / 1000).toFixed(2)} km
                    </Text>
                  ) : null}
                </View>
              </Card>
            ))
          )}
        </View>

        <View style={styles.section} testID="trail-features">
          <Text style={styles.h2}>Features ({features.length})</Text>
          {features.length === 0 ? (
            <Text style={styles.body} testID="trail-features-empty">No features yet.</Text>
          ) : (
            features.map((f) => (
              <Pressable
                key={f.id}
                onPress={() => router.push(`/feature/${f.id}` as never)}
                testID={`trail-feature-${f.id}`}
              >
                <Card>
                  <View style={styles.row}>
                    <Text style={styles.cardTitle}>{f.name}</Text>
                    <Text style={styles.flag} testID={`trail-feature-type-${f.id}`}>{f.type_tag}</Text>
                  </View>
                  {f.description ? <Text style={styles.body}>{f.description}</Text> : null}
                </Card>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>
    </>
  );
}

function IoniconsLabel({ name }: { name: "resize" | "trending-up" | "checkmark-circle" }) {
  return <Ionicons name={name} size={12} color="#666" />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { color: "#ef4444", padding: 16 },
  mapPreview: { height: 240, backgroundColor: "#e8e8e8" },
  section: { padding: 16, gap: 8 },
  title: { fontSize: 22, fontWeight: "700", flexShrink: 1 },
  h2: { fontSize: 18, fontWeight: "600", marginBottom: 8 },
  body: { fontSize: 14, color: "#444", lineHeight: 20 },
  meta: { fontSize: 12, color: "#888" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 4 },
  stat: { fontSize: 12, color: "#666" },
  verified: { color: "#22c55e" },
  cardTitle: { fontSize: 15, fontWeight: "600" },
  flagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  flag: {
    fontSize: 10,
    color: "#666",
    backgroundColor: "#f1f1f1",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
});
