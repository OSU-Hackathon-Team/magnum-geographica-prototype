import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
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
import { Card } from "../../src/components/ui/Card";
import { DifficultyBadge } from "../../src/components/ui/DifficultyBadge";
import { SegmentTypeBadge } from "../../src/components/ui/SegmentTypeBadge";
import { ViewOnMapButton } from "../../src/components/ui/ViewOnMapButton";
import { Button } from "../../src/components/ui/Button";
import { FeatureTypeIcon } from "../../src/components/feature/FeatureTypeIcon";
import { SegmentEditList } from "../../src/components/trail/SegmentEditor";
import { useOfflineStore } from "../../src/stores/offlineStore";
import { useAuthStore } from "../../src/stores/authStore";
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

function TrailMapPreview() {
  return (
    <View style={styles.mapPreview}>
      <MapContainer
        config={{
          martinTilesUrl: MARTIN_URL,
          initialCenter: [-82.9988, 39.9612],
          initialZoom: 8,
        }}
      />
    </View>
  );
}

export default function TrailDetail() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
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

  const refreshSegments = useCallback(async (trailId: string) => {
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
          ? String(s.surface_type) as TrailSegment["surface_type"]
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
  }, [isOnline]);

  useEffect(() => {
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
              ? String(s.surface_type) as TrailSegment["surface_type"]
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
            point: f.lon != null && f.lat != null
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
  }, [slug, isOnline]);

  const handleSegmentUpdate = async (id: string, body: UpdateSegmentInput) => {
    if (!trail) return;
    setSavingId(id);
    setPendingId(id);
    try {
      if (isOnline) {
        const client = createMagnumClient(API_URL);
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
        const client = createMagnumClient(API_URL);
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
        const client = createMagnumClient(API_URL);
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
        const client = createMagnumClient(API_URL);
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
        const client = createMagnumClient(API_URL);
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
        <Text style={styles.errorText}>{error}</Text>
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
      <ScrollView style={styles.container} testID="trail-detail-screen">
        <TrailMapPreview />

        <View style={styles.section} testID="trail-meta">
          <View style={styles.row}>
            <Text style={styles.title} testID="trail-name">{trail.name}</Text>
            {trail.difficulty ? <DifficultyBadge difficulty={trail.difficulty} /> : null}
          </View>
          <View style={styles.statsRow} testID="trail-stats">
            {trail.length_meters ? (
              <Text style={styles.stat} testID="trail-length">
                <IoniconsLabel name="resize" /> {(trail.length_meters / 1000).toFixed(1)} km
              </Text>
            ) : null}
            {trail.elevation_gain_meters ? (
              <Text style={styles.stat} testID="trail-elevation">
                <IoniconsLabel name="trending-up" /> {trail.elevation_gain_meters.toFixed(0)} m
              </Text>
            ) : null}
            {trail.verified ? (
              <Text style={[styles.stat, styles.verified]} testID="trail-verified">
                <IoniconsLabel name="checkmark-circle" /> Verified
              </Text>
            ) : null}
          </View>
          {trail.description ? <Text style={styles.body}>{trail.description}</Text> : null}
          <ViewOnMapButton center={trail.center ?? null} zoom={11} testID="trail-view-on-map" />
        </View>

        <View style={styles.section} testID="trail-wiki">
          <View style={styles.row}>
            <Text style={styles.h2}>Wiki</Text>
            <Button
              variant={wikiPage ? "ghost" : "primary"}
              size="small"
              onPress={() =>
                router.push(`/wiki/edit/trail/${trail.id}` as never)
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
              <Text style={styles.wikiPreview} numberOfLines={3}>
                {wikiPage.content_md || "No content yet."}
              </Text>
            </Pressable>
          ) : (
            <Text style={styles.body}>No wiki page yet for this trail.</Text>
          )}
        </View>

        <View style={styles.section} testID="trail-segments">
          <View style={styles.row}>
            <Text style={styles.h2}>Segments ({segments.length})</Text>
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
            <Text style={styles.body} testID="trail-segments-empty">No segments yet.</Text>
          ) : (
            segments.map((s) => (
              <Card key={s.id} testID={`trail-segment-${s.id}`}>
                <View style={styles.row}>
                  <Text style={styles.cardTitle}>
                    {s.name ?? `Segment ${s.sort_order + 1}`}
                  </Text>
                  {s.surface_type ? <SegmentTypeBadge surface={s.surface_type} /> : null}
                </View>
                {s.hazards.length > 0 ? (
                  <Text style={styles.meta} testID={`trail-segment-hazards-${s.id}`}>
                    Hazards: {s.hazards.join(", ")}
                  </Text>
                ) : null}
                <View style={styles.flagsRow}>
                  {s.steep_grade ? <Text style={styles.flag}>Steep</Text> : null}
                  {s.is_road_connector ? <Text style={styles.flag}>Road connector</Text> : null}
                  {s.one_way ? <Text style={styles.flag}>One-way</Text> : null}
                  {s.length_meters ? (
                    <Text style={styles.flag} testID={`trail-segment-length-${s.id}`}>
                      {(s.length_meters / 1000).toFixed(2)} km
                    </Text>
                  ) : null}
                </View>
              </Card>
            ))
          )}
        </View>

        <View style={styles.section} testID="trail-features">
          <Text style={styles.h2}>Features ({features.length})</Text>
          {features.length === 0 ? (
            <Text style={styles.body} testID="trail-features-empty">No features yet.</Text>
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
                      <FeatureTypeIcon type={f.type_tag} size={14} />
                    </View>
                    <Text style={styles.cardTitle}>{f.name}</Text>
                  </View>
                  {f.description ? <Text style={styles.body}>{f.description}</Text> : null}
                </Card>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>
    </>
  );
}

function IoniconsLabel({ name }: { name: "resize" | "trending-up" | "checkmark-circle" }) {
  return <Ionicons name={name} size={12} color="#666" />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { color: "#ef4444", padding: 16 },
  mapPreview: { height: 240, backgroundColor: "#e8e8e8" },
  section: { padding: 16, gap: 8 },
  title: { fontSize: 22, fontWeight: "700", flexShrink: 1 },
  h2: { fontSize: 18, fontWeight: "600", marginBottom: 8 },
  body: { fontSize: 14, color: "#444", lineHeight: 20 },
  meta: { fontSize: 12, color: "#888" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 4 },
  stat: { fontSize: 12, color: "#666" },
  verified: { color: "#22c55e" },
  cardTitle: { fontSize: 15, fontWeight: "600" },
  flagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  flag: {
    fontSize: 10,
    color: "#666",
    backgroundColor: "#f1f1f1",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
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
