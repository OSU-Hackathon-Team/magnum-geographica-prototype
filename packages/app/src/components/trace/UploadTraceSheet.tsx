import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { createMagnumClient } from "@magnum/shared";
import { Button } from "../ui/Button";
import { useAuthStore } from "../../stores/authStore";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export interface UploadTraceSheetProps {
  visible: boolean;
  onClose: () => void;
  onImported?: (traceId: string) => void;
  testID?: string;
}

type Mode = "menu" | "import" | "manual-paste";
type ImportFormat = "gpx" | "geojson";

/**
 * §21.3.2 — Upload Trace bottom sheet.
 *
 * Two entry paths per the spec:
 *   1. Import: file picker (GPX / GeoJSON). On RN Web the picker is
 *      `<input type="file">`; on native we'd swap in
 *      `expo-document-picker`. The platform-agnostic surface here
 *      accepts raw text in a textarea — same content, simpler tests.
 *   2. Record: navigates to the Record Trace screen (a full-screen
 *      route, mounted separately).
 */
export function UploadTraceSheet({ visible, onClose, onImported, testID }: UploadTraceSheetProps) {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [mode, setMode] = useState<Mode>("menu");
  const [importFormat, setImportFormat] = useState<ImportFormat>("gpx");
  const [textPayload, setTextPayload] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setMode("menu");
    setTextPayload("");
    setError(null);
  }, []);

  const enterImport = useCallback(
    (format: ImportFormat, payload: string) => {
      setImportFormat(format);
      setTextPayload(payload);
      setMode("import");
    },
    [],
  );

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const handlePickFile = useCallback(
    async (format: "gpx" | "geojson") => {
      // On the web, open a file picker via a hidden input. On native,
      // we'd use expo-document-picker; for the v1 spec we keep the
      // upload path open and the manual paste input below as a fallback.
      if (typeof document === "undefined") {
        enterImport(format, "");
        return;
      }
      const input = document.createElement("input");
      input.type = "file";
      input.accept = format === "gpx" ? ".gpx,application/gpx+xml" : ".json,application/geojson";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        const text = await file.text();
        if (format === "gpx") {
          enterImport("gpx", text);
        } else {
          try {
            enterImport("geojson", JSON.stringify(JSON.parse(text)));
          } catch {
            setError("Could not parse GeoJSON file");
            enterImport("geojson", "");
          }
        }
      };
      input.click();
    },
    [enterImport],
  );

  const handleImport = useCallback(async () => {
    if (!isAuthenticated) {
      setError("Sign in to upload traces.");
      return;
    }
    if (!textPayload.trim()) {
      setError("No trace data to upload.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const client = createMagnumClient(API_URL, {
        getAuthToken: () => token ?? undefined,
      });
      const format: "gpx" | "geojson" = importFormat;
      const payload: string | Record<string, unknown> =
        format === "gpx"
          ? textPayload
          : (JSON.parse(textPayload) as Record<string, unknown>);
      const res = await client.importTrace({
        format,
        payload,
        contributor_name: useAuthStore.getState().user?.username ?? "anonymous",
      });
      onImported?.(res.trace.id as string);
      handleClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to import trace");
    } finally {
      setSubmitting(false);
    }
  }, [handleClose, isAuthenticated, mode, onImported, textPayload, token]);

  if (!visible) return null;

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {mode === "menu"
            ? "Upload Trace"
            : mode === "manual-paste"
              ? "Paste trace"
              : `Import ${importFormat.toUpperCase()}`}
        </Text>
        <Pressable onPress={handleClose} testID="upload-trace-close" hitSlop={12}>
          <Ionicons name="close" size={24} color="#666" />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        {mode === "menu" ? (
          <View style={{ gap: 12 }}>
            <ActionCard
              icon="document-text-outline"
              title="Import a file"
              subtitle="GPX or GeoJSON LineString"
              onPress={() => handlePickFile("gpx")}
              testID="upload-trace-import"
            />
            <ActionCard
              icon="create-outline"
              title="Paste GPX / GeoJSON"
              subtitle="Useful for web previews and copy/paste"
              onPress={() => setMode("manual-paste")}
              testID="upload-trace-paste"
            />
            <ActionCard
              icon="navigate-outline"
              title="Record a trace"
              subtitle="Live GPS — distance, duration, current track"
              onPress={() => {
                handleClose();
                router.push("/trace/record" as never);
              }}
              testID="upload-trace-record"
            />
          </View>
        ) : mode === "manual-paste" ? (
          <View style={{ gap: 10 }}>
            <Text style={styles.hint}>
              Paste a GPX file's contents (the &lt;trkpt&gt; entries are extracted) or a
              GeoJSON LineString. Pick the format, paste, then Import.
            </Text>
            <View style={styles.toggleRow}>
              <Pressable
                style={[styles.toggleBtn, importFormat === "gpx" ? styles.toggleBtnActive : null]}
                onPress={() => setImportFormat("gpx")}
                testID="upload-trace-mode-gpx"
              >
                <Text style={[styles.toggleText, importFormat === "gpx" ? styles.toggleTextActive : null]}>
                  GPX
                </Text>
              </Pressable>
              <Pressable
                style={[styles.toggleBtn, importFormat === "geojson" ? styles.toggleBtnActive : null]}
                onPress={() => setImportFormat("geojson")}
                testID="upload-trace-mode-geojson"
              >
                <Text style={[styles.toggleText, importFormat === "geojson" ? styles.toggleTextActive : null]}>
                  GeoJSON
                </Text>
              </Pressable>
            </View>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={textPayload}
              onChangeText={setTextPayload}
              placeholder={
                importFormat === "gpx"
                  ? "<gpx>…<trkpt lat=… lon=…/>…</gpx>"
                  : '{"type":"LineString","coordinates":[[lon,lat],…]}'
              }
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              testID="upload-trace-text"
            />
            {error ? (
              <Text style={styles.error} testID="upload-trace-error">
                {error}
              </Text>
            ) : null}
            <View style={styles.footer}>
              <Button variant="secondary" onPress={() => setMode("menu")} testID="upload-trace-back">
                Back
              </Button>
              <Button
                variant="primary"
                onPress={() => {
                  setMode("import");
                  void handleImport();
                }}
                disabled={submitting}
                testID="upload-trace-submit"
              >
                {submitting ? "Importing…" : "Import Trace"}
              </Button>
            </View>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {error ? (
              <Text style={styles.error} testID="upload-trace-error">
                {error}
              </Text>
            ) : null}
            <Text style={styles.hint}>
              Loaded {textPayload.length} chars ({importFormat.toUpperCase()}). Tap Import to upload.
            </Text>
            <TextInput
              style={[styles.input, styles.textArea, { minHeight: 160 }]}
              value={textPayload}
              onChangeText={setTextPayload}
              placeholder="Paste your trace data here…"
              multiline
              autoCapitalize="none"
              testID="upload-trace-text"
            />
            <View style={styles.footer}>
              <Button variant="secondary" onPress={() => setMode("menu")} testID="upload-trace-back">
                Back
              </Button>
              {submitting ? (
                <ActivityIndicator size="small" color="#22c55e" />
              ) : (
                <Button variant="primary" onPress={handleImport} testID="upload-trace-submit">
                  Import Trace
                </Button>
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function ActionCard({
  icon,
  title,
  subtitle,
  onPress,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable style={styles.card} onPress={onPress} testID={testID}>
      <Ionicons name={icon} size={28} color="#22c55e" />
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardSub}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#888" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "85%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  headerTitle: { fontSize: 16, fontWeight: "700" },
  body: { padding: 16, paddingBottom: 32 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    backgroundColor: "#f9fafb",
    borderRadius: 8,
  },
  cardTitle: { fontSize: 14, fontWeight: "600", color: "#111" },
  cardSub: { fontSize: 12, color: "#666", marginTop: 2 },
  toggleRow: { flexDirection: "row", gap: 6 },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    backgroundColor: "#f1f1f1",
    borderRadius: 6,
  },
  toggleBtnActive: { backgroundColor: "#22c55e" },
  toggleText: { fontSize: 13, fontWeight: "600", color: "#444" },
  toggleTextActive: { color: "#fff" },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 6,
    padding: 10,
    fontSize: 13,
    color: "#222",
    backgroundColor: "#fafafa",
  },
  textArea: { minHeight: 100, textAlignVertical: "top", fontFamily: "monospace" },
  hint: { color: "#888", fontSize: 12 },
  error: { color: "#ef4444", fontSize: 12 },
  footer: { flexDirection: "row", justifyContent: "space-between", gap: 8, marginTop: 8 },
});
