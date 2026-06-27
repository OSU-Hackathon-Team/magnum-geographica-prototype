import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { createMagnumClient, type Shape, type ShapeRing, type System } from "@magnum/shared";
import {
  ShapeEditor,
  shapeToBoundary,
  validateShape,
  type ShapeMode,
} from "../../src/components/polygon/ShapeEditor";
import { ShapeEditorBar } from "../../src/components/polygon/ShapeEditorBar";
import { ShapeEditorModeToggle } from "../../src/components/polygon/ShapeEditorModeToggle";
import { useTheme } from "../../src/providers/ThemeProvider";
import { useAuthStore } from "../../src/stores/authStore";
import { useMapStore } from "../../src/stores/mapStore";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
const MARTIN_URL = process.env.EXPO_PUBLIC_MARTIN_URL ?? "http://localhost:3001";

/**
 * §21.5 — full-screen boundary editor.
 *
 * Two modes (via the `mode` route param):
 *   - "create": no existing system. The user draws a shape and
 *     taps save. We encode the shape as a base64 JSON in a route
 *     param and navigate to the existing `/system/new` form with
 *     `?fromBoundary=1&shape=...`. The form pre-fills the
 *     boundary and POSTs once on submit.
 *   - "edit": we have an existing system. The user edits the
 *     shape and taps save. We PUT /api/systems/<id> directly
 *     (one API call) and navigate back to the system detail.
 *
 * The bottom bar is rendered in the screen body (replaces the
 * default header via `headerShown: false`). The floating mode
 * toggle sits on the left edge of the map.
 */
export default function BoundaryScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const token = useAuthStore((s) => s.token);
  const params = useLocalSearchParams<{
    mode?: string;
    slug?: string;
  }>();
  const editorMode = (params.mode === "edit" ? "edit" : "create") as "create" | "edit";
  const slug = typeof params.slug === "string" ? params.slug : null;

  const [shape, setShape] = useState<Shape | null>(null);
  const [initialShape, setInitialShape] = useState<Shape | null>(null);
  const [boundaryGeoJSON, setBoundaryGeoJSON] = useState<unknown>(null);
  const [loading, setLoading] = useState(editorMode === "edit");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<ShapeMode>("normal");
  // Track dirty state so the back button can warn before discarding.
  const dirtyRef = useRef(false);
  const shapeRef = useRef<Shape | null>(null);
  shapeRef.current = shape;

  useEffect(() => {
    if (editorMode !== "edit" || !slug) return;
    const client = createMagnumClient(API_URL);
    client
      .getSystemBySlug(slug)
      .then((s) => {
        const sh = systemToShape(s);
        setShape(sh);
        setInitialShape(sh);
        setBoundaryGeoJSON(s.boundary);
        setLoading(false);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Failed to load system.");
        setLoading(false);
      });
  }, [editorMode, slug]);

  const handleShapeChange = useCallback(
    (next: Shape) => {
      setShape(next);
      if (initialShape) {
        dirtyRef.current = JSON.stringify(next) !== JSON.stringify(initialShape);
      } else {
        dirtyRef.current = next.rings.some((r) => r.vertices.length > 0);
      }
    },
    [initialShape],
  );

  const validation = validateShape(shape);

  // Compute a hint for the bottom bar. We show "Tap the first
  // vertex to close" once the user has drawn 3+ vertices but
  // hasn't closed the ring yet.
  const lastOpenRing = shape?.rings.find((r) => !r.closed);
  const openRingVertexCount = lastOpenRing?.vertices.length ?? 0;
  const hasOpenRingWithVertices = !!lastOpenRing && openRingVertexCount > 0;
  const hasOpenRingReadyToClose = !!lastOpenRing && openRingVertexCount >= 3;
  const hasNoRings = shape && shape.rings.length === 0;
  const anyVertices = shape?.rings.some((r) => r.vertices.length > 0) ?? false;
  const bottomHint: string | null = hasNoRings
    ? "Tap the map to add a vertex"
    : hasOpenRingReadyToClose
      ? "Tap the first vertex to close the ring"
      : hasOpenRingWithVertices
        ? `${3 - openRingVertexCount} more to close`
        : anyVertices
          ? "Long-press a vertex to drag"
          : null;

  const handleBack = useCallback(() => {
    const proceed = () => {
      if (editorMode === "edit" && slug) {
        router.replace(`/system/${slug}` as never);
      } else {
        router.replace("/systems" as never);
      }
    };
    if (dirtyRef.current) {
      Alert.alert(
        "Discard changes?",
        "Your edits to this boundary will be lost.",
        [
          { text: "Keep editing", style: "cancel" },
          { text: "Discard", style: "destructive", onPress: proceed },
        ],
      );
    } else {
      proceed();
    }
  }, [editorMode, slug, router]);

  const handleSave = useCallback(async () => {
    const s = shapeRef.current;
    const v = validateShape(s);
    if (!v.ok || !s) return;
    const boundary = shapeToBoundary(s);
    if (!boundary) {
      setError("Could not convert the shape to a boundary.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (editorMode === "create") {
        const encoded = encodeShape(s);
        router.replace(
          `/system/new?fromBoundary=1&shape=${encoded}` as never,
        );
        return;
      }
      if (!slug) {
        setError("Missing system slug.");
        return;
      }
      const client = createMagnumClient(API_URL, {
        getAuthToken: () => token ?? undefined,
      });
      const s2 = await client.getSystemBySlug(slug);
      await client.updateSystem(s2.id, { boundary });
      useMapStore.getState().incrementSystemTileVersion();
      dirtyRef.current = false;
      router.replace(`/system/${slug}` as never);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSubmitting(false);
    }
  }, [editorMode, slug, router, token]);

  if (loading) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.bg }]} testID="boundary-screen">
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.centered}>
          <Text style={[styles.loading, { color: colors.textMuted }]}>Loading…</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]} testID="boundary-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.mapWrap}>
        <ShapeEditor
          initial={initialShape}
          mode={mode}
          mapConfig={{ martinTilesUrl: MARTIN_URL }}
          onChange={handleShapeChange}
          fitGeometry={boundaryGeoJSON}
        />
        <ShapeEditorModeToggle
          mode={mode}
          onChange={setMode}
          testID="boundary-mode-toggle"
        />
      </View>
      <ShapeEditorBar
        onBack={handleBack}
        title="Draw the system's region"
        onSave={handleSave}
        saveDisabled={!validation.ok || submitting}
        saveError={
          error ?? (validation.ok ? null : validation.error ?? null)
        }
        hint={bottomHint}
        testID="boundary-bar"
      />
    </View>
  );
}

/**
 * Convert the server's `System` response into the editor's Shape.
 * Each polygon outer ring becomes a separate closed ring. Holes are
 * skipped (out of scope for v1).
 */
function systemToShape(s: System): Shape {
  const boundary = s.boundary as
    | { type?: string; coordinates?: unknown }
    | null
    | undefined;
  if (
    !boundary ||
    typeof boundary !== "object" ||
    !Array.isArray(boundary.coordinates)
  ) {
    return { rings: [{ vertices: [], closed: false }] };
  }
  const coords = boundary.coordinates as unknown[];
  const rings: ShapeRing[] = [];

  if (boundary.type === "Polygon") {
    const outer = coords[0] as unknown[] | undefined;
    if (Array.isArray(outer)) {
      const ring = normalizeRing(outer as Array<[number, number]>);
      if (ring.length >= 3) rings.push({ vertices: ring, closed: true });
    }
  } else if (boundary.type === "MultiPolygon") {
    for (const poly of coords) {
      const outer = (poly as unknown[])?.[0] as unknown[] | undefined;
      if (Array.isArray(outer)) {
        const ring = normalizeRing(outer as Array<[number, number]>);
        if (ring.length >= 3) rings.push({ vertices: ring, closed: true });
      }
    }
  }

  return {
    rings: rings.length > 0 ? rings : [{ vertices: [], closed: false }],
  };
}

function normalizeRing(ring: Array<[number, number]>): Array<[number, number]> {
  if (ring.length < 2) return ring;
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  if (first[0] === last[0] && first[1] === last[1]) {
    return ring.slice(0, -1);
  }
  return ring;
}

/**
 * Encode a Shape into a URL-safe base64 string. Expo-router URL
 * params are length-limited and Unicode-sensitive, so base64 is
 * the simplest safe transport.
 */
function encodeShape(shape: Shape): string {
  const json = JSON.stringify(shape);
  if (typeof btoa === "function") {
    return btoa(unescape(encodeURIComponent(json)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g: any = globalThis;
  if (g.Buffer) return g.Buffer.from(json, "utf-8").toString("base64url");
  return json;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  mapWrap: { flex: 1, position: "relative" },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loading: { fontSize: 14 },
});
