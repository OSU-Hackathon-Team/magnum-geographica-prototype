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
import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Section";
import { useAuthStore } from "@/stores/authStore";
import { useMapStore } from "@/stores/mapStore";
import { useTheme } from "@/providers/ThemeProvider";
import { radii, spacing, text as textTokens } from "@/theme/tokens";

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
  const { colors } = useTheme();
  const token = useAuthStore((s) => s.token);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const params = useLocalSearchParams<{
    fromBoundary?: string;
    shape?: string;
  }>();
  const fromBoundary = params.fromBoundary === "1";
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
      useMapStore.getState().incrementSystemTileVersion();
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
        style={[styles.container, { backgroundColor: colors.bg }]}
        contentContainerStyle={styles.content}
        testID="new-system-screen"
      >
        <Section title="Name">
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.surfaceMuted,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
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
            placeholderTextColor={colors.textMuted}
            testID="new-system-name"
          />
        </Section>
        <Section title="Slug">
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.surfaceMuted,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
            value={slug}
            onChangeText={(v) => {
              setSlug(v);
              markDirty();
            }}
            placeholder="mountains-park"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            testID="new-system-slug"
          />
        </Section>
        <Section title="Description">
          <TextInput
            style={[
              styles.input,
              styles.textArea,
              {
                backgroundColor: colors.surfaceMuted,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
            value={description}
            onChangeText={(v) => {
              setDescription(v);
              markDirty();
            }}
            placeholder="What this area is known for…"
            placeholderTextColor={colors.textMuted}
            multiline
            testID="new-system-description"
          />
        </Section>
        <Section title="Official page">
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.surfaceMuted,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
            value={externalUrl}
            onChangeText={(v) => {
              setExternalUrl(v);
              markDirty();
            }}
            placeholder="https://example.com/park"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            testID="new-system-url"
          />
        </Section>
        <Section title="Provenance">
          <View style={styles.chipsRow}>
            {PROVENANCE_SOURCES.map((s) => (
              <Pressable
                key={s}
                onPress={() => {
                  setSource(s);
                  markDirty();
                }}
                style={({ pressed }) => [
                  styles.chip,
                  {
                    backgroundColor:
                      source === s ? colors.primary : colors.surfaceMuted,
                    borderColor: source === s ? colors.primary : colors.border,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
                testID={`new-system-source-${s}`}
              >
                <Text
                  style={[
                    textTokens.buttonSmall,
                    {
                      color: source === s ? colors.textInverse : colors.textSecondary,
                    },
                  ]}
                >
                  {s}
                </Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            style={[
              styles.input,
              { marginTop: spacing.sm, backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.text },
            ]}
            value={sourceDate}
            onChangeText={(v) => {
              setSourceDate(v);
              markDirty();
            }}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.textMuted}
            testID="new-system-source-date"
          />
        </Section>
        <Section title="Boundary">
          {fromBoundary ? (
            <View
              style={[
                styles.boundaryIndicator,
                {
                  backgroundColor: colors.surfaceTint,
                  borderColor: colors.success,
                },
              ]}
              testID="new-system-boundary-indicator"
            >
              <Ionicons name="map" size={18} color={colors.success} />
              <Text
                style={[
                  textTokens.body,
                  { color: colors.success, flex: 1, fontWeight: "600" },
                ]}
              >
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
                <Text
                  style={[textTokens.small, { color: colors.success, fontWeight: "700" }]}
                >
                  Edit
                </Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={({ pressed }) => [
                styles.boundaryPicker,
                {
                  borderColor: colors.border,
                  backgroundColor: pressed ? colors.surfaceMutedStrong : colors.surfaceMuted,
                },
              ]}
              onPress={() => router.replace("/system/boundary?mode=create" as never)}
              testID="new-system-boundary-pick"
            >
              <Ionicons name="map-outline" size={18} color={colors.textMuted} />
              <Text style={[textTokens.body, { color: colors.text, flex: 1 }]}>
                Draw on map
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Pressable>
          )}
        </Section>
        {error ? (
          <View
            style={[
              styles.errorBanner,
              { backgroundColor: colors.dangerMuted, borderColor: colors.danger },
            ]}
            testID="new-system-error"
          >
            <Ionicons name="alert-circle" size={16} color={colors.danger} />
            <Text style={[textTokens.meta, { color: colors.danger, flex: 1 }]}>{error}</Text>
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

function decodeShapeParam(raw: string | string[] | undefined): Shape | null {
  if (!raw) return null;
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (!s) return null;
  try {
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
  container: { flex: 1 },
  content: { paddingBottom: spacing.xxxl },
  input: {
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    fontSize: 14,
  },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  boundaryPicker: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  boundaryIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  boundaryEditLink: { paddingHorizontal: spacing.xs, paddingVertical: spacing.xxs },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
});
