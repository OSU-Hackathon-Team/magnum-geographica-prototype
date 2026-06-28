import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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
import { Card } from "../../src/components/ui/Card";
import { DifficultyBadge } from "../../src/components/ui/DifficultyBadge";
import { TrailTierBadge } from "../../src/components/ui/TrailTierBadge";
import { SegmentTypeBadge } from "../../src/components/ui/SegmentTypeBadge";
import { ViewOnMapButton } from "../../src/components/ui/ViewOnMapButton";
import { Button } from "../../src/components/ui/Button";
import { WikiPageView } from "../../src/components/wiki/WikiPageView";
import { FeatureTypeIcon } from "../../src/components/feature/FeatureTypeIcon";
import { SegmentEditList } from "../../src/components/trail/SegmentEditor";
import { useOfflineStore } from "../../src/stores/offlineStore";
import { useAuthStore } from "../../src/stores/authStore";
import { useTheme } from "../../src/providers/ThemeProvider";
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
} from "../../src/services/offlineDataService";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
const MARTIN_URL = process.env.EXPO_PUBLIC_MARTIN_URL ?? "http://localhost:3001";

function TrailMapPreview({ center, geometry, backgroundColor }: { center?: { lon: number; lat: number } | null; geometry?: unknown; backgroundColor?: string }) {
  return (
    <View style={[styles.mapPreview, backgroundColor ? { backgroundColor } : undefined]}>
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
  const [freezing, setFreezing] = useState(false);
  const [unfreezing, setUnfreezing] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [splittingId, setSplittingId] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const isOnline = useOfflineStore((s) => s.isOnline);
  const setPendingCount = useOfflineStore((s) => s.setPendingCount);
  const contributorName = useAuthStore((s) => s.contributorName);
  const token = useAuthStore((s) => s.token);

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
            try {
              return JSON.parse(String(s.hazards ?? "[]"));
            } catch {
              return [];
            }
          })(),
          is_road_connector: Boolean(s.is_road_connector),
          steep_grade: Boolean(s.steep_grade),
          one_way: Boolean(s.one_way),
          description: s.description ? String(s.description) : null,
          length_meters: s.length_meters ? Number(s.length_meters) : null,
          created_at: "",
          updated_at: "",
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
            elevation_gain_meters: localTrail.elevation_gain_meters
              ? Number(localTrail.elevation_gain_meters)
              : null,
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
              surface_type: s.surface_type
                ? (String(s.surface_type) as TrailSegment["surface_type"])
                : null,
              hazards: (() => {
                try {
                  return JSON.parse(String(s.hazards ?? "[]"));
                } catch {
                  return [];
                }
              })(),
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
              point:
                f.lon != null && f.lat != null
                  ? { type: "Point", coordinates: [Number(f.lon), Number(f.lat)] }
                  : null,
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
    }, [slug, isOnline]),
  );

  const handleFreeze = async (trailId: string) => {
    setFreezing(true);
    try {
      const client = createMagnumClient(API_URL, {
        getAuthToken: () => token ?? undefined,
      });
      await client.promoteTrail(trailId, "elevated");
      if (trail) setTrail({ ...trail, tier: "elevated" });
    } catch (e) {
      Alert.alert("Freeze failed", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setFreezing(false);
    }
  };

  const handleUnfreeze = async (trailId: string) => {
    setUnfreezing(true);
    try {
      const client = createMagnumClient(API_URL, {
        getAuthToken: () => token ?? undefined,
      });
      await client.demoteTrail(trailId);
      if (trail) setTrail({ ...trail, tier: "synthesized" });
    } catch (e) {
      Alert.alert("Unfreeze failed", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setUnfreezing(false);
    }
  };

  const handleSegmentUpdate = async (id: string, body: UpdateSegmentInput) => {
    if (!trail) return;
    setSavingId(id);
    setPendingId(id);
    try {
      if (isOnline) {
        const client = createMagnumClient(API_URL, {
          getAuthToken: () => token ?? undefined,
        });
        await client.updateSegment(id, body);
        await refreshSegments(trail.id);
      } else {
        await addPendingContribution(
          "trail_segment",
          "update",
          { id, ...body },
          contributorName || "anonymous",
          id,
        );
        await updateLocalSegment(id, {
          name: body.name,
          surface_type: body.surface_type,
          hazards: body.hazards,
          is_road_connector: body.is_road_connector,
          steep_grade: body.steep_grade,
          one_way: body.one_way,
          description: body.description,
        });
        const newCount = await getPendingCount();
        setPendingCount(newCount);
        await refreshSegments(trail.id);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save segment";
      if (!isOnline && /network|fetch|timeout/i.test(msg)) {
        try {
          await addPendingContribution(
            "trail_segment",
            "update",
            { id, ...body },
            contributorName || "anonymous",
            id,
          );
          await updateLocalSegment(id, {
            name: body.name,
            surface_type: body.surface_type,
            hazards: body.hazards,
            is_road_connector: body.is_road_connector,
            steep_grade: body.steep_grade,
            one_way: body.one_way,
            description: body.description,
          });
          const newCount = await getPendingCount();
          setPendingCount(newCount);
          await refreshSegments(trail.id);
          return;
        } catch (queueErr) {
          setError(queueErr instanceof Error ? queueErr.message : "Failed to queue");
        }
      } else {
        setError(msg);
      }
    } finally {
      setSavingId(null);
      setPendingId(null);
    }
  };

  const handleSegmentDelete = async (id: string) => {
    if (!trail) return;
    setDeletingId(id);
    try {
      if (isOnline) {
        const client = createMagnumClient(API_URL, {
          getAuthToken: () => token ?? undefined,
        });
        await client.deleteSegment(id);
        await refreshSegments(trail.id);
      } else {
        await addPendingContribution(
          "trail_segment",
          "delete",
          { id },
          contributorName || "anonymous",
          id,
        );
        await deleteLocalSegment(id);
        const newCount = await getPendingCount();
        setPendingCount(newCount);
        await refreshSegments(trail.id);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to delete segment";
      if (!isOnline && /network|fetch|timeout/i.test(msg)) {
        try {
          await addPendingContribution(
            "trail_segment",
            "delete",
            { id },
            contributorName || "anonymous",
            id,
          );
          await deleteLocalSegment(id);
          const newCount = await getPendingCount();
          setPendingCount(newCount);
          await refreshSegments(trail.id);
          return;
        } catch (queueErr) {
          setError(queueErr instanceof Error ? queueErr.message : "Failed to queue");
        }
      } else {
        setError(msg);
      }
    } finally {
      setDeletingId(null);
    }
  };

  const handleSegmentSplit = async (
    id: string,
    splitAt: number,
    nameA?: string,
    nameB?: string,
  ) => {
    if (!trail) return;
    setSplittingId(id);
    try {
      if (isOnline) {
        const client = createMagnumClient(API_URL, {
          getAuthToken: () => token ?? undefined,
        });
        const res = await client.splitSegment(trail.id, {
          segment_id: id,
          split_at: splitAt,
          name_a: nameA,
          name_b: nameB,
        });
        setSegments(res.items);
      } else {
        await addPendingContribution(
          "trail_segment",
          "split",
          { id, split_at: splitAt, name_a: nameA, name_b: nameB },
          contributorName || "anonymous",
          id,
        );
        const newCount = await getPendingCount();
        setPendingCount(newCount);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to split segment";
      setError(msg);
    } finally {
      setSplittingId(null);
    }
  };

  const handleSegmentMerge = async (idA: string, idB: string) => {
    if (!trail) return;
    setMerging(true);
    try {
      if (isOnline) {
        const client = createMagnumClient(API_URL, {
          getAuthToken: () => token ?? undefined,
        });
        await client.mergeSegments(trail.id, {
          segment_id_a: idA,
          segment_id_b: idB,
        });
        await refreshSegments(trail.id);
      } else {
        await addPendingContribution(
          "trail_segment",
          "merge",
          { segment_id_a: idA, segment_id_b: idB },
          contributorName || "anonymous",
          idA,
        );
        const newCount = await getPendingCount();
        setPendingCount(newCount);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to merge segments";
      setError(msg);
    } finally {
      setMerging(false);
    }
  };

  const handleReorder = async (orderedIds: string[]) => {
    if (!trail) return;
    setReordering(true);
    try {
      if (isOnline) {
        const client = createMagnumClient(API_URL, {
          getAuthToken: () => token ?? undefined,
        });
        const res = await client.reorderSegments(trail.id, { ordered_ids: orderedIds });
        setSegments(res.items);
      } else {
        await addPendingContribution(
          "trail_segment",
          "reorder",
          { ordered_ids: orderedIds },
          contributorName || "anonymous",
          trail.id,
        );
        await reorderLocalSegments(trail.id, orderedIds);
        const newCount = await getPendingCount();
        setPendingCount(newCount);
        await refreshSegments(trail.id);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to reorder segments";
      if (!isOnline && /network|fetch|timeout/i.test(msg)) {
        try {
          await addPendingContribution(
            "trail_segment",
            "reorder",
            { ordered_ids: orderedIds },
            contributorName || "anonymous",
            trail.id,
          );
          await reorderLocalSegments(trail.id, orderedIds);
          const newCount = await getPendingCount();
          setPendingCount(newCount);
          await refreshSegments(trail.id);
          return;
        } catch (queueErr) {
          setError(queueErr instanceof Error ? queueErr.message : "Failed to queue");
        }
      } else {
        setError(msg);
      }
    } finally {
      setReordering(false);
    }
  };

  if (error) {
    return (
      <View style={styles.centered} testID="trail-detail-error">
        <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
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

  if (editMode) {
    return (
      <>
        <Stack.Screen options={{ title: `${trail.name} — Edit Segments`, headerShown: true }} />
        <SegmentEditList
          segments={segments}
          onUpdate={handleSegmentUpdate}
          onDelete={handleSegmentDelete}
          onSplit={handleSegmentSplit}
          onMerge={handleSegmentMerge}
          onReorder={handleReorder}
          onExit={() => setEditMode(false)}
          pendingId={pendingId}
          savingId={savingId}
          deletingId={deletingId}
          splittingId={splittingId}
          merging={merging}
          reordering={reordering}
          testID="trail-segment-edit-list"
        />
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: trail.name, headerShown: true }} />
      <ScrollView style={[styles.container, { backgroundColor: colors.bg }]} testID="trail-detail-screen">
        <TrailMapPreview center={trail.center} geometry={trail.geometry} backgroundColor={colors.border} />

        <View style={styles.section} testID="trail-meta">
          <View style={styles.row}>
            <Text style={[styles.title, { color: colors.text }]} testID="trail-name">
              {trail.name}
            </Text>
            {trail.difficulty ? <DifficultyBadge difficulty={trail.difficulty} /> : null}
            {trail.tier ? <TrailTierBadge tier={trail.tier} /> : null}
          </View>
          {/* Actions bar: Edit Details, Freeze/Demote */}
          <View style={styles.actionsRow} testID="trail-actions">
            <Button
              variant="ghost"
              size="small"
              onPress={() => router.push(`/trail/${trail.slug}/edit` as never)}
              testID="trail-edit-details"
            >
              Edit Details
            </Button>
            {trail.tier === "synthesized" ? (
              <Button
                variant="ghost"
                size="small"
                onPress={() => handleFreeze(trail.id)}
                disabled={freezing}
                testID="trail-freeze"
              >
                {freezing ? "Freezing…" : "Freeze"}
              </Button>
            ) : trail.tier === "elevated" ? (
              <Button
                variant="ghost"
                size="small"
                onPress={() => handleUnfreeze(trail.id)}
                disabled={unfreezing}
                testID="trail-unfreeze"
              >
                {unfreezing ? "Unfreezing…" : "Unfreeze"}
              </Button>
            ) : null}
          </View>
          <View style={styles.statsRow} testID="trail-stats">
            {trail.length_meters ? (
              <Text style={[styles.stat, { color: colors.textMuted }]} testID="trail-length">
                <IoniconsLabel name="resize" color={colors.textMuted} /> {(trail.length_meters / 1000).toFixed(1)} km
              </Text>
            ) : null}
            {trail.elevation_gain_meters ? (
              <Text style={[styles.stat, { color: colors.textMuted }]} testID="trail-elevation">
                <IoniconsLabel name="trending-up" color={colors.textMuted} /> {trail.elevation_gain_meters.toFixed(0)} m
              </Text>
            ) : null}
            {trail.verified ? (
              <Text style={[styles.stat, { color: colors.primary }]} testID="trail-verified">
                <IoniconsLabel name="checkmark-circle" color={colors.primary} /> Verified
              </Text>
            ) : null}
          </View>
          {trail.tier === "synthesized" && trail.derived_from_segments != null ? (
            <Text style={[styles.body, { color: colors.textSecondary }]} testID="trail-derived-from">
              Derived from {trail.derived_from_segments} segment
              {trail.derived_from_segments === 1 ? "" : "s"}
              {trail.derived_from_traces != null
                ? ` / ${trail.derived_from_traces} trace${trail.derived_from_traces === 1 ? "" : "s"}`
                : ""}
              {trail.last_synthesized_at
                ? ` · regen ${new Date(trail.last_synthesized_at).toLocaleDateString()}`
                : ""}
            </Text>
          ) : null}
          {trail.description ? <Text style={[styles.body, { color: colors.textSecondary }]}>{trail.description}</Text> : null}
          <ViewOnMapButton center={trail.center ?? null} zoom={11} testID="trail-view-on-map" />
        </View>

        <View style={styles.section} testID="trail-segments">
          <View style={styles.row}>
            <Text style={[styles.h2, { color: colors.text }]}>Segments ({segments.length})</Text>
            <Button
              variant="ghost"
              size="small"
              onPress={() => setEditMode(true)}
              testID="trail-segments-edit"
            >
              Edit Segments
            </Button>
          </View>
          {segments.length === 0 ? (
            <Text style={[styles.body, { color: colors.textSecondary }]} testID="trail-segments-empty">
              No segments yet.
            </Text>
          ) : (
            segments.map((s) => (
              <Card key={s.id} testID={`trail-segment-${s.id}`}>
                <View style={styles.row}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{s.name ?? `Segment ${s.sort_order + 1}`}</Text>
                  {s.surface_type ? <SegmentTypeBadge surface={s.surface_type} /> : null}
                </View>
                {s.hazards.length > 0 ? (
                  <Text style={[styles.meta, { color: colors.textMuted }]} testID={`trail-segment-hazards-${s.id}`}>
                    Hazards: {s.hazards.join(", ")}
                  </Text>
                ) : null}
                <View style={styles.flagsRow}>
                  {s.steep_grade ? <Text style={[styles.flag, { color: colors.textMuted, backgroundColor: colors.surfaceMutedStrong }]}>Steep</Text> : null}
                  {s.is_road_connector ? <Text style={[styles.flag, { color: colors.textMuted, backgroundColor: colors.surfaceMutedStrong }]}>Road connector</Text> : null}
                  {s.one_way ? <Text style={[styles.flag, { color: colors.textMuted, backgroundColor: colors.surfaceMutedStrong }]}>One-way</Text> : null}
                  {s.length_meters ? (
                    <Text style={[styles.flag, { color: colors.textMuted, backgroundColor: colors.surfaceMutedStrong }]} testID={`trail-segment-length-${s.id}`}>
                      {(s.length_meters / 1000).toFixed(2)} km
                    </Text>
                  ) : null}
                </View>
              </Card>
            ))
          )}
        </View>

        <View style={styles.section} testID="trail-features">
          <Text style={[styles.h2, { color: colors.text }]}>Features ({features.length})</Text>
          {features.length === 0 ? (
            <Text style={[styles.body, { color: colors.textSecondary }]} testID="trail-features-empty">
              No features yet.
            </Text>
          ) : (
            features.map((f) => (
              <Pressable
                key={f.id}
                onPress={() => router.push(`/feature/${f.id}` as never)}
                testID={`trail-feature-${f.id}`}
              >
                <Card>
                  <View style={styles.row}>
                    <View testID={`trail-feature-type-${f.id}`}>
                      <FeatureTypeIcon type={f.type_tag ?? undefined} size={14} />
                    </View>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>{f.name}</Text>
                  </View>
                  {f.description ? <Text style={[styles.body, { color: colors.textSecondary }]}>{f.description}</Text> : null}
                </Card>
              </Pressable>
            ))
          )}
        </View>

        <View style={styles.section} testID="trail-wiki">
          <View style={styles.row}>
            <Text style={[styles.h2, { color: colors.text }]}>Wiki</Text>
            <Button
              variant={wikiPage ? "ghost" : "primary"}
              size="small"
              onPress={() =>
                router.push({
                  pathname: "/wiki/edit/trail/[targetId]" as never,
                  params: { targetId: trail.id, defaultTitle: trail.name },
                } as never)
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
              <View style={[styles.wikiPreviewBox, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
                <WikiPageView wikiPage={wikiPage} compact />
              </View>
            </Pressable>
          ) : (
            <Text style={[styles.body, { color: colors.textSecondary }]}>No wiki page yet for this trail.</Text>
          )}
        </View>
      </ScrollView>
    </>
  );
}

function IoniconsLabel({ name, color }: { name: "resize" | "trending-up" | "checkmark-circle"; color: string }) {
  return <Ionicons name={name} size={12} color={color} />;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { padding: 16 },
  mapPreview: { height: 240 },
  section: { padding: 16, gap: 8 },
  title: { fontSize: 22, fontWeight: "700", flexShrink: 1 },
  h2: { fontSize: 18, fontWeight: "600", marginBottom: 8 },
  body: { fontSize: 14, lineHeight: 20 },
  meta: { fontSize: 12 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  actionsRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 4 },
  stat: { fontSize: 12 },
  cardTitle: { fontSize: 15, fontWeight: "600" },
  flagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  flag: {
    fontSize: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  wikiPreviewBox: {
    borderRadius: 6,
    borderWidth: 1,
    padding: 4,
  },
});
