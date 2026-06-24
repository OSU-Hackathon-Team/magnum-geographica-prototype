import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { MapContainer, resolveBaseLayers } from "@magnum/map";
import { createMagnumClient, type Feature as ApiFeature, type System, type Trail } from "@magnum/shared";
import { SearchBar } from "../../src/components/ui/SearchBar";
import {
  SearchResultsDropdown,
  type SearchResults,
} from "../../src/components/ui/SearchResultsDropdown";
import { BaseLayerSwitcher } from "../../src/components/map/BaseLayerSwitcher";
import { DownloadAreaSheet } from "../../src/components/offline/DownloadAreaSheet";
import { useMapStore } from "../../src/stores/mapStore";
import { useOfflineStore } from "../../src/stores/offlineStore";
import { useBaseLayerStore } from "../../src/stores/baseLayerStore";
import {
  loadOfflineMapData,
  getDownloadedRegionIds,
} from "../../src/services/offlineDataService";
import type { OfflineMapData } from "../../src/services/offlineDataService";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
const MARTIN_URL = process.env.EXPO_PUBLIC_MARTIN_URL ?? "http://localhost:3001";

const MIN_QUERY_LENGTH = 1;
const SEARCH_DEBOUNCE_MS = 250;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function parseDeepLink(params: Partial<Record<"lat" | "lon" | "zoom", string | string[] | undefined>>): {
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
  const params = useLocalSearchParams<{ lat?: string; lon?: string; zoom?: string }>();
  const mapCenter = useMapStore((s) => s.center);
  const mapZoom = useMapStore((s) => s.zoom);
  const setViewport = useMapStore((s) => s.setViewport);
  const isOnline = useOfflineStore((s) => s.isOnline);
  const offlineRegions = useOfflineStore((s) => s.offlineRegions);
  const baseLayerId = useBaseLayerStore((s) => s.baseLayerId);
  const baseLayerDefs = useMemo(
    () => resolveBaseLayers({ martinTilesUrl: MARTIN_URL }),
    [],
  );

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
  const [drawBbox, setDrawBbox] = useState<{ minLon: number; minLat: number; maxLon: number; maxLat: number } | null>(null);
  const [showDownloadSheet, setShowDownloadSheet] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      .then((s) => { if (!cancelled) setSelectedSystem(s); })
      .catch(() => { if (!cancelled) setSelectedSystem(null); })
      .finally(() => { if (!cancelled) setSystemLoading(false); });
    return () => { cancelled = true };
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
    return () => { cancelled = true };
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
    (selection: { id: string; layer: "trails" | "segments" | "systems" | "features" | "superSystems"; slug?: string | null }) => {
      if (selection.layer === "trails" && selection.slug) {
        router.push(`/trail/${selection.slug}` as never);
        return;
      }
      if (selection.layer === "systems" && selection.slug) {
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
        router.push(`/feature/create?lon=${lon.toFixed(6)}&lat=${lat.toFixed(6)}` as never);
      }
    },
    [isPlacing, router],
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
      kind: region.baseLayerId === "satellite" ? "raster" as const : "mvt" as const,
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
    <View style={styles.container} testID="explore-screen">
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
              <Text style={styles.clearText}>×</Text>
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
        />
        <BaseLayerSwitcher
          layers={baseLayerDefs}
          testID="explore-base-layer-switcher"
        />
      </View>

      {deepLink ? (
        <View style={styles.coordsBadge} testID="explore-coords">
          <Text style={styles.coordsText}>
            {deepLink.lat.toFixed(4)}, {deepLink.lon.toFixed(4)} · z{deepLink.zoom}
          </Text>
        </View>
      ) : null}

      {selectedSystemSlug ? (
        <View style={styles.systemPopupOverlay} testID="explore-system-popup">
          <View style={styles.systemPopup}>
            <View style={styles.systemPopupHeader}>
              <View style={styles.systemPopupTitleRow}>
                {selectedSystem?.color ? (
                  <View style={[styles.systemColorDot, { backgroundColor: selectedSystem.color }]} />
                ) : null}
                {systemLoading ? (
                  <ActivityIndicator size="small" />
                ) : (
                  <Text style={styles.systemPopupTitle}>
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
                <Text style={styles.systemPopupCloseText}>×</Text>
              </Pressable>
            </View>
            {selectedSystem?.description ? (
              <Text style={styles.systemPopupDesc} numberOfLines={4}>
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
                <Text style={styles.systemPopupLinkText}>View details →</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      {isPlacing ? (
        <View style={styles.placingBanner} testID="explore-placing-banner">
          <Text style={styles.placingText}>
            Tap on the map to place your feature
          </Text>
          <Pressable
            onPress={handleCancelPlacing}
            style={styles.placingCancel}
            testID="explore-placing-cancel"
          >
            <Text style={styles.placingCancelText}>Cancel</Text>
          </Pressable>
        </View>
      ) : isDrawing ? (
        <View style={styles.placingBanner} testID="explore-draw-banner">
          <Text style={styles.placingText}>
            Drag to select download area
          </Text>
          <Pressable
            onPress={handleCancelDraw}
            style={styles.placingCancel}
            testID="explore-draw-cancel"
          >
            <Text style={styles.placingCancelText}>Cancel</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.fabColumn}>
          <Pressable
            style={styles.addFeatureFab}
            onPress={handleStartPlacing}
            testID="explore-add-feature"
          >
            <Text style={styles.addFeatureFabText}>+</Text>
          </Pressable>
          {isOnline ? (
            <Pressable
              style={styles.downloadAreaFab}
              onPress={handleStartDraw}
              testID="explore-download-area"
            >
              <Text style={styles.downloadAreaFabText}>⬇</Text>
            </Pressable>
          ) : null}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
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
  clearText: { fontSize: 18, color: "#888", lineHeight: 20 },
  mapContainer: { flex: 1 },
  coordsBadge: {
    position: "absolute",
    bottom: 24,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.65)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  coordsText: { color: "#fff", fontSize: 12 },
  systemPopupOverlay: {
    position: "absolute",
    bottom: 24,
    left: 16,
    right: 16,
    zIndex: 20,
  },
  systemPopup: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
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
    borderColor: "rgba(0,0,0,0.15)",
  },
  systemPopupTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111",
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
    color: "#888",
    lineHeight: 26,
  },
  systemPopupDesc: {
    fontSize: 13,
    color: "#555",
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
    color: "#22c55e",
  },
  placingBanner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "#22c55e",
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  placingText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  placingCancel: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 6,
  },
  placingCancelText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  addFeatureFab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#22c55e",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  addFeatureFabText: { fontSize: 24, color: "#fff", lineHeight: 28 },
  fabColumn: {
    position: "absolute",
    bottom: 80,
    right: 20,
    gap: 12,
    alignItems: "center",
  },
  downloadAreaFab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#3b82f6",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  downloadAreaFabText: { fontSize: 20, color: "#fff", lineHeight: 24 },
});
