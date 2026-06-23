import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MapContainer } from "@magnum/map";
import { createMagnumClient, type System, type Trail, type WikiPage } from "@magnum/shared";
import { Card } from "../../src/components/ui/Card";
import { DifficultyBadge } from "../../src/components/ui/DifficultyBadge";
import { ViewOnMapButton } from "../../src/components/ui/ViewOnMapButton";
import { Button } from "../../src/components/ui/Button";
import { WikiPageView } from "../../src/components/wiki/WikiPageView";
import { getAllDownloadedSystems } from "../../src/services/offlineDataService";
import { useOfflineStore } from "../../src/stores/offlineStore";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
const MARTIN_URL = process.env.EXPO_PUBLIC_MARTIN_URL ?? "http://localhost:3001";

function SystemMapPreview() {
  return (
    <View style={styles.mapPreview}>
      <MapContainer
        config={{
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
  const [wikiPage, setWikiPage] = useState<WikiPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOfflineAvailable, setIsOfflineAvailable] = useState(false);
  const isOnline = useOfflineStore((s) => s.isOnline);
  const offlineRegions = useOfflineStore((s) => s.offlineRegions);

  useFocusEffect(
    useCallback(() => {
      if (!slug || typeof slug !== "string") return;
      const client = createMagnumClient(API_URL);

      if (!isOnline) {
        // Check if system data is available offline (from a downloaded region)
        getAllDownloadedSystems().then((localSystems) => {
          const found = localSystems.find(
            (s: Record<string, unknown>) => String(s.slug) === slug,
          );
          if (found) {
            setSystem({
              id: String(found.id),
              name: String(found.name),
              slug: String(found.slug),
              description: null,
              boundary: null,
              ownership_source: null,
              source_date: null,
              external_url: null,
              created_at: "",
              updated_at: "",
            } as System);
            setIsOfflineAvailable(true);
          } else {
            setError("Offline and not downloaded");
          }
        }).catch(() => setError("Offline and not downloaded"));
        return;
      }

      client
        .getSystemBySlug(slug)
        .then(async (s) => {
          setSystem(s);
          const [t, w] = await Promise.all([
            client.listSystemTrails(s.id).catch(() => ({ items: [] as Trail[], total: 0 })),
            client.getWikiPage("system", s.id).catch(() => null),
          ]);
          setTrails(t.items);
          if (w) setWikiPage(w as WikiPage);

          // Check if available offline
          getAllDownloadedSystems().then((localSystems) => {
            const found = localSystems.some(
              (ls: Record<string, unknown>) => String(ls.id) === s.id,
            );
            setIsOfflineAvailable(found);
          }).catch(() => {});
        })
        .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"));
    }, [slug, isOnline]),
  );

  useEffect(() => {
    if (!system) return;
    // Check if this system ID is in any downloaded region
    getAllDownloadedSystems().then((localSystems) => {
      const found = localSystems.some(
        (s: Record<string, unknown>) => String(s.id) === system.id,
      );
      setIsOfflineAvailable(found);
    }).catch(() => {});
  }, [offlineRegions, system]);

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
          <ViewOnMapButton center={system.center ?? null} zoom={9} testID="system-view-on-map" />
          {isOfflineAvailable ? (
            <Text style={styles.meta} testID="system-offline-ready">Available offline</Text>
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

        <View style={styles.section} testID="system-wiki">
          <View style={styles.row}>
            <Text style={styles.h2}>Wiki</Text>
            <Button
              variant={wikiPage ? "ghost" : "primary"}
              size="small"
              onPress={() =>
                router.push({
                  pathname: "/wiki/edit/system/[targetId]" as never,
                  params: { targetId: system.id, defaultTitle: system.name },
                } as never)
              }
              testID="system-wiki-edit"
            >
              {wikiPage ? "Edit" : "Create"}
            </Button>
          </View>
          {wikiPage ? (
            <Pressable
              onPress={() => router.push(`/wiki/system/${system.id}` as never)}
              testID="system-wiki-view"
            >
              <View style={styles.wikiPreviewBox}>
                <WikiPageView wikiPage={wikiPage} compact />
              </View>
            </Pressable>
          ) : (
            <Text style={styles.body}>No wiki page yet for this system.</Text>
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
  wikiPreviewBox: {
    backgroundColor: "#f9fafb",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#e8e8e8",
    padding: 4,
  },
});
