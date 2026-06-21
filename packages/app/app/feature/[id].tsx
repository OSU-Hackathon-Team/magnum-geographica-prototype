import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { createMagnumClient, type Feature, type WikiPage } from "@magnum/shared";
import { ViewOnMapButton } from "../../src/components/ui/ViewOnMapButton";
import { Button } from "../../src/components/ui/Button";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export default function FeatureDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [feature, setFeature] = useState<Feature | null>(null);
  const [wikiPage, setWikiPage] = useState<WikiPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || typeof id !== "string") return;
    const client = createMagnumClient(API_URL);
    client
      .getFeature(id)
      .then(async (f) => {
        setFeature(f);
        const w = await client.getWikiPage("feature", f.id).catch(() => null);
        if (w) setWikiPage(w as WikiPage);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, [id]);

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
          <Text style={styles.title} testID="feature-name">{feature.name}</Text>
          <Text style={styles.badge}>{feature.type_tag}</Text>
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
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { color: "#ef4444", padding: 16 },
  section: { padding: 16, gap: 8 },
  title: { fontSize: 22, fontWeight: "700" },
  h2: { fontSize: 18, fontWeight: "600" },
  body: { fontSize: 14, color: "#444", lineHeight: 20 },
  badge: {
    fontSize: 12,
    color: "#666",
    backgroundColor: "#f1f1f1",
    paddingHorizontal: 8,
    paddingVertical: 4,
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
