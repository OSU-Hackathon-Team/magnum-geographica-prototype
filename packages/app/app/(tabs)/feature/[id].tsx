import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { createMagnumClient, type Feature, type Preset, type WikiPage } from "@magnum/shared";
import { ViewOnMapButton } from "@/components/ui/ViewOnMapButton";
import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Section";
import { StatusPill } from "@/components/ui/StatusPill";
import { Card } from "@/components/ui/Card";
import { WikiPageView } from "@/components/wiki/WikiPageView";
import { FeatureTypeIcon } from "@/components/feature/FeatureTypeIcon";
import { MediaGallery, type MediaItem } from "@/components/media/MediaGallery";
import { MediaUploader } from "@/components/media/MediaUploader";
import { ImageViewer } from "@/components/media/ImageViewer";
import { VoteControl } from "@/components/vote/VoteControl";
import { useTheme } from "@/providers/ThemeProvider";
import { useOfflineStore } from "@/stores/offlineStore";
import { useAuthStore } from "@/stores/authStore";
import { usePresetStore } from "@/stores/presetStore";
import { radii, spacing, text as textTokens } from "@/theme/tokens";
import {
  addPendingContribution,
  getFeatureById,
  getPendingCount,
  getWikiPage as getLocalWikiPage,
} from "@/services/offlineDataService";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

interface FeatureWithPreset extends Feature {
  preset_id?: string | null; preset_key?: string | null; preset_label?: string | null;
  preset_icon_name?: string | null; preset_icon_color?: string | null;
  preset_questions?: Array<{ key: string; type: "boolean" | "select"; label: string; options?: { value: string; label: string }[] }>;
  answers?: Record<string, unknown> | null;
}

export default function FeatureDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const [feature, setFeature] = useState<FeatureWithPreset | null>(null);
  const [wikiPage, setWikiPage] = useState<WikiPage | null>(null);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showUploader, setShowUploader] = useState(false);
  const isOnline = useOfflineStore((s) => s.isOnline);
  const setPendingCount = useOfflineStore((s) => s.setPendingCount);
  const contributorName = useAuthStore((s) => s.contributorName);
  const fetchPresets = usePresetStore((s) => s.fetchPresets);
  const loadPresetsFromCache = usePresetStore((s) => s.loadFromCache);

  useFocusEffect(useCallback(() => {
    if (!id || typeof id !== "string") return;
    if (!isOnline) {
      const loadOffline = async () => {
        const local = await getFeatureById(id);
        if (!local) { setError("Feature not downloaded for offline use"); return; }
        setFeature({ id: String(local.id), name: String(local.name), type_tag: local.type_tag ? String(local.type_tag) as Feature["type_tag"] : null, preset_id: local.preset_id ? String(local.preset_id) : null, answers: null, point: local.lon != null && local.lat != null ? { type: "Point", coordinates: [Number(local.lon), Number(local.lat)] } : null, description: local.description ? String(local.description) : null, trail_id: local.trail_id ? String(local.trail_id) : null, system_id: local.system_id ? String(local.system_id) : null, created_at: "", updated_at: "", });
        const localWiki = await getLocalWikiPage("feature", id);
        if (localWiki) setWikiPage({ id: String(localWiki.id), target_type: "feature", target_id: id, title: String(localWiki.title), content_md: String(localWiki.content_md), rendered_html: "", created_at: String(localWiki.updated_at), updated_at: String(localWiki.updated_at), });
      };
      void loadOffline(); void loadPresetsFromCache(); return;
    }
    const client = createMagnumClient(API_URL);
    client.getFeature(id).then(async (f) => {
      setFeature(f as FeatureWithPreset);
      const [w, mediaRes, preset] = await Promise.all([
        client.getWikiPage("feature", f.id).catch(() => null),
        client.raw.request<{ items: MediaItem[] }>("GET", `/api/media?feature_id=${f.id}`).catch(() => ({ items: [] as MediaItem[] })),
        f.preset_id ? client.raw.request<Preset>("GET", `/api/presets/${f.preset_id}`).catch(() => null) : Promise.resolve(null),
      ]);
      if (w) setWikiPage(w as WikiPage);
      setMediaItems(mediaRes.items);
      if (preset) setFeature((prev) => prev ? { ...prev, preset_questions: preset.questions, preset_icon_name: preset.icon_name, preset_icon_color: preset.icon_color, preset_label: preset.label, preset_key: preset.key } : prev);
      await loadPresetsFromCache();
    }).catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"));
    void fetchPresets();
  }, [fetchPresets, id, isOnline, loadPresetsFromCache]));

  const refreshMedia = async () => {
    if (!isOnline || !feature) return;
    const client = createMagnumClient(API_URL);
    try { const mediaRes = await client.raw.request<{ items: MediaItem[] }>("GET", `/api/media?feature_id=${feature.id}`); setMediaItems(mediaRes.items); } catch { /* keep current */ }
  };

  const handleMediaSelect = async (base64: string, mimeType: string) => {
    if (!feature) return; setUploadingMedia(true); setUploadError(null);
    const payload = { feature_id: feature.id, data: base64, mime_type: mimeType };
    try {
      if (!isOnline) { await addPendingContribution("media", "create", payload, contributorName || "anonymous", feature.id); setPendingCount(await getPendingCount()); setShowUploader(false); return; }
      const client = createMagnumClient(API_URL); await client.createMedia(payload as Parameters<typeof client.createMedia>[0]);
      await refreshMedia(); setShowUploader(false);
    } catch (e) { setUploadError(e instanceof Error ? e.message : "Failed to upload photo"); }
    finally { setUploadingMedia(false); }
  };

  if (error) return (
    <View style={[styles.centered, { backgroundColor: colors.bg }]} testID="feature-detail-error">
      <Ionicons name="alert-circle-outline" size={36} color={colors.danger} />
      <Text style={[textTokens.body, { color: colors.danger, marginTop: spacing.sm }]}>{error}</Text>
    </View>
  );
  if (!feature) return (
    <View style={[styles.centered, { backgroundColor: colors.bg }]} testID="feature-detail-loading">
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );

  const answersList: Array<{ key: string; label: string; value: string }> = [];
  if (feature.preset_questions && feature.answers) {
    for (const q of feature.preset_questions) {
      const raw = (feature.answers as Record<string, unknown>)[q.key];
      if (raw === undefined || raw === null) continue;
      answersList.push({ key: q.key, label: q.label, value: q.type === "boolean" ? (raw ? "Yes" : "No") : q.options?.find((o) => o.value === raw)?.label ?? String(raw) });
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: feature.name, headerShown: true, presentation: "modal", headerLeft: () => (
        <Pressable onPress={() => router.back()} style={styles.closeBtn} testID="feature-detail-close" accessibilityLabel="Close">
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </Pressable>
      ) }} />
      <ScrollView style={[styles.container, { backgroundColor: colors.bg }]} testID="feature-detail-screen">
        <Section hero testID="feature-meta">
          <View style={styles.nameRow}>
            <FeatureTypeIcon type={feature.type_tag ?? undefined} preset={{ iconName: feature.preset_icon_name ?? undefined, iconColor: feature.preset_icon_color ?? undefined, presetKey: feature.preset_key ?? undefined }} label={feature.preset_label ?? undefined} size={20} />
            <Text style={[textTokens.title, { color: colors.text, flexShrink: 1 }]} testID="feature-name">{feature.name}</Text>
          </View>
          {feature.preset_label ? (
            <StatusPill label={feature.preset_label} tone="success" style={styles.presetPill} testID="feature-preset-label" />
          ) : null}
          {answersList.length > 0 ? (
            <View style={styles.answersRow} testID="feature-answers">
              {answersList.map((a) => (
                <View key={a.key} style={[styles.answerBadge, { backgroundColor: colors.surfaceMuted }]}>
                  <Text style={[textTokens.meta, { color: colors.textMuted }]}>{a.label}:</Text>
                  <Text style={[textTokens.small, { color: colors.text }]}>{a.value}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {feature.description ? <Text style={[textTokens.body, { color: colors.textSecondary }]}>{feature.description}</Text> : null}
          <View style={styles.actionsRow}>
            <VoteControl targetType="feature" targetId={feature.id} size="small" testID="feature-vote" />
            <ViewOnMapButton center={feature.center ?? null} zoom={14} testID="feature-view-on-map" />
          </View>
        </Section>

        <Section title="Photos" action={<Button variant={showUploader ? "ghost" : "primary"} size="small" onPress={() => setShowUploader((v) => !v)} testID="feature-media-toggle">{showUploader ? "Cancel" : "Add Photo"}</Button>} testID="feature-media">
          {showUploader ? (
            <View testID="feature-media-uploader">
              {!isOnline ? (
                <View style={[styles.offlineBanner, { backgroundColor: colors.warningMuted, borderColor: colors.warning }]}>
                  <Ionicons name="cloud-offline-outline" size={14} color={colors.warning} />
                  <Text style={[textTokens.meta, { color: colors.warning, flex: 1 }]}>Offline — photo will be saved locally and synced when back online.</Text>
                </View>
              ) : null}
              <MediaUploader onSelect={handleMediaSelect} uploading={uploadingMedia} testID="feature-media-uploader-component" />
              {uploadError ? <Text style={[textTokens.meta, { color: colors.danger, marginTop: spacing.xs }]} testID="feature-media-upload-error">{uploadError}</Text> : null}
            </View>
          ) : null}
          <MediaGallery items={mediaItems} onPress={(item) => setViewerUri(item.thumbnail_url || item.data_url || null)} testID="feature-media-gallery" />
        </Section>

        <Section title="Wiki" action={<Button variant={wikiPage ? "ghost" : "primary"} size="small" onPress={() => router.push({ pathname: "/wiki/edit/feature/[targetId]" as never, params: { targetId: feature.id, defaultTitle: feature.name } } as never)} testID="feature-wiki-edit">{wikiPage ? "Edit" : "Create"}</Button>} testID="feature-wiki">
          {wikiPage ? (
            <Pressable onPress={() => router.push(`/wiki/feature/${feature.id}` as never)} testID="feature-wiki-view">
              <Card variant="tinted"><WikiPageView wikiPage={wikiPage} compact /></Card>
            </Pressable>
          ) : (
            <Text style={[textTokens.body, { color: colors.textMuted, fontStyle: "italic" }]}>No wiki page yet for this feature.</Text>
          )}
        </Section>
      </ScrollView>
      <ImageViewer visible={viewerUri !== null} uri={viewerUri} onClose={() => setViewerUri(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  presetPill: { marginTop: spacing.xs },
  answersRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.xs },
  answerBadge: { flexDirection: "row", gap: spacing.xxs, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radii.sm },
  actionsRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.xs },
  offlineBanner: { flexDirection: "row", alignItems: "center", gap: spacing.xs, padding: spacing.sm, borderRadius: radii.sm, borderWidth: 1, marginBottom: spacing.sm },
  closeBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
});
