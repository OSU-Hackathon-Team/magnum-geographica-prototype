import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { createMagnumClient, type WikiPage, type Revision, type Citation } from "@magnum/shared";
import { WikiPageView } from "../../../src/components/wiki/WikiPageView";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export default function WikiPageScreen() {
  const { targetType, targetId } = useLocalSearchParams<{ targetType: string; targetId: string }>();
  const router = useRouter();
  const [wikiPage, setWikiPage] = useState<WikiPage | null>(null);
  const [revisionCount, setRevisionCount] = useState(0);
  const [citationCount, setCitationCount] = useState(0);
  const [lastRevision, setLastRevision] = useState<Revision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!targetType || !targetId || typeof targetType !== "string" || typeof targetId !== "string") return;
    const client = createMagnumClient(API_URL);
    client
      .getWikiPage(targetType, targetId)
      .then(async (page) => {
        setWikiPage(page);
        const [revsRes, citesRes] = await Promise.all([
          client.listWikiPageRevisions(page.id).catch(() => ({ items: [] as Revision[], total: 0, page: 1, pageSize: 20 })),
          client.listWikiPageCitations(page.id).catch(() => ({ items: [] as Citation[], total: 0 })),
        ]);
        setRevisionCount(revsRes.total);
        setCitationCount(citesRes.total);
        setLastRevision(revsRes.items[0] ?? null);
      })
      .catch((e: unknown) => {
        if (e && typeof e === "object" && "status" in e && (e as { status: number }).status === 404) {
          setNotFound(true);
        } else {
          setError(e instanceof Error ? e.message : "Failed to load");
        }
      });
  }, [targetType, targetId]);

  if (error) {
    return (
      <View style={styles.centered} testID="wiki-page-error">
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (notFound) {
    return (
      <>
        <Stack.Screen options={{ title: "Wiki" }} />
        <View style={styles.centered} testID="wiki-page-not-found">
          <Text style={styles.emptyTitle}>No wiki page yet</Text>
          <Text style={styles.emptySub}>There is no wiki page for this {targetType}.</Text>
        </View>
      </>
    );
  }

  if (!wikiPage) {
    return (
      <View style={styles.centered} testID="wiki-page-loading">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: wikiPage.title }} />
      <ScrollView style={styles.container} testID="wiki-page-screen">
        <WikiPageView
          wikiPage={wikiPage}
          citationCount={citationCount}
          revisionCount={revisionCount}
          lastRevision={lastRevision}
          onEdit={() => router.push(`/wiki/edit/${targetType}/${targetId}` as never)}
          onViewHistory={() => router.push(`/wiki/edit/${targetType}/${targetId}` as never)}
        />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  errorText: { color: "#ef4444", fontSize: 14 },
  emptyTitle: { fontSize: 18, fontWeight: "600", color: "#666" },
  emptySub: { fontSize: 13, color: "#999", marginTop: 4 },
});
