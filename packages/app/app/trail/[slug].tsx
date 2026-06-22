import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MapContainer } from "@magnum/map";
import { createMagnumClient, type Trail, type TrailSegment, type Feature, type WikiPage } from "@magnum/shared";
import { Card } from "../../src/components/ui/Card";
import { DifficultyBadge } from "../../src/components/ui/DifficultyBadge";
import { SegmentTypeBadge } from "../../src/components/ui/SegmentTypeBadge";
import { ViewOnMapButton } from "../../src/components/ui/ViewOnMapButton";
import { Button } from "../../src/components/ui/Button";
import { useOfflineStore } from "../../src/stores/offlineStore";
import {
  getTrailBySlug,
  getTrailSegments,
  getTrailFeatures,
  getWikiPage as getLocalWikiPage,
} from "../../src/services/offlineDataService";

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
  const [wikiPage, setWikiPage] = useState<WikiPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isOnline = useOfflineStore((s) => s.isOnline);

  useEffect(() => {
    if (!slug || typeof slug !== "string") return;

    if (!isOnline) {
      const loadOffline = async () => {
        const localTrail = await getTrailBySlug(slug);
        if (!localTrail) {
          setError("Trail not downloaded for offline use");
          return;
        }
        const trailId = String(localTrail.id);
        setTrail({
          id: trailId,
          name: String(localTrail.name),
          slug: String(localTrail.slug),
          description: localTrail.description ? String(localTrail.description) : null,
          difficulty: localTrail.difficulty as Trail["difficulty"],
          length_meters: localTrail.length_meters ? Number(localTrail.length_meters) : null,
          elevation_gain_meters: localTrail.elevation_gain_meters ? Number(localTrail.elevation_gain_meters) : null,
          geometry: null,
          created_at: "",
          updated_at: "",
          verified: Boolean(localTrail.verified),
        });
        const [localSegs, localFeats, localWiki] = await Promise.all([
          getTrailSegments(trailId),
          getTrailFeatures(trailId),
          getLocalWikiPage("trail", trailId),
        ]);
        setSegments(
          localSegs.map((s) => ({
            id: String(s.id),
            trail_id: trailId,
            name: s.name ? String(s.name) : null,
            geometry: null,
            sort_order: Number(s.sort_order ?? 0),
            surface_type: s.surface_type ? String(s.surface_type) as TrailSegment["surface_type"] : null,
            hazards: (() => { try { return JSON.parse(String(s.hazards ?? "[]")); } catch { return []; } })(),
            is_road_connector: Boolean(s.is_road_connector),
            steep_grade: Boolean(s.steep_grade),
            one_way: Boolean(s.one_way),
            description: s.description ? String(s.description) : null,
            length_meters: s.length_meters ? Number(s.length_meters) : null,
            created_at: "",
            updated_at: "",
          })),
        );
        setFeatures(
          localFeats.map((f) => ({
            id: String(f.id),
            name: String(f.name),
            type_tag: String(f.type_tag) as Feature["type_tag"],
            point: f.lon != null && f.lat != null ? { type: "Point", coordinates: [Number(f.lon), Number(f.lat)] } : null,
            description: f.description ? String(f.description) : null,
            trail_id: f.trail_id ? String(f.trail_id) : null,
            system_id: f.system_id ? String(f.system_id) : null,
            created_at: "",
            updated_at: "",
          })),
        );
        if (localWiki) {
          setWikiPage({
            id: String(localWiki.id),
            target_type: "trail",
            target_id: trailId,
            title: String(localWiki.title),
            content_md: String(localWiki.content_md),
            rendered_html: "",
            created_at: String(localWiki.updated_at),
            updated_at: String(localWiki.updated_at),
          });
        }
      };
      void loadOffline();
      return;
    }

    const client = createMagnumClient(API_URL);
    client
      .getTrailBySlug(slug)
      .then(async (t) => {
        setTrail(t);
        const [segs, feats, wiki] = await Promise.all([
          client.listTrailSegments(t.id).catch(() => ({ items: [] as TrailSegment[], total: 0 })),
          client.listTrailFeatures(t.id).catch(() => ({ items: [] as Feature[], total: 0 })),
          client.getWikiPage("trail", t.id).catch(() => null),
        ]);
        setSegments(segs.items);
        setFeatures(feats.items);
        if (wiki) setWikiPage(wiki as WikiPage);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, [slug, isOnline]);

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
          <ViewOnMapButton center={trail.center ?? null} zoom={11} testID="trail-view-on-map" />
        </View>

        <View style={styles.section} testID="trail-wiki">
          <View style={styles.row}>
            <Text style={styles.h2}>Wiki</Text>
            <Button
              variant={wikiPage ? "ghost" : "primary"}
              size="small"
              onPress={() =>
                router.push(`/wiki/edit/trail/${trail.id}` as never)
              }
              testID="trail-wiki-edit"
            >
              {wikiPage ? "Edit" : "Create"}
            </Button>
          </View>
          {wikiPage ? (
            <Pressable
              onPress={() => router.push(`/wiki/trail/${trail.id}` as never)}
              testID="trail-wiki-view"
            >
              <Text style={styles.wikiPreview} numberOfLines={3}>
                {wikiPage.content_md || "No content yet."}
              </Text>
            </Pressable>
          ) : (
            <Text style={styles.body}>No wiki page yet for this trail.</Text>
          )}
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
  wikiPreview: {
    fontSize: 13,
    color: "#555",
    lineHeight: 18,
    backgroundColor: "#f9fafb",
    padding: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#e8e8e8",
  },
});
