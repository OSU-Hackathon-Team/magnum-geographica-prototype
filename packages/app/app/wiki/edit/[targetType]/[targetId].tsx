import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import {
  createMagnumClient,
  type WikiPage,
  type Revision,
  type Citation,
} from "@magnum/shared";
import { WikiPageEditor } from "../../../../src/components/wiki/WikiPageEditor";
import { useOfflineStore } from "../../../../src/stores/offlineStore";
import { useAuthStore } from "../../../../src/stores/authStore";
import {
  getWikiPage as getLocalWikiPage,
  addPendingContribution,
  getWikiRevisions,
  getPendingCount,
} from "../../../../src/services/offlineDataService";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export default function WikiEditScreen() {
  const { targetType, targetId, defaultTitle } = useLocalSearchParams<{
    targetType: string;
    targetId: string;
    defaultTitle?: string;
  }>();
  const router = useRouter();
  const [wikiPage, setWikiPage] = useState<WikiPage | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [contributorName, setContributorName] = useState("anonymous");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOnline = useOfflineStore((s) => s.isOnline);
  const setPendingCount = useOfflineStore((s) => s.setPendingCount);
  const storedContributor = useAuthStore((s) => s.contributorName);

  useEffect(() => {
    setContributorName(storedContributor);
  }, [storedContributor]);

  const load = useCallback(async () => {
    if (!targetType || !targetId || typeof targetType !== "string" || typeof targetId !== "string") return;
    setLoading(true);
    setError(null);
    try {
      const local = await getLocalWikiPage(targetType, targetId).catch(() => null);
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
        const localRevs = await getWikiRevisions(String(local.id)).catch(() => []);
        setRevisions(
          localRevs.map((r) => ({
            id: String(r.id),
            wiki_page_id: String(local.id),
            content_md: String(r.content_md),
            contributor_name: String(r.contributor_name ?? "anonymous"),
            edit_summary: r.edit_summary ? String(r.edit_summary) : null,
            created_at: String(r.created_at),
          })),
        );
      }
    } catch {
      // local DB might not be initialized yet
    }
    setLoading(false);
  }, [targetType, targetId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isOnline || !targetType || !targetId) return;
    if (typeof targetType !== "string" || typeof targetId !== "string") return;
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
      })
      .catch((e: unknown) => {
        if (!e || typeof e !== "object" || !("status" in e) || (e as { status: number }).status !== 404) {
          // Don't overwrite the local page with a 404 if we already loaded it
        }
      });
  }, [isOnline, targetType, targetId]);

  async function handleSave(data: { title: string; content_md: string; edit_summary: string }) {
    if (!targetType || !targetId || typeof targetType !== "string" || typeof targetId !== "string") return;
    setSaving(true);
    setError(null);
    const finalContributor = contributorName || "anonymous";
    const client = createMagnumClient(API_URL);
    try {
      if (!isOnline) {
        await addPendingContribution(
          "wiki_page",
          wikiPage ? "update" : "create",
          {
            target_type: targetType,
            target_id: targetId,
            title: data.title,
            content_md: data.content_md,
            edit_summary: data.edit_summary,
          },
          finalContributor,
          wikiPage?.id,
        );
        const newCount = await getPendingCount();
        setPendingCount(newCount);
        router.back();
        return;
      }

      if (wikiPage) {
        const updated = await client.updateWikiPage(wikiPage.id, {
          title: data.title,
          content_md: data.content_md,
          contributor_name: finalContributor,
          edit_summary: data.edit_summary || undefined,
        });
        setWikiPage(updated);
      } else {
        const created = await client.createWikiPage({
          target_type: targetType as WikiPage["target_type"],
          target_id: targetId,
          title: data.title,
          content_md: data.content_md,
          contributor_name: finalContributor,
          edit_summary: data.edit_summary,
        });
        setWikiPage(created);
      }
      router.back();
    } catch (e: unknown) {
      // If network failed mid-save, queue it offline
      const msg = e instanceof Error ? e.message : "Failed to save";
      const isNetworkError = /network|fetch|timeout|ENOTFOUND|ECONNREFUSED|ETIMEDOUT/i.test(msg);
      if (isNetworkError) {
        try {
          await addPendingContribution(
            "wiki_page",
            wikiPage ? "update" : "create",
            {
              target_type: targetType,
              target_id: targetId,
              title: data.title,
              content_md: data.content_md,
              edit_summary: data.edit_summary,
            },
            finalContributor,
            wikiPage?.id,
          );
          const newCount = await getPendingCount();
          setPendingCount(newCount);
          router.back();
          return;
        } catch (queueErr) {
          setError(queueErr instanceof Error ? queueErr.message : "Failed to queue edit");
        }
      } else {
        setError(msg);
      }
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
    if (!isOnline) {
      setError("Citations require an online connection");
      return;
    }
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
    if (!isOnline) {
      setError("Citation changes require an online connection");
      return;
    }
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
      {!isOnline ? (
        <View style={styles.offlineBanner} testID="wiki-edit-offline-banner">
          <Text style={styles.offlineText}>
            Offline — your changes will be saved locally and synced when you&apos;re back online.
          </Text>
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
        defaultTitle={typeof defaultTitle === "string" ? defaultTitle : undefined}
      />
    </>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorBanner: { backgroundColor: "#fef2f2", padding: 10 },
  errorText: { color: "#ef4444", fontSize: 13 },
  offlineBanner: { backgroundColor: "#fef9c3", padding: 10 },
  offlineText: { color: "#854d0e", fontSize: 12 },
});
