import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MapContainer } from "@magnum/map";
import { createMagnumClient, type Trail, type System, type TrailSegment, SURFACE_TYPES } from "@magnum/shared";
import { useAuthStore } from "../../../src/stores/authStore";
import { useTrailEditStore } from "../../../src/stores/trailEditStore";
import { useOfflineStore } from "../../../src/stores/offlineStore";
import { useTheme } from "../../../src/providers/ThemeProvider";
import { Button } from "../../../src/components/ui/Button";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
const MARTIN_URL = process.env.EXPO_PUBLIC_MARTIN_URL ?? "http://localhost:3001";
const TRACE_COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#a855f7", "#06b6d4"];

interface SegmentDetail {
  id: string;
  coordinates: Array<[number, number]>;
  surface_type?: string | null;
  is_pseudo_trail?: boolean;
  is_road_connector?: boolean;
  source?: string | null;
  consensus?: number | null;
  sort_order: number;
  trail_id: string;
}

export default function SystemTrailEditor() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const token = useAuthStore((s) => s.token);
  const tier = useAuthStore((s) => s.tier);
  const isTrustedOrMod = tier === "trusted" || tier === "moderator";

  const mode = useTrailEditStore((s) => s.mode);
  const setMode = useTrailEditStore((s) => s.setMode);
  const snapEnabled = useTrailEditStore((s) => s.snapEnabled);
  const toggleSnap = useTrailEditStore((s) => s.toggleSnap);
  const tracesVisible = useTrailEditStore((s) => s.tracesVisible);
  const toggleTraces = useTrailEditStore((s) => s.toggleTraces);

  const [system, setSystem] = useState<System | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trails, setTrails] = useState<Trail[]>([]);
  const [segments, setSegments] = useState<SegmentDetail[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<SegmentDetail | null>(null);
  const [traces, setTraces] = useState<Array<{ id: string; coordinates: Array<[number, number]>; transitions: Array<{ type: string; lon: number; lat: number }>; contributor_name?: string }>>([]);
  const [selectedTraceSpan, setSelectedTraceSpan] = useState<{ trace_id: string; start_lon: number; start_lat: number; end_lon: number; end_lat: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const isOnline = useOfflineStore((s) => s.isOnline);

  const client = useMemo(
    () => createMagnumClient(API_URL, { getAuthToken: () => token ?? undefined }),
    [token],
  );

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    try {
      const sys = await client.getSystemBySlug(String(slug));
      setSystem(sys);

      const tr = await client.listTrails({ systemId: sys.id, pageSize: 200 });
      setTrails(tr.items);

      // Fetch segments for each trail
      const allSegs: SegmentDetail[] = [];
      for (const trail of tr.items) {
        try {
          const segRes = await client.listTrailSegments(trail.id);
          for (const seg of segRes.items) {
            // Extract coordinates from the geometry
            const coords = extractCoords(seg);
            if (coords.length < 2) continue;
            allSegs.push({
              id: seg.id,
              coordinates: coords,
              surface_type: seg.surface_type ?? null,
              is_pseudo_trail: seg.is_pseudo_trail ?? false,
              is_road_connector: seg.is_road_connector ?? false,
              source: seg.source ?? null,
              consensus: seg.consensus ?? null,
              sort_order: seg.sort_order,
              trail_id: trail.id,
            });
          }
        } catch {
          // trail may have no segments yet
        }
      }
      setSegments(allSegs);

      // Fetch traces for trails mode
      try {
        const tracesRes = await client.listTraces({ system_id: sys.id, pageSize: 100 });
        const traceList: typeof traces = [];
        for (const t of tracesRes.items) {
          const geom = t.geometry as { coordinates?: unknown; type?: string } | undefined;
          let coords: Array<[number, number]> = [];
          if (geom?.type === "MultiLineString" && Array.isArray(geom.coordinates)) {
            const rings = geom.coordinates as unknown as Array<Array<[number, number]>>;
            coords = rings.reduce<Array<[number, number]>>((acc, ring) => acc.concat(ring), []);
          } else if (geom?.type === "LineString" && Array.isArray(geom.coordinates)) {
            const ring = geom.coordinates as unknown as Array<[number, number]>;
            coords = ring;
          }
          if (coords.length < 2) continue;
          traceList.push({
            id: t.id as string,
            coordinates: coords,
            transitions: [],
            contributor_name: t.contributor_name as string | undefined,
          });
        }
        setTraces(traceList);
      } catch {
        // traces are optional
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [slug, client]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSegmentTap = useCallback(
    (seg: { trail_id: string; segment_sort_order: number; lon: number; lat: number }) => {
      const match = segments.find(
        (s) => s.trail_id === seg.trail_id && s.sort_order === seg.segment_sort_order,
      );
      if (match) setSelectedSegment(match);
    },
    [segments],
  );

  const handleSaveSegment = useCallback(async () => {
    if (!selectedSegment || !isOnline) return;
    setSaving(true);
    try {
      await client.updateSegment(selectedSegment.id, {
        surface_type: selectedSegment.surface_type as typeof SURFACE_TYPES[number] | null,
        is_pseudo_trail: selectedSegment.is_pseudo_trail,
        is_road_connector: selectedSegment.is_road_connector,
      });
      // Refresh segments
      const segRes = await client.listTrailSegments(selectedSegment.trail_id);
      const updated: SegmentDetail[] = [];
      for (const seg of segRes.items) {
        const coords = extractCoords(seg);
        if (coords.length < 2) continue;
        updated.push({
          id: seg.id, coordinates: coords,
          surface_type: seg.surface_type ?? null,
          is_pseudo_trail: seg.is_pseudo_trail ?? false,
          is_road_connector: seg.is_road_connector ?? false,
          source: seg.source ?? null, consensus: seg.consensus ?? null,
          sort_order: seg.sort_order, trail_id: selectedSegment.trail_id,
        });
      }
      setSegments((prev) => [
        ...prev.filter((s) => s.trail_id !== selectedSegment.trail_id),
        ...updated,
      ]);
      setSelectedSegment(null);
    } catch (e) {
      console.warn("[editor] save failed", e);
    } finally {
      setSaving(false);
    }
  }, [selectedSegment, isOnline, client]);

  const handleClearConsensus = useCallback(async () => {
    if (!selectedSegment || !isTrustedOrMod || !isOnline) return;
    try {
      await client.removeLowConsensus(selectedSegment.id);
      setSelectedSegment({ ...selectedSegment, consensus: 1.0 });
      setSegments((prev) =>
        prev.map((s) => (s.id === selectedSegment.id ? { ...s, consensus: 1.0 } : s)),
      );
    } catch (e) {
      console.warn("[editor] clear consensus failed", e);
    }
  }, [selectedSegment, isTrustedOrMod, isOnline, client]);

  const handleDeleteSegment = useCallback(async () => {
    if (!selectedSegment || !isOnline) return;
    try {
      await client.deleteSegment(selectedSegment.id);
      setSegments((prev) => prev.filter((s) => s.id !== selectedSegment.id));
      setSelectedSegment(null);
    } catch (e) {
      console.warn("[editor] delete failed", e);
    }
  }, [selectedSegment, isOnline, client]);

  const handleTrailSplit = useCallback(
    async (s: { trail_id: string; lon: number; lat: number }) => {
      if (!isOnline) return;
      // Find the trail and call split on it
      const trailSegs = segments.filter((seg) => seg.trail_id === s.trail_id);
      if (trailSegs.length === 0) return;
      // Find the closest segment to the tap point
      let closest: SegmentDetail | null = null;
      let minDist = Infinity;
      for (const seg of trailSegs) {
        for (const [lon, lat] of seg.coordinates) {
          const d = Math.hypot(lon - s.lon, lat - s.lat);
          if (d < minDist) { minDist = d; closest = seg; }
        }
      }
      if (!closest) return;
      try {
        await client.splitSegment(s.trail_id, {
          segment_id: closest.id,
          split_at: 0.5,
        });
        // Reload segments for this trail
        const segRes = await client.listTrailSegments(s.trail_id);
        const updated: SegmentDetail[] = [];
        for (const seg of segRes.items) {
          const coords = extractCoords(seg);
          if (coords.length < 2) continue;
          updated.push({
            id: seg.id, coordinates: coords,
            surface_type: seg.surface_type ?? null,
            is_pseudo_trail: seg.is_pseudo_trail ?? false,
            is_road_connector: seg.is_road_connector ?? false,
            source: seg.source ?? null, consensus: seg.consensus ?? null,
            sort_order: seg.sort_order, trail_id: s.trail_id,
          });
        }
        setSegments((prev) => [
          ...prev.filter((s) => s.trail_id !== s.trail_id),
          ...updated,
        ]);
      } catch (e) {
        console.warn("[editor] split failed", e);
      }
    },
    [segments, isOnline, client],
  );

  const handleBoundaryLongPress = useCallback(
    async (b: { trail_id: string; boundary_sort_order: number }) => {
      if (!isOnline) return;
      const trailSegs = segments
        .filter((s) => s.trail_id === b.trail_id)
        .sort((a, b) => a.sort_order - b.sort_order);
      const idx = trailSegs.findIndex((s) => s.sort_order === b.boundary_sort_order);
      if (idx < 0 || idx + 1 >= trailSegs.length) return;
      const segA = trailSegs[idx];
      const segB = trailSegs[idx + 1];
      if (!segA || !segB) return;
      try {
        await client.mergeSegments(b.trail_id, {
          segment_id_a: segA.id,
          segment_id_b: segB.id,
        });
        const segRes = await client.listTrailSegments(b.trail_id);
        const updated: SegmentDetail[] = [];
        for (const seg of segRes.items) {
          const coords = extractCoords(seg);
          if (coords.length < 2) continue;
          updated.push({
            id: seg.id, coordinates: coords,
            surface_type: seg.surface_type ?? null,
            is_pseudo_trail: seg.is_pseudo_trail ?? false,
            is_road_connector: seg.is_road_connector ?? false,
            source: seg.source ?? null, consensus: seg.consensus ?? null,
            sort_order: seg.sort_order, trail_id: b.trail_id,
          });
        }
        setSegments((prev) => [
          ...prev.filter((s) => s.trail_id !== b.trail_id),
          ...updated,
        ]);
      } catch (e) {
        console.warn("[editor] merge failed", e);
      }
    },
    [segments, isOnline, client],
  );

  const handleDrawSelect = useCallback(
    (sel: { trace_id?: string | null; trail_id?: string | null; start_lon: number; start_lat: number; end_lon: number; end_lat: number; snapped: boolean }) => {
      if (mode !== "trails") return;
      setSelectedTraceSpan({
        trace_id: sel.trace_id ?? "",
        start_lon: sel.start_lon,
        start_lat: sel.start_lat,
        end_lon: sel.end_lon,
        end_lat: sel.end_lat,
      });
    },
    [mode],
  );

  // Build trail overlay data for the map
  const trailOverlay = useMemo(() => {
    if (segments.length === 0) return null;

    const trailsMap = new Map<string, {
      id: string;
      name: string;
      segments: Array<{
        coordinates: Array<[number, number]>;
        surface_type?: string | null;
        is_pseudo_trail?: boolean;
        is_road_connector?: boolean;
        source?: string | null;
        consensus?: number | null;
        sort_order: number;
      }>;
      boundaries: Array<{ lon: number; lat: number; sort_order: number }>;
    }>();

    for (const seg of segments) {
      let trail = trailsMap.get(seg.trail_id);
      if (!trail) {
        const t = trails.find((tr) => tr.id === seg.trail_id);
        trail = { id: seg.trail_id, name: t?.name ?? "Trail", segments: [], boundaries: [] };
        trailsMap.set(seg.trail_id, trail);
      }
      trail.segments.push({
        coordinates: seg.coordinates,
        surface_type: seg.surface_type,
        is_pseudo_trail: seg.is_pseudo_trail,
        is_road_connector: seg.is_road_connector,
        source: seg.source,
        consensus: seg.consensus,
        sort_order: seg.sort_order,
      });
      // Add boundary at the start of each segment (except the first)
      if (trail.segments.length > 1) {
        const coords = seg.coordinates;
        if (coords.length > 0) {
          trail.boundaries.push({
            lon: coords[0]![0],
            lat: coords[0]![1],
            sort_order: seg.sort_order - 1,
          });
        }
      }
    }

    return {
      trails: Array.from(trailsMap.values()),
      features: [],
      annotations: [],
      traces: traces.length > 0 ? traces.map((t, i) => ({
        id: t.id,
        coordinates: t.coordinates,
        color: TRACE_COLORS[i % TRACE_COLORS.length] as string,
        transitions: t.transitions,
      })) : undefined,
    };
  }, [segments, trails, traces]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Screen
        options={{
          title: system?.name ? `Editing · ${system.name}` : "Trail Editor",
          headerRight: () => (
            <Pressable onPress={() => router.back()} testID="editor-done">
              <Text style={[styles.doneText, { color: colors.primary }]}>Done</Text>
            </Pressable>
          ),
        }}
      />

      {error ? (
        <View style={[styles.errorBanner, { backgroundColor: colors.dangerMuted }]}>
          <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
        </View>
      ) : null}

      <View style={[styles.toolbar, { borderBottomColor: colors.divider }]}>
        <View style={styles.modeToggle}>
          <Pressable
            onPress={() => setMode("segments")}
            style={[
              styles.modeBtn,
              mode === "segments" && { backgroundColor: colors.primaryMuted },
            ]}
            testID="editor-mode-segments"
          >
            <Text
              style={[
                styles.modeBtnText,
                { color: mode === "segments" ? colors.primary : colors.textSecondary },
              ]}
            >
              Segments
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setMode("trails")}
            style={[
              styles.modeBtn,
              mode === "trails" && { backgroundColor: colors.primaryMuted },
            ]}
            testID="editor-mode-trails"
          >
            <Text
              style={[
                styles.modeBtnText,
                { color: mode === "trails" ? colors.primary : colors.textSecondary },
              ]}
            >
              Trails
            </Text>
          </Pressable>
        </View>
        <View style={styles.toolActions}>
          <Pressable
            onPress={toggleSnap}
            style={[
              styles.toolBtn,
              snapEnabled && { backgroundColor: colors.primaryMuted },
            ]}
            testID="editor-snap-toggle"
          >
            <Ionicons
              name="magnet-outline"
              size={16}
              color={snapEnabled ? colors.primary : colors.textSecondary}
            />
          </Pressable>
          <Pressable
            onPress={toggleTraces}
            style={[
              styles.toolBtn,
              tracesVisible && { backgroundColor: colors.primaryMuted },
            ]}
            testID="editor-traces-toggle"
          >
            <Ionicons
              name="eye-outline"
              size={16}
              color={tracesVisible ? colors.primary : colors.textSecondary}
            />
          </Pressable>
        </View>
      </View>

      <View style={styles.mapWrap} testID="editor-map">
        <MapContainer
          config={{
            martinTilesUrl: MARTIN_URL,
            initialCenter: [-82.9988, 39.9612],
            initialZoom: 12,
          }}
          trailOverlay={trailOverlay}
          editorMode={mode}
          snapEnabled={snapEnabled}
          tracesVisible={tracesVisible}
          onSegmentTap={handleSegmentTap}
          onTrailSplit={handleTrailSplit}
          onBoundaryLongPress={handleBoundaryLongPress}
          onDrawSelect={handleDrawSelect}
        />
      </View>

      {selectedSegment ? (
        <ScrollView
          style={[styles.bottomSheet, { backgroundColor: colors.surface }]}
          testID="segment-sheet"
          bounces={false}
        >
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>
              Segment {selectedSegment.sort_order + 1}
            </Text>
            <Pressable onPress={() => setSelectedSegment(null)} testID="sheet-close">
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>

          {/* Surface type chips */}
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Surface</Text>
          <View style={styles.chipRow}>
            {(SURFACE_TYPES as readonly string[]).map((s) => (
              <Pressable
                key={s}
                onPress={() =>
                  setSelectedSegment({
                    ...selectedSegment,
                    surface_type: selectedSegment.surface_type === s ? null : s,
                  })
                }
                style={[
                  styles.chip,
                  {
                    backgroundColor:
                      selectedSegment.surface_type === s
                        ? colors.primaryMuted
                        : colors.surfaceMuted,
                    borderColor:
                      selectedSegment.surface_type === s ? colors.primary : "transparent",
                  },
                ]}
                testID={`sheet-surface-${s}`}
              >
                <Text
                  style={[
                    styles.chipText,
                    {
                      color:
                        selectedSegment.surface_type === s
                          ? colors.primary
                          : colors.textSecondary,
                    },
                  ]}
                >
                  {s}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Toggles */}
          <View style={styles.toggleRow}>
            <Text style={[styles.toggleLabel, { color: colors.text }]}>Pseudo-trail</Text>
            <Switch
              value={selectedSegment.is_pseudo_trail}
              onValueChange={(v) =>
                setSelectedSegment({ ...selectedSegment, is_pseudo_trail: v })
              }
              testID="sheet-pseudo-toggle"
            />
          </View>
          <View style={styles.toggleRow}>
            <Text style={[styles.toggleLabel, { color: colors.text }]}>Road connector</Text>
            <Switch
              value={selectedSegment.is_road_connector}
              onValueChange={(v) =>
                setSelectedSegment({ ...selectedSegment, is_road_connector: v })
              }
              testID="sheet-road-toggle"
            />
          </View>

          {/* Low consensus */}
          {selectedSegment.consensus != null && selectedSegment.consensus < 0.4 ? (
            <View style={styles.sheetActionRow}>
              <Text style={[styles.warning, { color: colors.warning }]}>
                Low confidence · {selectedSegment.consensus.toFixed(2)}
              </Text>
              {isTrustedOrMod ? (
                <Button
                  variant="ghost"
                  size="small"
                  onPress={handleClearConsensus}
                  testID="sheet-clear-consensus"
                >
                  Clear
                </Button>
              ) : null}
            </View>
          ) : null}

          {/* Actions */}
          <View style={styles.sheetActions}>
            <Button
              variant="primary"
              size="small"
              onPress={handleSaveSegment}
              disabled={saving || !isOnline}
              testID="sheet-save"
            >
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button
              variant="ghost"
              size="small"
              onPress={handleDeleteSegment}
              testID="sheet-delete"
            >
              Delete
            </Button>
          </View>
        </ScrollView>
      ) : null}

      {selectedTraceSpan ? (
        <View style={[styles.bottomSheet, { backgroundColor: colors.surface }]} testID="trail-assign-sheet">
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Assign to trail</Text>
            <Pressable onPress={() => setSelectedTraceSpan(null)} testID="trail-sheet-close">
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>
          {trails.length > 0 ? (
            <>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Existing trails</Text>
              {trails.filter((t) => t.tier !== "premium").map((t) => (
                <Pressable
                  key={t.id}
                  onPress={() => {
                    setSelectedTraceSpan(null);
                    // TODO: call vote API to assign trace span to this trail
                  }}
                  style={[styles.trailRow, { borderBottomColor: colors.divider }]}
                  testID={`trail-assign-${t.id}`}
                >
                  <Ionicons name="trail-sign-outline" size={16} color={colors.primary} />
                  <Text style={[styles.trailRowText, { color: colors.text }]}>{t.name}</Text>
                </Pressable>
              ))}
            </>
          ) : null}
          <Button
            variant="primary"
            size="small"
            onPress={() => {
              setSelectedTraceSpan(null);
              // TODO: create new trail flow
            }}
            testID="trail-assign-new"
          >
            + Create new trail
          </Button>
        </View>
      ) : null}

      <Text style={[styles.foot, { color: colors.textMuted }]} testID="editor-foot">
        {segments.length} segments · {trails.length} trails · {mode === "segments" ? "Segment mode" : "Trail mode"} · snap: {snapEnabled ? "on" : "off"}
      </Text>
    </View>
  );
}

function extractCoords(seg: Partial<TrailSegment>): Array<[number, number]> {
  const geom = seg.geometry as { coordinates?: unknown; type?: string } | undefined;
  if (!geom) return [];
  if (geom.type === "LineString" && Array.isArray(geom.coordinates)) {
    return geom.coordinates as Array<[number, number]>;
  }
  if (geom.type === "MultiLineString" && Array.isArray(geom.coordinates)) {
    return (geom.coordinates as Array<Array<[number, number]>>).flat();
  }
  return [];
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  doneText: { fontSize: 16, fontWeight: "600" },
  errorBanner: { padding: 10 },
  errorText: { fontSize: 13 },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  modeToggle: { flexDirection: "row", borderRadius: 8, overflow: "hidden" },
  modeBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
  modeBtnText: { fontSize: 13, fontWeight: "600" },
  toolActions: { flexDirection: "row", gap: 6 },
  toolBtn: {
    padding: 8,
    borderRadius: 8,
  },
  mapWrap: { flex: 1 },
  bottomSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 40,
    maxHeight: 420,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  sheetTitle: { fontSize: 18, fontWeight: "700" },
  sheetSub: { fontSize: 13, marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontWeight: "600", marginBottom: 6, marginTop: 10 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 8, borderWidth: 1,
  },
  chipText: { fontSize: 12, fontWeight: "600" },
  toggleRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 8, marginTop: 4,
  },
  toggleLabel: { fontSize: 13, fontWeight: "600" },
  sheetActionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
  },
  warning: { fontSize: 12, fontWeight: "600" },
  sheetActions: {
    flexDirection: "row", justifyContent: "flex-end",
    marginTop: 16, gap: 8,
  },
  foot: {
    fontSize: 10,
    textAlign: "center",
    paddingVertical: 6,
  },
  trailRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    gap: 8,
  },
  trailRowText: { fontSize: 14, fontWeight: "600" },
});
