import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import {
  createMagnumClient,
  type WikiPage,
  type Revision,
  type Citation,
} from "@magnum/shared";
import { WikiPageEditor } from "../../../../src/components/wiki/WikiPageEditor";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export default function WikiEditScreen() {
  const { targetType, targetId } = useLocalSearchParams<{ targetType: string; targetId: string }>();
  const router = useRouter();
  const [wikiPage, setWikiPage] = useState<WikiPage | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [contributorName, setContributorName] = useState("anonymous");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        setRevisions(revsRes.items);
        setCitations(citesRes.items);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (e && typeof e === "object" && "status" in e && (e as { status: number }).status === 404) {
          setWikiPage(null);
          setLoading(false);
        } else {
          setError(e instanceof Error ? e.message : "Failed to load");
          setLoading(false);
        }
      });
  }, [targetType, targetId]);

  async function handleSave(data: { title: string; content_md: string; edit_summary: string }) {
    if (!targetType || !targetId || typeof targetType !== "string" || typeof targetId !== "string") return;
    setSaving(true);
    setError(null);
    const client = createMagnumClient(API_URL);
    try {
      if (wikiPage) {
        const updated = await client.updateWikiPage(wikiPage.id, {
          title: data.title,
          content_md: data.content_md,
          contributor_name: contributorName || "anonymous",
          edit_summary: data.edit_summary || undefined,
        });
        setWikiPage(updated);
      } else {
        const created = await client.createWikiPage({
          target_type: targetType as WikiPage["target_type"],
          target_id: targetId,
          title: data.title,
          content_md: data.content_md,
          contributor_name: contributorName || "anonymous",
          edit_summary: data.edit_summary,
        });
        setWikiPage(created);
      }
      router.back();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleRevert(revisionId: string) {
    if (!wikiPage) return;
    setSaving(true);
    setError(null);
    const client = createMagnumClient(API_URL);
    try {
      const updated = await client.revertWikiPage(wikiPage.id, {
        revision_id: revisionId,
        contributor_name: contributorName || "anonymous",
      });
      setWikiPage(updated);
      router.back();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to revert");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddCitation(data: { url?: string; title: string }) {
    if (!wikiPage) return;
    const client = createMagnumClient(API_URL);
    try {
      const created = await client.createCitation({
        wiki_page_id: wikiPage.id,
        title: data.title,
        url: data.url ?? null,
      });
      setCitations((prev) => [...prev, created]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to add citation");
    }
  }

  async function handleDeleteCitation(citationId: string) {
    const client = createMagnumClient(API_URL);
    try {
      await client.deleteCitation(citationId);
      setCitations((prev) => prev.filter((c) => c.id !== citationId));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete citation");
    }
  }

  if (loading) {
    return (
      <View style={styles.centered} testID="wiki-edit-loading">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: wikiPage ? "Edit Wiki" : "Create Wiki" }} />
      {error ? (
        <View style={styles.errorBanner} testID="wiki-edit-error">
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
      <WikiPageEditor
        wikiPage={wikiPage}
        isLoading={loading}
        contributorName={contributorName}
        onContributorNameChange={setContributorName}
        onSave={handleSave}
        canSave={!saving}
        revisions={revisions}
        onRevert={handleRevert}
        citations={citations}
        onAddCitation={handleAddCitation}
        onDeleteCitation={handleDeleteCitation}
      />
    </>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorBanner: { backgroundColor: "#fef2f2", padding: 10 },
  errorText: { color: "#ef4444", fontSize: 13 },
});
