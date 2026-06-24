import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { createMagnumClient, type WikiPage, type Revision, type Citation } from "@magnum/shared";
import { WikiPageView } from "../../../src/components/wiki/WikiPageView";
import { useOfflineStore } from "../../../src/stores/offlineStore";
import {
  getWikiPage as getLocalWikiPage,
  getWikiRevisions,
} from "../../../src/services/offlineDataService";

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
  const [loading, setLoading] = useState(true);
  const isOnline = useOfflineStore((s) => s.isOnline);

  const loadLocal = useCallback(async () => {
    if (!targetType || !targetId || typeof targetType !== "string" || typeof targetId !== "string")
      return;
    try {
      const local = await getLocalWikiPage(targetType, targetId);
      if (local) {
        const now = new Date().toISOString();
        setWikiPage({
          id: String(local.id),
          target_type: targetType as WikiPage["target_type"],
          target_id: targetId,
          title: String(local.title ?? ""),
          content_md: String(local.content_md ?? ""),
          rendered_html: "",
          created_at: now,
          updated_at: now,
        });
        const revs = await getWikiRevisions(String(local.id)).catch(() => []);
        setRevisionCount(revs.length);
        setLastRevision(
          revs[0]
            ? {
                id: String(revs[0].id),
                wiki_page_id: String(local.id),
                content_md: String(revs[0].content_md),
                contributor_name: String(revs[0].contributor_name ?? "anonymous"),
                edit_summary: revs[0].edit_summary ? String(revs[0].edit_summary) : null,
                created_at: String(revs[0].created_at),
              }
            : null,
        );
      } else {
        setNotFound(true);
      }
    } catch {
      // DB not ready
    } finally {
      setLoading(false);
    }
  }, [targetType, targetId]);

  useEffect(() => {
    void loadLocal();
  }, [loadLocal]);

  useEffect(() => {
    if (!isOnline) return;
    if (!targetType || !targetId || typeof targetType !== "string" || typeof targetId !== "string")
      return;
    const client = createMagnumClient(API_URL);
    client
      .getWikiPage(targetType, targetId)
      .then(async (page) => {
        setNotFound(false);
        setWikiPage(page);
        const [revsRes, citesRes] = await Promise.all([
          client
            .listWikiPageRevisions(page.id)
            .catch(() => ({ items: [] as Revision[], total: 0, page: 1, pageSize: 20 })),
          client
            .listWikiPageCitations(page.id)
            .catch(() => ({ items: [] as Citation[], total: 0 })),
        ]);
        setRevisionCount(revsRes.total);
        setCitationCount(citesRes.total);
        setLastRevision(revsRes.items[0] ?? null);
      })
      .catch((e: unknown) => {
        if (
          e &&
          typeof e === "object" &&
          "status" in e &&
          (e as { status: number }).status === 404
        ) {
          if (!wikiPage) setNotFound(true);
        } else {
          if (!wikiPage) setError(e instanceof Error ? e.message : "Failed to load");
        }
      });
  }, [isOnline, targetType, targetId, wikiPage]);

  if (loading) {
    return (
      <View style={styles.centered} testID="wiki-page-loading">
        <ActivityIndicator />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered} testID="wiki-page-error">
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (notFound && !wikiPage) {
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
