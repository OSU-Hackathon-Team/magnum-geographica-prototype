import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MapContainer } from "@magnum/map";
import {
  createMagnumClient,
  type Trail,
  type TrailSegment,
  type Feature,
  type WikiPage,
  type UpdateSegmentInput,
} from "@magnum/shared";
import { Card } from "@/components/ui/Card";
import { Section } from "@/components/ui/Section";
import { DifficultyBadge } from "@/components/ui/DifficultyBadge";
import { TrailTierBadge } from "@/components/ui/TrailTierBadge";
import { SegmentTypeBadge } from "@/components/ui/SegmentTypeBadge";
import { StatusPill } from "@/components/ui/StatusPill";
import { ViewOnMapButton } from "@/components/ui/ViewOnMapButton";
import { Button } from "@/components/ui/Button";
import { WikiPageView } from "@/components/wiki/WikiPageView";
import { FeatureTypeIcon } from "@/components/feature/FeatureTypeIcon";
import { SegmentEditList } from "@/components/trail/SegmentEditor";
import { useTheme } from "@/providers/ThemeProvider";
import { useOfflineStore } from "@/stores/offlineStore";
import { useAuthStore } from "@/stores/authStore";
import { radii, spacing, text as textTokens } from "@/theme/tokens";
import {
  addPendingContribution,
  getTrailBySlug,
  getTrailSegments,
  getTrailFeatures,
  getPendingCount,
  getWikiPage as getLocalWikiPage,
  updateLocalSegment,
  deleteLocalSegment,
  reorderLocalSegments,
} from "@/services/offlineDataService";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
const MARTIN_URL = process.env.EXPO_PUBLIC_MARTIN_URL ?? "http://localhost:3001";

function TrailMapPreview({ center, geometry }: { center?: { lon: number; lat: number } | null; geometry?: unknown }) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.mapPreview, { backgroundColor: colors.surfaceMuted, borderBottomColor: colors.divider }]}
    >
      <MapContainer
        config={{
          martinTilesUrl: MARTIN_URL,
          initialCenter: center ? [center.lon, center.lat] : [-82.9988, 39.9612],
          initialZoom: 12,
        }}
        fitGeometry={geometry ?? null}
      />
    </View>
  );
}

export default function TrailDetail() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const [trail, setTrail] = useState<Trail | null>(null);
  const [segments, setSegments] = useState<TrailSegment[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [wikiPage, setWikiPage] = useState<WikiPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [splittingId, setSplittingId] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const isOnline = useOfflineStore((s) => s.isOnline);
  const setPendingCount = useOfflineStore((s) => s.setPendingCount);
  const contributorName = useAuthStore((s) => s.contributorName);

  const refreshSegments = useCallback(
    async (trailId: string) => {
      if (isOnline) {
        const client = createMagnumClient(API_URL);
        try {
          const segs = await client.listTrailSegments(trailId);
          setSegments(segs.items);
          return;
        } catch {
          // fall through to local
        }
      }
      const localSegs = await getTrailSegments(trailId);
      setSegments(
        localSegs.map((s) => ({
          id: String(s.id),
          trail_id: trailId,
          name: s.name ? String(s.name) : null,
          geometry: null,
          sort_order: Number(s.sort_order ?? 0),
          surface_type: s.surface_type
            ? (String(s.surface_type) as TrailSegment["surface_type"])
            : null,
          hazards: (() => {
            try { return JSON.parse(String(s.hazards ?? "[]")); } catch { return []; }
          })(),
          is_road_connector: Boolean(s.is_road_connector),
          steep_grade: Boolean(s.steep_grade),
          one_way: Boolean(s.one_way),
          description: s.description ? String(s.description) : null,
          length_meters: s.length_meters ? Number(s.length_meters) : null,
          created_at: "", updated_at: "",
        })),
      );
    },
    [isOnline],
  );

  useFocusEffect(
    useCallback(() => {
      if (!slug || typeof slug !== "string") return;

      if (!isOnline) {
        const loadOffline = async () => {
          const localTrail = await getTrailBySlug(slug);
          if (!localTrail) { setError("Trail not downloaded for offline use"); return; }
          const trailId = String(localTrail.id);
          setTrail({
            id: trailId, name: String(localTrail.name), slug: String(localTrail.slug),
            description: localTrail.description ? String(localTrail.description) : null,
            difficulty: localTrail.difficulty as Trail["difficulty"],
            length_meters: localTrail.length_meters ? Number(localTrail.length_meters) : null,
            elevation_gain_meters: localTrail.elevation_gain_meters ? Number(localTrail.elevation_gain_meters) : null,
            geometry: null, created_at: "", updated_at: "", verified: Boolean(localTrail.verified),
          });
          const [localSegs, localFeats, localWiki] = await Promise.all([
            getTrailSegments(trailId), getTrailFeatures(trailId), getLocalWikiPage("trail", trailId),
          ]);
          setSegments(localSegs.map((s) => ({
            id: String(s.id), trail_id: trailId, name: s.name ? String(s.name) : null,
            geometry: null, sort_order: Number(s.sort_order ?? 0),
            surface_type: s.surface_type ? String(s.surface_type) as TrailSegment["surface_type"] : null,
            hazards: (() => { try { return JSON.parse(String(s.hazards ?? "[]")); } catch { return []; } })(),
            is_road_connector: Boolean(s.is_road_connector), steep_grade: Boolean(s.steep_grade),
            one_way: Boolean(s.one_way), description: s.description ? String(s.description) : null,
            length_meters: s.length_meters ? Number(s.length_meters) : null, created_at: "", updated_at: "",
          })));
          setFeatures(localFeats.map((f) => ({
            id: String(f.id), name: String(f.name), type_tag: String(f.type_tag) as Feature["type_tag"],
            point: f.lon != null && f.lat != null ? { type: "Point", coordinates: [Number(f.lon), Number(f.lat)] } : null,
            description: f.description ? String(f.description) : null,
            trail_id: f.trail_id ? String(f.trail_id) : null, system_id: f.system_id ? String(f.system_id) : null,
            created_at: "", updated_at: "",
          })));
          if (localWiki) setWikiPage({ id: String(localWiki.id), target_type: "trail", target_id: trailId, title: String(localWiki.title), content_md: String(localWiki.content_md), rendered_html: "", created_at: String(localWiki.updated_at), updated_at: String(localWiki.updated_at), });
        };
        void loadOffline(); return;
      }

      const client = createMagnumClient(API_URL);
      client.getTrailBySlug(slug).then(async (t) => {
        setTrail(t);
        const [segs, feats, wiki] = await Promise.all([
          client.listTrailSegments(t.id).catch(() => ({ items: [] as TrailSegment[], total: 0 })),
          client.listTrailFeatures(t.id).catch(() => ({ items: [] as Feature[], total: 0 })),
          client.getWikiPage("trail", t.id).catch(() => null),
        ]);
        setSegments(segs.items); setFeatures(feats.items);
        if (wiki) setWikiPage(wiki as WikiPage);
      }).catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"));
    }, [slug, isOnline]),
  );

  const handleSegmentUpdate = async (id: string, body: UpdateSegmentInput) => {
    if (!trail) return; setSavingId(id); setPendingId(id);
    try {
      if (isOnline) { const client = createMagnumClient(API_URL); await client.updateSegment(id, body); await refreshSegments(trail.id); }
      else { await addPendingContribution("trail_segment", "update", { id, ...body }, contributorName || "anonymous", id); await updateLocalSegment(id, { name: body.name, surface_type: body.surface_type, hazards: body.hazards, is_road_connector: body.is_road_connector, steep_grade: body.steep_grade, one_way: body.one_way, description: body.description, }); await refreshSegments(trail.id); const newCount = await getPendingCount(); setPendingCount(newCount); }
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to save segment"); }
    finally { setSavingId(null); setPendingId(null); }
  };

  const handleSegmentDelete = async (id: string) => {
    if (!trail) return; setDeletingId(id);
    try {
      if (isOnline) { const client = createMagnumClient(API_URL); await client.deleteSegment(id); await refreshSegments(trail.id); }
      else { await addPendingContribution("trail_segment", "delete", { id }, contributorName || "anonymous", id); await deleteLocalSegment(id); await refreshSegments(trail.id); const newCount = await getPendingCount(); setPendingCount(newCount); }
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to delete segment"); }
    finally { setDeletingId(null); }
  };

  const handleSegmentSplit = async (id: string, splitAt: number, nameA?: string, nameB?: string) => {
    if (!trail) return; setSplittingId(id);
    try {
      if (isOnline) { const client = createMagnumClient(API_URL); const res = await client.splitSegment(trail.id, { segment_id: id, split_at: splitAt, name_a: nameA, name_b: nameB }); setSegments(res.items); }
      else { await addPendingContribution("trail_segment", "split", { id, split_at: splitAt, name_a: nameA, name_b: nameB }, contributorName || "anonymous", id); await refreshSegments(trail.id); const newCount = await getPendingCount(); setPendingCount(newCount); }
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to split segment"); }
    finally { setSplittingId(null); }
  };

  const handleSegmentMerge = async (idA: string, idB: string) => {
    if (!trail) return; setMerging(true);
    try {
      if (isOnline) { const client = createMagnumClient(API_URL); await client.mergeSegments(trail.id, { segment_id_a: idA, segment_id_b: idB }); await refreshSegments(trail.id); }
      else { await addPendingContribution("trail_segment", "merge", { segment_id_a: idA, segment_id_b: idB }, contributorName || "anonymous", idA); await refreshSegments(trail.id); const newCount = await getPendingCount(); setPendingCount(newCount); }
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to merge segments"); }
    finally { setMerging(false); }
  };

  const handleReorder = async (orderedIds: string[]) => {
    if (!trail) return; setReordering(true);
    try {
      if (isOnline) { const client = createMagnumClient(API_URL); const res = await client.reorderSegments(trail.id, { ordered_ids: orderedIds }); setSegments(res.items); }
      else { await addPendingContribution("trail_segment", "reorder", { ordered_ids: orderedIds }, contributorName || "anonymous", trail.id); await reorderLocalSegments(trail.id, orderedIds); await refreshSegments(trail.id); const newCount = await getPendingCount(); setPendingCount(newCount); }
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to reorder segments"); }
    finally { setReordering(false); }
  };

  if (error) return (
    <View style={[styles.centered, { backgroundColor: colors.bg }]} testID="trail-detail-error">
      <Ionicons name="alert-circle-outline" size={36} color={colors.danger} />
      <Text style={[textTokens.body, { color: colors.danger, marginTop: spacing.sm }]}>{error}</Text>
    </View>
  );
  if (!trail) return (
    <View style={[styles.centered, { backgroundColor: colors.bg }]} testID="trail-detail-loading">
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
  if (editMode) return (
    <>
      <Stack.Screen options={{ title: `${trail.name} — Edit Segments`, headerShown: true }} />
      <SegmentEditList segments={segments} onUpdate={handleSegmentUpdate} onDelete={handleSegmentDelete} onSplit={handleSegmentSplit} onMerge={handleSegmentMerge} onReorder={handleReorder} onExit={() => setEditMode(false)} pendingId={pendingId} savingId={savingId} deletingId={deletingId} splittingId={splittingId} merging={merging} reordering={reordering} testID="trail-segment-edit-list" />
    </>
  );

  return (
    <>
      <Stack.Screen options={{ title: trail.name, headerShown: true }} />
      <ScrollView style={[styles.container, { backgroundColor: colors.bg }]} testID="trail-detail-screen">
        <TrailMapPreview center={trail.center} geometry={trail.geometry} />

        <Section hero title={trail.name} testID="trail-meta">
          <View style={styles.statsRow} testID="trail-stats">
            {trail.difficulty ? <DifficultyBadge difficulty={trail.difficulty} /> : null}
            {trail.tier ? <TrailTierBadge tier={trail.tier} /> : null}
            {trail.verified ? <StatusPill label="Verified" icon="checkmark-circle" tone="success" testID="trail-verified" /> : null}
          </View>
          <View style={styles.statsValues}>
            {trail.length_meters ? (
              <Text style={[textTokens.meta, { color: colors.textSecondary }]} testID="trail-length">
                <Ionicons name="resize" size={12} color={colors.textMuted} /> {(trail.length_meters / 1000).toFixed(1)} km
              </Text>
            ) : null}
            {trail.elevation_gain_meters ? (
              <Text style={[textTokens.meta, { color: colors.textSecondary }]} testID="trail-elevation">
                <Ionicons name="trending-up" size={12} color={colors.textMuted} /> {trail.elevation_gain_meters.toFixed(0)} m
              </Text>
            ) : null}
          </View>
          {trail.tier === "synthesized" && trail.derived_from_segments != null ? (
            <Text style={[textTokens.meta, { color: colors.textMuted, marginTop: spacing.xs }]} testID="trail-derived-from">
              Derived from {trail.derived_from_segments} segment{trail.derived_from_segments === 1 ? "" : "s"}
              {trail.derived_from_traces != null ? ` / ${trail.derived_from_traces} trace${trail.derived_from_traces === 1 ? "" : "s"}` : ""}
              {trail.last_synthesized_at ? ` · regen ${new Date(trail.last_synthesized_at).toLocaleDateString()}` : ""}
            </Text>
          ) : null}
          {trail.description ? <Text style={[textTokens.body, { color: colors.textSecondary }]}>{trail.description}</Text> : null}
          <ViewOnMapButton center={trail.center ?? null} zoom={11} testID="trail-view-on-map" />
        </Section>

        <Section title={`Segments · ${segments.length}`} action={<Button variant="ghost" size="small" onPress={() => setEditMode(true)} testID="trail-segments-edit">Edit Segments</Button>} testID="trail-segments">
          {segments.length === 0 ? (
            <Text style={[textTokens.body, { color: colors.textMuted, fontStyle: "italic" }]} testID="trail-segments-empty">No segments yet.</Text>
          ) : (
            segments.map((s) => (
              <Card key={s.id} testID={`trail-segment-${s.id}`}>
                <View style={styles.cardRow}>
                  <Text style={[textTokens.bodyStrong, { color: colors.text, flex: 1 }]}>{s.name ?? `Segment ${s.sort_order + 1}`}</Text>
                  {s.surface_type ? <SegmentTypeBadge surface={s.surface_type} /> : null}
                </View>
                {s.hazards.length > 0 ? (
                  <Text style={[textTokens.meta, { color: colors.warning, marginTop: spacing.xxs }]} testID={`trail-segment-hazards-${s.id}`}>Hazards: {s.hazards.join(", ")}</Text>
                ) : null}
                <View style={styles.flagsRow}>
                  {s.steep_grade ? <Text style={[styles.flag, { backgroundColor: colors.surfaceMuted, color: colors.textSecondary }]}>Steep</Text> : null}
                  {s.is_road_connector ? <Text style={[styles.flag, { backgroundColor: colors.warningMuted, color: colors.warning }]}>Road connector</Text> : null}
                  {s.one_way ? <Text style={[styles.flag, { backgroundColor: colors.surfaceMuted, color: colors.textSecondary }]}>One-way</Text> : null}
                  {s.length_meters ? <Text style={[styles.flag, { backgroundColor: colors.surfaceMuted, color: colors.textSecondary }]} testID={`trail-segment-length-${s.id}`}>{(s.length_meters / 1000).toFixed(2)} km</Text> : null}
                </View>
              </Card>
            ))
          )}
        </Section>

        <Section title={`Features · ${features.length}`} testID="trail-features">
          {features.length === 0 ? (
            <Text style={[textTokens.body, { color: colors.textMuted, fontStyle: "italic" }]} testID="trail-features-empty">No features yet.</Text>
          ) : (
            features.map((f) => (
              <Pressable key={f.id} onPress={() => router.push(`/feature/${f.id}` as never)} testID={`trail-feature-${f.id}`}>
                <Card>
                  <View style={styles.cardRow}>
                    <View testID={`trail-feature-type-${f.id}`}><FeatureTypeIcon type={f.type_tag ?? undefined} size={14} /></View>
                    <Text style={[textTokens.bodyStrong, { color: colors.text, flex: 1 }]}>{f.name}</Text>
                  </View>
                  {f.description ? <Text style={[textTokens.meta, { color: colors.textSecondary, marginTop: spacing.xxs }]}>{f.description}</Text> : null}
                </Card>
              </Pressable>
            ))
          )}
        </Section>

        <Section title="Wiki" action={<Button variant={wikiPage ? "ghost" : "primary"} size="small" onPress={() => router.push({ pathname: "/wiki/edit/trail/[targetId]" as never, params: { targetId: trail.id, defaultTitle: trail.name } } as never)} testID="trail-wiki-edit">{wikiPage ? "Edit" : "Create"}</Button>} testID="trail-wiki">
          {wikiPage ? (
            <Pressable onPress={() => router.push(`/wiki/trail/${trail.id}` as never)} testID="trail-wiki-view">
              <Card variant="tinted"><WikiPageView wikiPage={wikiPage} compact /></Card>
            </Pressable>
          ) : (
            <Text style={[textTokens.body, { color: colors.textMuted, fontStyle: "italic" }]}>No wiki page yet for this trail.</Text>
          )}
        </Section>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  mapPreview: { height: 200, borderBottomWidth: 1 },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.xs },
  statsValues: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  cardRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  flagsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.xs },
  flag: { fontSize: 10, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radii.xs },
});
