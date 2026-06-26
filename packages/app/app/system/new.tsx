import { useCallback, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  createMagnumClient,
  PROVENANCE_SOURCES,
  shapeSchema,
  shapeToGeoJSON,
  type ProvenanceSource,
  type Shape,
} from "@magnum/shared";
import { Button } from "../../src/components/ui/Button";
import { useAuthStore } from "../../src/stores/authStore";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

/**
 * §21.3.4 / §21.5 — New System screen.
 *
 * Two flows:
 *   - Normal: the user fills out name/slug/provenance, draws the
 *     boundary on a separate full-screen map, then taps Create
 *     System. The boundary is captured by the boundary screen and
 *     passed in via `?fromBoundary=1&shape=<base64-json>`.
 *   - "fromBoundary": we already have a shape from the boundary
 *     screen. We pre-fill the boundary indicator and POST once on
 *     submit. No map is rendered on this screen.
 *
 * Required fields: name, slug, ownership_source, source_date,
 * boundary. The boundary is already in the URL when `fromBoundary=1`.
 */
export default function NewSystemScreen() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const params = useLocalSearchParams<{
    fromBoundary?: string;
    shape?: string;
  }>();
  const fromBoundary = params.fromBoundary === "1";
  // Decode the base64-encoded shape once. The boundary screen sent
  // a base64-url encoded JSON string of the full Shape (including
  // chords and connectFrom). The form only needs the closed rings.
  const decodedShape = decodeShapeParam(params.shape);
  const boundaryVertexCount = decodedShape
    ? decodedShape.rings
        .filter((r) => r.closed)
        .reduce((n, r) => n + r.vertices.length, 0)
    : 0;
  const closedRingCount = decodedShape
    ? decodedShape.rings.filter((r) => r.closed).length
    : 0;

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [source, setSource] = useState<ProvenanceSource>("OSM");
  const [sourceDate, setSourceDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track dirty state so the back button warns before discarding.
  const dirtyRef = useRef(false);
  const markDirty = () => {
    dirtyRef.current = true;
  };

  const canSave =
    name.trim().length > 0 &&
    slug.trim().length > 0 &&
    sourceDate.trim().length > 0 &&
    boundaryVertexCount > 0 &&
    !saving;

  const handleBack = useCallback(() => {
    const proceed = () => router.replace("/systems" as never);
    if (dirtyRef.current) {
      Alert.alert(
        "Discard changes?",
        "Your edits to this system will be lost.",
        [
          { text: "Keep editing", style: "cancel" },
          { text: "Discard", style: "destructive", onPress: proceed },
        ],
      );
    } else {
      proceed();
    }
  }, [router]);

  const submit = async () => {
    if (!isAuthenticated) {
      Alert.alert("Sign in required", "Log in to create a new system.");
      return;
    }
    if (!decodedShape) {
      setError("No boundary. Tap Back, draw the region, and try again.");
      return;
    }
    const boundary = shapeToGeoJSON(decodedShape);
    if (!boundary) {
      setError("The shape didn't have any closed rings. Tap Back, draw the region, and try again.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const client = createMagnumClient(API_URL, {
        getAuthToken: () => token ?? undefined,
      });
      const finalSlug = slug
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-");
      const payload = {
        name: name.trim(),
        slug: finalSlug,
        description: description.trim() || undefined,
        external_url: externalUrl.trim() || undefined,
        ownership_source: source,
        source_date: sourceDate,
        boundary,
      };
      await client.raw.request<Record<string, unknown>>(
        "POST",
        "/api/systems",
        { body: payload },
      );
      router.replace(`/system/${finalSlug}` as never);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create system");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: "New System" }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        testID="new-system-screen"
      >
        <View style={styles.section}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={(v) => {
              setName(v);
              if (!slug) {
                setSlug(
                  v
                    .toLowerCase()
                    .replace(/[^a-z0-9-]+/g, "-")
                    .replace(/^-+|-+$/g, ""),
                );
              }
              markDirty();
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
            onChangeText={(v) => {
              setSlug(v);
              markDirty();
            }}
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
            onChangeText={(v) => {
              setDescription(v);
              markDirty();
            }}
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
            onChangeText={(v) => {
              setExternalUrl(v);
              markDirty();
            }}
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
                onPress={() => {
                  setSource(s);
                  markDirty();
                }}
                style={[styles.chip, source === s ? styles.chipActive : null]}
                testID={`new-system-source-${s}`}
              >
                <Text
                  style={[
                    styles.chipText,
                    source === s ? styles.chipTextActive : null,
                  ]}
                >
                  {s}
                </Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            style={[styles.input, { marginTop: 8 }]}
            value={sourceDate}
            onChangeText={(v) => {
              setSourceDate(v);
              markDirty();
            }}
            placeholder="YYYY-MM-DD"
            testID="new-system-source-date"
          />
        </View>
        <View style={styles.section}>
          <Text style={styles.label}>Boundary</Text>
          {fromBoundary ? (
            <View
              style={styles.boundaryIndicator}
              testID="new-system-boundary-indicator"
            >
              <Ionicons name="map" size={18} color="#22c55e" />
              <Text style={styles.boundaryIndicatorText}>
                {closedRingCount === 1
                  ? `1 region · ${boundaryVertexCount} vertices`
                  : `${closedRingCount} regions · ${boundaryVertexCount} vertices total`}
              </Text>
              <Pressable
                onPress={() =>
                  router.replace(
                    `/system/boundary?mode=create` as never,
                  )
                }
                testID="new-system-boundary-edit"
                style={styles.boundaryEditLink}
                hitSlop={8}
              >
                <Text style={styles.boundaryEditLinkText}>Edit</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={styles.boundaryPicker}
              onPress={() => router.replace("/system/boundary?mode=create" as never)}
              testID="new-system-boundary-pick"
            >
              <Ionicons name="map-outline" size={18} color="#64748b" />
              <Text style={styles.boundaryPickerText}>Draw on map</Text>
            </Pressable>
          )}
        </View>
        {error ? (
          <View style={styles.errorBanner} testID="new-system-error">
            <Ionicons name="alert-circle" size={16} color="#ef4444" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        <View style={styles.footer}>
          <Button
            variant="secondary"
            onPress={handleBack}
            testID="new-system-cancel"
          >
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

/**
 * Decode the base64-url-encoded Shape that the boundary screen
 * appended to the URL. Returns `null` if the param is missing,
 * empty, or fails schema validation.
 */
function decodeShapeParam(raw: string | string[] | undefined): Shape | null {
  if (!raw) return null;
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (!s) return null;
  try {
    // Standard base64-url → base64.
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json =
      typeof atob === "function"
        ? decodeURIComponent(escape(atob(padded)))
        : (() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const g: any = globalThis;
            if (g.Buffer) {
              return g.Buffer.from(s, "base64url").toString("utf-8");
            }
            return "";
          })();
    if (!json) return null;
    const parsed = shapeSchema.safeParse(JSON.parse(json));
    if (!parsed.success) return null;
    return parsed.data as Shape;
  } catch {
    return null;
  }
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
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: "#f1f1f1",
  },
  chipActive: { backgroundColor: "#22c55e" },
  chipText: { fontSize: 12, color: "#444" },
  chipTextActive: { color: "#fff", fontWeight: "600" },
  boundaryPicker: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderStyle: "dashed",
    backgroundColor: "#fafafa",
  },
  boundaryPickerText: { fontSize: 14, color: "#0f172a" },
  boundaryIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#bbf7d0",
    backgroundColor: "#f0fdf4",
  },
  boundaryIndicatorText: { fontSize: 14, color: "#14532d", flex: 1 },
  boundaryEditLink: { paddingHorizontal: 4, paddingVertical: 2 },
  boundaryEditLinkText: { fontSize: 12, color: "#16a34a", fontWeight: "600" },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fef2f2",
    padding: 10,
    borderRadius: 6,
  },
  errorText: { color: "#ef4444", fontSize: 12, flex: 1 },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 8,
  },
});
