import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { MapContainer, resolveBaseLayers } from "@magnum/map";
import {
  createMagnumClient,
  type Feature as ApiFeature,
  type System,
  type Trail,
} from "@magnum/shared";
import { SearchBar } from "../../src/components/ui/SearchBar";
import {
  SearchResultsDropdown,
  type SearchResults,
} from "../../src/components/ui/SearchResultsDropdown";
import { BaseLayerSwitcher } from "../../src/components/map/BaseLayerSwitcher";
import { DownloadAreaSheet } from "../../src/components/offline/DownloadAreaSheet";
import { AddFeatureSheet } from "../../src/components/feature/AddFeatureSheet";
import { UploadTraceSheet } from "../../src/components/trace/UploadTraceSheet";
import { useMapStore } from "../../src/stores/mapStore";
import { useOfflineStore } from "../../src/stores/offlineStore";
import { useBaseLayerStore } from "../../src/stores/baseLayerStore";
import { useAuthStore } from "../../src/stores/authStore";
import { usePresetStore } from "../../src/stores/presetStore";
import { useTheme } from "../../src/providers/ThemeProvider";
import { hexToRgba } from "../../src/theme/hexToRgba";
import {
  loadOfflineMapData,
  getDownloadedRegionIds,
  addPendingContribution,
  getPendingCount,
} from "../../src/services/offlineDataService";
import type { OfflineMapData } from "../../src/services/offlineDataService";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
const MARTIN_URL = process.env.EXPO_PUBLIC_MARTIN_URL ?? "http://localhost:3001";

const MIN_QUERY_LENGTH = 1;
const SEARCH_DEBOUNCE_MS = 250;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function parseDeepLink(
  params: Partial<Record<"lat" | "lon" | "zoom", string | string[] | undefined>>,
): {
  lat: number;
  lon: number;
  zoom: number;
} | null {
  const firstScalar = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const lat = Number(firstScalar(params.lat));
  const lon = Number(firstScalar(params.lon));
  const zoomRaw = Number(firstScalar(params.zoom));
  if (!isFiniteNumber(lat) || !isFiniteNumber(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon, zoom: isFiniteNumber(zoomRaw) ? zoomRaw : 12 };
}

export default function ExploreScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ lat?: string; lon?: string; zoom?: string }>();
  const mapCenter = useMapStore((s) => s.center);
  const mapZoom = useMapStore((s) => s.zoom);
  const systemTileVersion = useMapStore((s) => s.systemTileVersion);
  const trailTileVersion = useMapStore((s) => s.trailTileVersion);
  const segmentTileVersion = useMapStore((s) => s.segmentTileVersion);
  const featureTileVersion = useMapStore((s) => s.featureTileVersion);
  const superSystemTileVersion = useMapStore((s) => s.superSystemTileVersion);
  const showHeatmap = useMapStore((s) => s.showHeatmap);
  const toggleHeatmap = useMapStore((s) => s.toggleHeatmap);
  const setViewport = useMapStore((s) => s.setViewport);
  const isOnline = useOfflineStore((s) => s.isOnline);
  const offlineRegions = useOfflineStore((s) => s.offlineRegions);
  const baseLayerId = useBaseLayerStore((s) => s.baseLayerId);
  const baseLayerDefs = useMemo(() => resolveBaseLayers({ martinTilesUrl: MARTIN_URL }), []);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [offlineData, setOfflineData] = useState<OfflineMapData | null>(null);
  const [isPlacing, setIsPlacing] = useState(false);
  const [selectedSystemSlug, setSelectedSystemSlug] = useState<string | null>(null);
  const [selectedSystem, setSelectedSystem] = useState<System | null>(null);
  const [systemLoading, setSystemLoading] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawBbox, setDrawBbox] = useState<{
    minLon: number;
    minLat: number;
    maxLon: number;
    maxLat: number;
  } | null>(null);
  const [showDownloadSheet, setShowDownloadSheet] = useState(false);
  const [addFeatureAt, setAddFeatureAt] = useState<{ lon: number; lat: number } | null>(null);
  const [addFeatureSubmitting, setAddFeatureSubmitting] = useState(false);
  const [detectedSystemId, setDetectedSystemId] = useState<string | null>(null);
  const [showUploadTrace, setShowUploadTrace] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setPendingCount = useOfflineStore((s) => s.setPendingCount);
  const contributorName = useAuthStore((s) => s.contributorName);
  const fetchPresets = usePresetStore((s) => s.fetchPresets);
  // Web is always online, so the offline-download FAB is irrelevant there.
  // Hiding it also lets the add-feature FAB sit lower (closer to the tab bar).
  const isWeb = Platform.OS === "web";
  const showDownloadFab = isOnline && !isWeb;
  const lastRequestRef = useRef(0);

  const deepLink = useMemo(() => parseDeepLink(params), [params]);
  // Deep-link coords drive an animated `flyTo` (camera pan) instead of
  // changing initialCenter/initialZoom. The map is created once and reused,
  // so this pans the existing camera rather than recreating the whole map.
  // Deps are the primitive values (not `deepLink` itself) so the memo returns
  // a stable reference across re-renders that don't change the target —
  // otherwise every re-render (e.g. after a moveEnd → mapStore update) would
  // produce a new `flyTo` object and re-trigger the animation, snapping the
  // camera back to the deep-link position.
  const flyTo = useMemo(
    () => (deepLink ? { lon: deepLink.lon, lat: deepLink.lat, zoom: deepLink.zoom } : null),
    [deepLink?.lat, deepLink?.lon, deepLink?.zoom],
  );

  // The map's initial viewport comes from the persisted mapStore so the
  // camera position survives navigation (SPA-style). `mapConfig` only feeds
  // the initial mount; subsequent camera moves go through `flyTo` and
  // moveEnd → mapStore. The base layer is selected separately via
  // `baseLayerId` (from baseLayerStore) so it can be swapped without
  // re-rendering the map or recreating the OL/WebView instance.
  const mapConfig = useMemo(
    () => ({
      martinTilesUrl: MARTIN_URL,
      apiUrl: API_URL,
      baseLayers: baseLayerDefs,
      initialCenter: mapCenter,
      initialZoom: mapZoom,
    }),
    [mapCenter, mapZoom, baseLayerDefs],
  );

  useEffect(() => {
    if (!selectedSystemSlug) {
      setSelectedSystem(null);
      return;
    }
    let cancelled = false;
    setSystemLoading(true);
    const client = createMagnumClient(API_URL);
    client.raw
      .request<System>("GET", `/api/systems/by-slug/${selectedSystemSlug}`)
      .then((s) => {
        if (!cancelled) setSelectedSystem(s);
      })
      .catch(() => {
        if (!cancelled) setSelectedSystem(null);
      })
      .finally(() => {
        if (!cancelled) setSystemLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSystemSlug]);

  // Load offline map data when offline with downloaded regions
  useEffect(() => {
    if (isOnline || offlineRegions.length === 0) {
      setOfflineData(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const ids = await getDownloadedRegionIds();
      if (ids.length === 0 || cancelled) return;
      const data = await loadOfflineMapData();
      if (!cancelled) setOfflineData(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [isOnline, offlineRegions]);

  // Search offline when disconnected
  useEffect(() => {
    if (isOnline || !query || query.length < MIN_QUERY_LENGTH) {
      if (!isOnline && !query) {
        setResults(null);
        setLoading(false);
      }
      return;
    }
    setResults(null);
    setLoading(false);
  }, [isOnline, query]);

  useEffect(() => {
    if (!query || query.length < MIN_QUERY_LENGTH) {
      setResults(null);
      setLoading(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const requestId = ++lastRequestRef.current;
      setLoading(true);
      const client = createMagnumClient(API_URL);
      client
        .search({ q: query, type: "all", limit: 20 })
        .then((res) => {
          if (requestId !== lastRequestRef.current) return;
          setResults(res);
          setShowResults(true);
        })
        .catch(() => {
          if (requestId !== lastRequestRef.current) return;
          setResults({ systems: [], trails: [], features: [] });
          setShowResults(true);
        })
        .finally(() => {
          if (requestId !== lastRequestRef.current) return;
          setLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const dismissResults = useCallback(() => setShowResults(false), []);

  const handleMoveEnd = useCallback(
    (center: [number, number], zoom: number) => {
      setViewport(center, zoom);
    },
    [setViewport],
  );

  const handleSystem = useCallback(
    (s: System) => {
      setShowResults(false);
      setQuery("");
      router.push(`/system/${s.slug}` as never);
    },
    [router],
  );

  const handleTrail = useCallback(
    (t: Trail) => {
      setShowResults(false);
      setQuery("");
      router.push(`/trail/${t.slug}` as never);
    },
    [router],
  );

  const handleFeature = useCallback(
    (f: ApiFeature) => {
      setShowResults(false);
      setQuery("");
      router.push(`/feature/${f.id}` as never);
    },
    [router],
  );

  const handleFeatureSelect = useCallback(
    (selection: {
      id: string;
      layer: "trails" | "segments" | "systems" | "features" | "superSystems";
      slug?: string | null;
    }) => {
      if (selection.layer === "trails" && selection.slug) {
        router.push(`/trail/${selection.slug}` as never);
        return;
      }
      if (selection.layer === "systems" && selection.slug) {
        setSelectedSystemSlug(selection.slug);
        return;
      }
      if (selection.layer === "superSystems" && selection.slug) {
        setSelectedSystemSlug(selection.slug);
        return;
      }
      if (selection.layer === "features") {
        router.push(`/feature/${selection.id}` as never);
        return;
      }
    },
    [router],
  );

  const handleClearQuery = useCallback(() => {
    setQuery("");
    setResults(null);
    setShowResults(false);
  }, []);

  const handleMapClick = useCallback(
    (lon: number, lat: number) => {
      if (isPlacing) {
        setIsPlacing(false);
        // §21.3.1 + §21.4 — drop a pin, open the Add-Feature bottom sheet
        // in place, and run a point-in-polygon lookup so the system
        // chip can pre-fill "📍 Mountains Park" if the user dropped the
        // pin inside a system boundary.
        setAddFeatureAt({ lon, lat });
        void fetchPresets();
        const client = createMagnumClient(API_URL);
        client
          .getSystemsContaining({ lon, lat })
          .then((res) => {
            const top = res.systems[0];
            if (top) {
              setDetectedSystemId(top.id);
            }
          })
          .catch(() => undefined);
      }
    },
    [fetchPresets, isPlacing],
  );

  const handleAddFeatureSubmit = useCallback(
    async (result: {
      preset_id: string;
      name: string;
      answers: Record<string, string | boolean>;
      description?: string;
      system_id?: string | null;
    }) => {
      if (!addFeatureAt) return;
      setAddFeatureSubmitting(true);
      const payload: Record<string, unknown> = {
        name: result.name,
        preset_id: result.preset_id,
        answers: result.answers,
        point: {
          type: "Point",
          coordinates: [addFeatureAt.lon, addFeatureAt.lat],
        },
        description: result.description,
      };
      if (result.system_id) {
        payload.system_id = result.system_id;
      }
      const offline = !useOfflineStore.getState().isOnline;
      try {
        if (offline) {
          await addPendingContribution(
            "feature",
            "create",
            payload,
            contributorName || "anonymous",
          );
          const newCount = await getPendingCount();
          setPendingCount(newCount);
          setAddFeatureAt(null);
          Alert.alert("Queued", "Feature saved offline — will sync when online.");
          return;
        }
        const client = createMagnumClient(API_URL, {
          getAuthToken: () => useAuthStore.getState().token ?? undefined,
        });
        await client.createFeature(payload as Parameters<typeof client.createFeature>[0]);
        useMapStore.getState().incrementFeatureTileVersion();
        setAddFeatureAt(null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to create feature";
        if (!offline && /network|fetch|timeout/i.test(msg)) {
          try {
            await addPendingContribution(
              "feature",
              "create",
              payload,
              contributorName || "anonymous",
            );
            const newCount = await getPendingCount();
            setPendingCount(newCount);
            setAddFeatureAt(null);
            Alert.alert("Queued", "Feature queued — will sync when back online.");
            return;
          } catch {
            // fall through to error
          }
        }
        Alert.alert("Error", msg);
      } finally {
        setAddFeatureSubmitting(false);
      }
    },
    [addFeatureAt, contributorName, setPendingCount],
  );

  const handleStartPlacing = useCallback(() => {
    setIsPlacing(true);
  }, []);

  const handleCancelPlacing = useCallback(() => {
    setIsPlacing(false);
  }, []);

  const handleDismissSystemPopup = useCallback(() => {
    setSelectedSystemSlug(null);
    setSelectedSystem(null);
  }, []);

  const offlineBaseLayer = useMemo(() => {
    if (isOnline || offlineRegions.length === 0) return null;
    const region = offlineRegions[0];
    if (!region?.tilesPath) return null;
    return {
      kind: region.baseLayerId === "satellite" ? ("raster" as const) : ("mvt" as const),
      tilesPath: region.tilesPath,
      minZoom: region.minZoom,
      maxZoom: region.maxZoom,
    };
  }, [isOnline, offlineRegions]);

  const handleDrawEnd = useCallback(
    (bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number }) => {
      setIsDrawing(false);
      setDrawBbox(bbox);
      setShowDownloadSheet(true);
    },
    [],
  );

  const handleStartDraw = useCallback(() => {
    setIsDrawing(true);
    setShowDownloadSheet(false);
  }, []);

  const handleCancelDraw = useCallback(() => {
    setIsDrawing(false);
  }, []);

  const handleDismissDownloadSheet = useCallback(() => {
    setShowDownloadSheet(false);
    setDrawBbox(null);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]} testID="explore-screen">
      <View style={styles.searchRow}>
        <View style={styles.searchWrap}>
          <SearchBar
            value={query}
            onChangeText={setQuery}
            placeholder="Search trails, systems, features..."
            testID="explore-search"
          />
          {query.length > 0 ? (
            <Pressable
              onPress={handleClearQuery}
              style={styles.clearBtn}
              testID="explore-search-clear"
              accessibilityLabel="Clear search"
            >
              <Text style={[styles.clearText, { color: colors.textMuted }]}>×</Text>
            </Pressable>
          ) : null}
          {showResults && query.length >= MIN_QUERY_LENGTH ? (
            <SearchResultsDropdown
              query={query}
              results={results}
              loading={loading}
              onSelectSystem={handleSystem}
              onSelectTrail={handleTrail}
              onSelectFeature={handleFeature}
              onDismiss={dismissResults}
            />
          ) : null}
        </View>
      </View>

      <View style={styles.mapContainer} testID="explore-map">
        <MapContainer
          config={mapConfig}
          baseLayerId={baseLayerId}
          onFeatureSelect={handleFeatureSelect}
          onClick={handleMapClick}
          onMoveEnd={handleMoveEnd}
          flyTo={flyTo}
          offlineMode={!isOnline}
          offlineData={offlineData}
          offlineBaseLayer={offlineBaseLayer}
          drawMode={isDrawing}
          onDrawEnd={handleDrawEnd}
          systemTileVersion={systemTileVersion}
          trailTileVersion={trailTileVersion}
          segmentTileVersion={segmentTileVersion}
          featureTileVersion={featureTileVersion}
          superSystemTileVersion={superSystemTileVersion}
          showHeatmap={showHeatmap}
        />
        <BaseLayerSwitcher layers={baseLayerDefs} testID="explore-base-layer-switcher" />
        <Pressable
          style={[
            styles.heatmapToggle,
            {
              backgroundColor: hexToRgba(colors.surface, 0.95),
              borderColor: hexToRgba(colors.shadow, 0.08),
              shadowColor: colors.shadow,
            },
            showHeatmap && {
              backgroundColor: colors.warningMuted,
              borderColor: hexToRgba(colors.warning, 0.3),
            },
          ]}
          onPress={toggleHeatmap}
          testID="explore-heatmap-toggle"
          accessibilityLabel="Toggle trace heatmap"
        >
          <Ionicons
            name={showHeatmap ? "flame" : "flame-outline"}
            size={18}
            color={showHeatmap ? colors.warning : colors.textMuted}
          />
        </Pressable>
      </View>

      {deepLink ? (
        <View
          style={[styles.coordsBadge, { backgroundColor: hexToRgba(colors.shadow, 0.65) }]}
          testID="explore-coords"
        >
          <Text style={[styles.coordsText, { color: colors.textInverse }]}>
            {deepLink.lat.toFixed(4)}, {deepLink.lon.toFixed(4)} · z{deepLink.zoom}
          </Text>
        </View>
      ) : null}

      {selectedSystemSlug ? (
        <View style={styles.systemPopupOverlay} testID="explore-system-popup">
          <View style={[styles.systemPopup, { backgroundColor: colors.surface, shadowColor: colors.shadow }]}>
            <View style={styles.systemPopupHeader}>
              <View style={styles.systemPopupTitleRow}>
                {selectedSystem?.color ? (
                  <View
                    style={[styles.systemColorDot, { backgroundColor: selectedSystem.color, borderColor: colors.border }]}
                  />
                ) : null}
                {systemLoading ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={[styles.systemPopupTitle, { color: colors.text }]}>
                    {selectedSystem?.name ?? selectedSystemSlug}
                  </Text>
                )}
              </View>
              <Pressable
                onPress={handleDismissSystemPopup}
                style={styles.systemPopupClose}
                testID="system-popup-close"
                accessibilityLabel="Close"
              >
                <Text style={[styles.systemPopupCloseText, { color: colors.textMuted }]}>×</Text>
              </Pressable>
            </View>
            {selectedSystem?.description ? (
              <Text style={[styles.systemPopupDesc, { color: colors.textSecondary }]} numberOfLines={4}>
                {selectedSystem.description}
              </Text>
            ) : null}
            <View style={styles.systemPopupActions}>
              <Pressable
                style={styles.systemPopupLink}
                onPress={() => {
                  handleDismissSystemPopup();
                  router.push(`/system/${selectedSystemSlug}` as never);
                }}
                testID="system-popup-detail"
              >
                <Text style={[styles.systemPopupLinkText, { color: colors.primary }]}>View details →</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      {isPlacing ? (
        <View style={[styles.placingBanner, { backgroundColor: colors.primary, shadowColor: colors.shadow }]} testID="explore-placing-banner">
          <Text style={[styles.placingText, { color: colors.textInverse }]}>Tap on the map to place your feature</Text>
          <Pressable
            onPress={handleCancelPlacing}
            style={[styles.placingCancel, { backgroundColor: hexToRgba(colors.surface, 0.2) }]}
            testID="explore-placing-cancel"
          >
            <Text style={[styles.placingCancelText, { color: colors.textInverse }]}>Cancel</Text>
          </Pressable>
        </View>
      ) : isDrawing ? (
        <View style={[styles.placingBanner, { backgroundColor: colors.primary, shadowColor: colors.shadow }]} testID="explore-draw-banner">
          <Text style={[styles.placingText, { color: colors.textInverse }]}>Drag to select download area</Text>
          <Pressable
            onPress={handleCancelDraw}
            style={[styles.placingCancel, { backgroundColor: hexToRgba(colors.surface, 0.2) }]}
            testID="explore-draw-cancel"
          >
            <Text style={[styles.placingCancelText, { color: colors.textInverse }]}>Cancel</Text>
          </Pressable>
        </View>
      ) : (
        <View style={[styles.fabColumn, !showDownloadFab && styles.fabColumnAlone]}>
          {showDownloadFab ? (
            <Pressable
              style={[styles.downloadAreaFab, { backgroundColor: colors.primary, shadowColor: colors.shadow }]}
              onPress={handleStartDraw}
              testID="explore-download-area"
            >
              <Text style={[styles.downloadAreaFabText, { color: colors.textInverse }]}>⬇</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={[styles.uploadTraceFab, { backgroundColor: colors.primary, shadowColor: colors.shadow }]}
            onPress={() => setShowUploadTrace(true)}
            testID="explore-upload-trace"
          >
            <Ionicons name="navigate-outline" size={20} color={colors.textInverse} />
          </Pressable>
          <Pressable
            style={[styles.addFeatureFab, { backgroundColor: colors.primary, shadowColor: colors.shadow }]}
            onPress={handleStartPlacing}
            testID="explore-add-feature"
          >
            <Text style={[styles.addFeatureFabText, { color: colors.textInverse }]}>+</Text>
          </Pressable>
        </View>
      )}

      {showDownloadSheet && drawBbox ? (
        <DownloadAreaSheet
          bbox={drawBbox}
          baseLayerId={baseLayerId}
          baseLayerLabel={baseLayerDefs.find((l) => l.id === baseLayerId)?.label ?? baseLayerId}
          onDismiss={handleDismissDownloadSheet}
          testID="explore-download-sheet"
        />
      ) : null}

      <AddFeatureSheet
        visible={addFeatureAt !== null}
        onClose={() => {
          setAddFeatureAt(null);
          setDetectedSystemId(null);
        }}
        onSubmit={async (r) => {
          await handleAddFeatureSubmit(r);
          setDetectedSystemId(null);
        }}
        submitting={addFeatureSubmitting}
        detectedSystemId={detectedSystemId}
        testID="explore-add-feature-sheet"
      />

      <UploadTraceSheet
        visible={showUploadTrace}
        onClose={() => setShowUploadTrace(false)}
        onImported={() => {
          // A trace was uploaded — nothing on the explore map to do
          // (the new trace shows up in the system it was auto-tagged
          // into). The user navigates to that system from the
          // hierarchy tree if they want to see it.
        }}
        testID="explore-upload-trace-sheet"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchRow: { flexDirection: "row", alignItems: "flex-start", paddingRight: 12, zIndex: 10 },
  searchWrap: { flex: 1, position: "relative" },
  clearBtn: {
    position: "absolute",
    right: 20,
    top: 18,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  clearText: { fontSize: 18, lineHeight: 20 },
  mapContainer: { flex: 1 },
  coordsBadge: {
    position: "absolute",
    bottom: 24,
    alignSelf: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  coordsText: { fontSize: 12 },
  systemPopupOverlay: {
    position: "absolute",
    bottom: 24,
    left: 16,
    right: 16,
    zIndex: 20,
  },
  systemPopup: {
    borderRadius: 12,
    padding: 16,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
    gap: 10,
  },
  systemPopupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  systemPopupTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  systemColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
  },
  systemPopupTitle: {
    fontSize: 17,
    fontWeight: "700",
    flexShrink: 1,
  },
  systemPopupClose: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  systemPopupCloseText: {
    fontSize: 22,
    lineHeight: 26,
  },
  systemPopupDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  systemPopupActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  systemPopupLink: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  systemPopupLinkText: {
    fontSize: 13,
    fontWeight: "600",
  },
  placingBanner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  placingText: {
    fontSize: 14,
    fontWeight: "600",
  },
  placingCancel: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  placingCancelText: {
    fontSize: 13,
    fontWeight: "600",
  },
  addFeatureFab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  uploadTraceFab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  addFeatureFabText: { fontSize: 24, lineHeight: 28 },
  fabColumn: {
    position: "absolute",
    bottom: 80,
    right: 20,
    gap: 12,
    alignItems: "center",
  },
  fabColumnAlone: {
    bottom: 32,
  },
  downloadAreaFab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  downloadAreaFabText: { fontSize: 20, lineHeight: 24 },
  heatmapToggle: {
    position: "absolute",
    top: 56,
    right: 12,
    zIndex: 50,
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  heatmapToggleActive: {},
});
