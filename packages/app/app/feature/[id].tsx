import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { createMagnumClient, type Feature, type WikiPage } from "@magnum/shared";
import { ViewOnMapButton } from "../../src/components/ui/ViewOnMapButton";
import { Button } from "../../src/components/ui/Button";
import { FeatureTypeIcon } from "../../src/components/feature/FeatureTypeIcon";
import { MediaGallery, type MediaItem } from "../../src/components/media/MediaGallery";
import { ImageViewer } from "../../src/components/media/ImageViewer";
import { useOfflineStore } from "../../src/stores/offlineStore";
import {
  getFeatureById,
  getWikiPage as getLocalWikiPage,
} from "../../src/services/offlineDataService";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export default function FeatureDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [feature, setFeature] = useState<Feature | null>(null);
  const [wikiPage, setWikiPage] = useState<WikiPage | null>(null);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isOnline = useOfflineStore((s) => s.isOnline);

  useEffect(() => {
    if (!id || typeof id !== "string") return;

    if (!isOnline) {
      const loadOffline = async () => {
        const local = await getFeatureById(id);
        if (!local) {
          setError("Feature not downloaded for offline use");
          return;
        }
        setFeature({
          id: String(local.id),
          name: String(local.name),
          type_tag: String(local.type_tag) as Feature["type_tag"],
          point: local.lon != null && local.lat != null ? { type: "Point", coordinates: [Number(local.lon), Number(local.lat)] } : null,
          description: local.description ? String(local.description) : null,
          trail_id: local.trail_id ? String(local.trail_id) : null,
          system_id: local.system_id ? String(local.system_id) : null,
          created_at: "",
          updated_at: "",
        });
        const localWiki = await getLocalWikiPage("feature", id);
        if (localWiki) {
          setWikiPage({
            id: String(localWiki.id),
            target_type: "feature",
            target_id: id,
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
      .getFeature(id)
      .then(async (f) => {
        setFeature(f);
        const [w, mediaRes] = await Promise.all([
          client.getWikiPage("feature", f.id).catch(() => null),
          client.raw.request<{ items: MediaItem[] }>("GET", `/api/media?feature_id=${f.id}`).catch(() => ({ items: [] as MediaItem[] })),
        ]);
        if (w) setWikiPage(w as WikiPage);
        setMediaItems(mediaRes.items);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, [id, isOnline]);

  if (error) {
    return (
      <View style={styles.centered} testID="feature-detail-error">
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }
  if (!feature) {
    return (
      <View style={styles.centered} testID="feature-detail-loading">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: feature.name, headerShown: true }} />
      <ScrollView style={styles.container} testID="feature-detail-screen">
        <View style={styles.section} testID="feature-meta">
          <View style={styles.nameRow}>
            <FeatureTypeIcon type={feature.type_tag} size={20} />
            <Text style={styles.title} testID="feature-name">{feature.name}</Text>
          </View>
          <Text style={styles.typeTag}>{feature.type_tag.replace(/_/g, " ")}</Text>
          {feature.description ? <Text style={styles.body}>{feature.description}</Text> : null}
          <ViewOnMapButton center={feature.center ?? null} zoom={14} testID="feature-view-on-map" />
        </View>

        {feature ? (
          <View style={styles.section} testID="feature-wiki">
            <View style={styles.row}>
              <Text style={styles.h2}>Wiki</Text>
              <Button
                variant={wikiPage ? "ghost" : "primary"}
                size="small"
                onPress={() =>
                  router.push(`/wiki/edit/feature/${feature.id}` as never)
                }
                testID="feature-wiki-edit"
              >
                {wikiPage ? "Edit" : "Create"}
              </Button>
            </View>
            {wikiPage ? (
              <Pressable
                onPress={() => router.push(`/wiki/feature/${feature.id}` as never)}
                testID="feature-wiki-view"
              >
                <Text style={styles.wikiPreview} numberOfLines={3}>
                  {wikiPage.content_md || "No content yet."}
                </Text>
              </Pressable>
            ) : (
              <Text style={styles.body}>No wiki page yet for this feature.</Text>
            )}
          </View>
          ) : null}

        <View style={styles.section} testID="feature-media">
          <Text style={styles.h2}>Photos</Text>
          <MediaGallery
            items={mediaItems}
            onPress={(item) => setViewerUri(item.thumbnail_url || item.data_url || null)}
            testID="feature-media-gallery"
          />
        </View>
      </ScrollView>

      <ImageViewer
        visible={viewerUri !== null}
        uri={viewerUri}
        onClose={() => setViewerUri(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { color: "#ef4444", padding: 16 },
  section: { padding: 16, gap: 8 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 22, fontWeight: "700", flexShrink: 1 },
  h2: { fontSize: 18, fontWeight: "600", marginBottom: 4 },
  body: { fontSize: 14, color: "#444", lineHeight: 20 },
  typeTag: {
    fontSize: 12,
    color: "#666",
    textTransform: "capitalize",
    backgroundColor: "#f1f1f1",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: "flex-start",
  },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
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
