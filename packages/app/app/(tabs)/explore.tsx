import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { MapContainer } from "@magnum/map";
import { createMagnumClient, type Feature as ApiFeature, type System, type Trail } from "@magnum/shared";
import { SearchBar } from "../../src/components/ui/SearchBar";
import {
  SearchResultsDropdown,
  type SearchResults,
} from "../../src/components/ui/SearchResultsDropdown";
import { useMapStore } from "../../src/stores/mapStore";
import { useOfflineStore } from "../../src/stores/offlineStore";
import {
  loadOfflineMapData,
  getDownloadedSystemIds,
} from "../../src/services/offlineDataService";
import type { OfflineMapData } from "../../src/services/offlineDataService";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
const MARTIN_URL = process.env.EXPO_PUBLIC_MARTIN_URL;

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
  const isOnline = useOfflineStore((s) => s.isOnline);
  const downloadedPacks = useOfflineStore((s) => s.downloadedPacks);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [offlineData, setOfflineData] = useState<OfflineMapData | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRequestRef = useRef(0);

  const deepLink = useMemo(() => parseDeepLink(params), [params]);
  const flyTo = useMemo(
    () => (deepLink ? { lon: deepLink.lon, lat: deepLink.lat, zoom: deepLink.zoom } : null),
    [deepLink],
  );

  // Load offline map data when offline with downloaded packs
  useEffect(() => {
    if (isOnline || downloadedPacks.length === 0) {
      setOfflineData(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const ids = await getDownloadedSystemIds();
      if (ids.length === 0 || cancelled) return;
      const data = await loadOfflineMapData(ids[0]);
      if (!cancelled) setOfflineData(data);
    })();
    return () => { cancelled = true };
  }, [isOnline, downloadedPacks]);

  // Search offline when disconnected
  useEffect(() => {
    if (isOnline || !query || query.length < MIN_QUERY_LENGTH) {
      if (!isOnline && !query) {
        setResults(null);
        setLoading(false);
      }
      return;
    }
    // For offline, search is limited; clear online results
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
    (selection: { id: string; layer: "trails" | "segments" | "systems" | "features"; slug?: string | null }) => {
      if (selection.layer === "trails" && selection.slug) {
        router.push(`/trail/${selection.slug}` as never);
        return;
      }
      if (selection.layer === "systems" && selection.slug) {
        router.push(`/system/${selection.slug}` as never);
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

  const initialCenter = deepLink
    ? ([deepLink.lon, deepLink.lat] as [number, number])
    : mapCenter;
  const initialZoom = deepLink ? deepLink.zoom : mapZoom;

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
          config={{
            baseTileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
            martinTilesUrl: MARTIN_URL,
            initialCenter,
            initialZoom,
          }}
          onFeatureSelect={handleFeatureSelect}
          flyTo={flyTo}
          offlineMode={!isOnline}
          offlineData={offlineData}
        />
      </View>

      {deepLink ? (
        <View style={styles.coordsBadge} testID="explore-coords">
          <Text style={styles.coordsText}>
            {deepLink.lat.toFixed(4)}, {deepLink.lon.toFixed(4)} · z{deepLink.zoom}
          </Text>
        </View>
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
});
