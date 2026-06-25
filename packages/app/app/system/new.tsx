import { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { MapContainer } from "@magnum/map";
import { createMagnumClient, PROVENANCE_SOURCES, type ProvenanceSource } from "@magnum/shared";
import { Button } from "../../src/components/ui/Button";
import { useAuthStore } from "../../src/stores/authStore";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
const MARTIN_URL = process.env.EXPO_PUBLIC_MARTIN_URL ?? "http://localhost:3001";

/**
 * §21.3.4 / §21.5 — New System screen.
 *
 * Required fields per outline.md: name, slug, provenance (ownership_source
 * + source_date), boundary. The boundary is captured as a polygon (a
 * list of [lon, lat] vertices) — the API stores it via
 * `ST_GeomFromGeoJSON` on the server side.
 *
 * For Phase 3.7 the polygon-draw UI is simplified: tap a "+" button to
 * drop a vertex at the map's center, then a "Close polygon" button to
 * seal the ring. The full OpenLayers draw interaction lives in
 * `packages/map` and is wired in a follow-up.
 */
export default function NewSystemScreen() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [source, setSource] = useState<ProvenanceSource>("OSM");
  const [sourceDate, setSourceDate] = useState(new Date().toISOString().slice(0, 10));
  const [polygon, setPolygon] = useState<Array<[number, number]>>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave =
    name.trim().length > 0 &&
    slug.trim().length > 0 &&
    sourceDate.trim().length > 0 &&
    polygon.length >= 3 &&
    !saving;

  const submit = async () => {
    if (!isAuthenticated) {
      Alert.alert("Sign in required", "Log in to create a new system.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const client = createMagnumClient(API_URL, {
        getAuthToken: () => token ?? undefined,
      });
      const closed =
        polygon.length >= 3 &&
        (polygon[0]?.[0] !== polygon[polygon.length - 1]?.[0] ||
          polygon[0]?.[1] !== polygon[polygon.length - 1]?.[1])
          ? [...polygon, polygon[0] as [number, number]]
          : polygon;
      const payload = {
        name: name.trim(),
        slug: slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-"),
        description: description.trim() || undefined,
        external_url: externalUrl.trim() || undefined,
        ownership_source: source,
        source_date: sourceDate,
        boundary: { type: "Polygon", coordinates: [closed] },
      };
      await client.raw.request<Record<string, unknown>>("POST", "/api/systems", { body: payload });
      router.replace(`/system/${payload.slug}` as never);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create system");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: "New System" }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content} testID="new-system-screen">
        <View style={styles.section}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={(v) => {
              setName(v);
              if (!slug) setSlug(v.toLowerCase().replace(/[^a-z0-9-]+/g, "-"));
            }}
            placeholder="Mountains Park"
            testID="new-system-name"
          />
        </View>
        <View style={styles.section}>
          <Text style={styles.label}>Slug</Text>
          <TextInput
            style={styles.input}
            value={slug}
            onChangeText={setSlug}
            placeholder="mountains-park"
            autoCapitalize="none"
            testID="new-system-slug"
          />
        </View>
        <View style={styles.section}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="What this area is known for…"
            multiline
            testID="new-system-description"
          />
        </View>
        <View style={styles.section}>
          <Text style={styles.label}>External URL</Text>
          <TextInput
            style={styles.input}
            value={externalUrl}
            onChangeText={setExternalUrl}
            placeholder="https://example.com/park"
            autoCapitalize="none"
            testID="new-system-url"
          />
        </View>
        <View style={styles.section}>
          <Text style={styles.label}>Provenance</Text>
          <View style={styles.chipsRow}>
            {PROVENANCE_SOURCES.map((s) => (
              <Pressable
                key={s}
                onPress={() => setSource(s)}
                style={[styles.chip, source === s ? styles.chipActive : null]}
                testID={`new-system-source-${s}`}
              >
                <Text style={[styles.chipText, source === s ? styles.chipTextActive : null]}>
                  {s}
                </Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            style={[styles.input, { marginTop: 8 }]}
            value={sourceDate}
            onChangeText={setSourceDate}
            placeholder="YYYY-MM-DD"
            testID="new-system-source-date"
          />
        </View>
        <View style={styles.section}>
          <Text style={styles.label}>Boundary</Text>
          <Text style={styles.hint}>
            Pan/zoom the map, then tap a vertex position via the controls
            below. The polygon is saved as a GeoJSON Polygon with
            [lon, lat] vertices. Polygon-draw is in a follow-up; for now
            use the controls to add vertices one at a time at the map's
            center.
          </Text>
          <View style={styles.mapPreview} testID="new-system-map">
            <MapContainer
              config={{
                martinTilesUrl: MARTIN_URL,
                initialCenter: [-82.9988, 39.9612],
                initialZoom: 7,
              }}
            />
          </View>
          <View style={styles.polygonActions}>
            <Button
              size="small"
              variant="secondary"
              onPress={() => {
                // Placeholder: in a follow-up we'll wire this to the
                // map's center coord. For now, use a fixed sample.
                setPolygon((prev) => [...prev, [-82.9988 + prev.length * 0.01, 39.9612]]);
              }}
              testID="new-system-add-vertex"
            >
              + Add vertex at map center
            </Button>
            <Button
              size="small"
              variant="ghost"
              onPress={() => setPolygon([])}
              testID="new-system-clear-vertices"
            >
              Clear
            </Button>
          </View>
          <Text style={styles.vertexCount} testID="new-system-vertex-count">
            {polygon.length} vertex{polygon.length === 1 ? "" : "es"}
          </Text>
        </View>
        {error ? (
          <View style={styles.errorBanner} testID="new-system-error">
            <Ionicons name="alert-circle" size={16} color="#ef4444" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        <View style={styles.footer}>
          <Button variant="secondary" onPress={() => router.back()} testID="new-system-cancel">
            Cancel
          </Button>
          <Button
            variant="primary"
            onPress={submit}
            disabled={!canSave}
            testID="new-system-save"
          >
            {saving ? "Saving…" : "Create System"}
          </Button>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 16, gap: 16, paddingBottom: 32 },
  section: { gap: 6 },
  label: { fontSize: 12, fontWeight: "700", color: "#444" },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
    color: "#222",
    backgroundColor: "#fafafa",
  },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: "#f1f1f1" },
  chipActive: { backgroundColor: "#22c55e" },
  chipText: { fontSize: 12, color: "#444" },
  chipTextActive: { color: "#fff", fontWeight: "600" },
  mapPreview: { height: 220, backgroundColor: "#e8e8e8", borderRadius: 6, overflow: "hidden" },
  polygonActions: { flexDirection: "row", gap: 8, marginTop: 8 },
  vertexCount: { fontSize: 12, color: "#888", marginTop: 4 },
  hint: { fontSize: 12, color: "#888" },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fef2f2",
    padding: 10,
    borderRadius: 6,
  },
  errorText: { color: "#ef4444", fontSize: 12, flex: 1 },
  footer: { flexDirection: "row", justifyContent: "space-between", gap: 8, marginTop: 8 },
});
