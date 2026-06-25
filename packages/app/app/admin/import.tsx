import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { createMagnumClient } from "@magnum/shared/api/endpoints";
import { useAuthStore } from "../../src/stores/authStore";
import { Card } from "../../src/components/ui/Card";
import { Button } from "../../src/components/ui/Button";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

/**
 * §21.6 phase 2 — Premium import.
 *
 * Moderator-only. Uploads a GeoJSON LineString/MultiLineString and
 * creates a `premium` trail, bypassing future synthesis passes. The
 * geometry is stored verbatim.
 */
export default function AdminImportScreen() {
  const token = useAuthStore((s) => s.token);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [systemId, setSystemId] = useState("");
  const [difficulty, setDifficulty] = useState<"easy" | "moderate" | "hard" | "expert">(
    "moderate",
  );
  const [externalUrl, setExternalUrl] = useState("");
  const [geojson, setGeojson] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ id: string; name: string; tier: string; slug: string } | null>(
    null,
  );

  async function onSubmit() {
    if (!name.trim() || !slug.trim() || !systemId.trim() || !geojson.trim()) {
      Alert.alert("Missing fields", "name, slug, system_id, and geometry are required");
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(geojson);
    } catch (err) {
      Alert.alert("Invalid GeoJSON", (err as Error).message);
      return;
    }
    const geomType = (parsed as { geometry?: { type?: string } } | null)?.geometry?.type
      ?? (parsed as { type?: string } | null)?.type;
    if (geomType !== "LineString" && geomType !== "MultiLineString") {
      Alert.alert("Invalid geometry", "expected LineString or MultiLineString");
      return;
    }
    setBusy(true);
    try {
      const client = createMagnumClient(API_URL, {
        getAuthToken: () => token ?? undefined,
      });
      const trail = await client.importPremiumTrail({
        name: name.trim(),
        slug: slug.trim(),
        system_id: systemId.trim(),
        difficulty,
        external_url: externalUrl.trim() || undefined,
        geometry: parsed,
      });
      setResult(trail);
      setName("");
      setSlug("");
      setGeojson("");
    } catch (err) {
      Alert.alert("Import failed", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Card>
        <Text style={styles.h1}>Premium trail import</Text>
        <Text style={styles.muted}>
          Upload a GeoJSON LineString or MultiLineString. The trail will be marked
          `tier=premium` and skipped by the synthesis loop.
        </Text>

        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Bear Creek"
          testID="import-name"
        />

        <Text style={styles.label}>Slug</Text>
        <TextInput
          style={styles.input}
          value={slug}
          onChangeText={setSlug}
          placeholder="bear-creek"
          autoCapitalize="none"
          testID="import-slug"
        />

        <Text style={styles.label}>System id</Text>
        <TextInput
          style={styles.input}
          value={systemId}
          onChangeText={setSystemId}
          placeholder="00000000-…"
          autoCapitalize="none"
          testID="import-system"
        />

        <Text style={styles.label}>Difficulty</Text>
        <View style={styles.row}>
          {(["easy", "moderate", "hard", "expert"] as const).map((d) => (
            <Button
              key={d}
              size="small"
              variant={difficulty === d ? "primary" : "secondary"}
              onPress={() => setDifficulty(d)}
              testID={`import-difficulty-${d}`}
            >
              {d}
            </Button>
          ))}
        </View>

        <Text style={styles.label}>External URL (optional)</Text>
        <TextInput
          style={styles.input}
          value={externalUrl}
          onChangeText={setExternalUrl}
          placeholder="https://example.com/trail"
          autoCapitalize="none"
          testID="import-url"
        />

        <Text style={styles.label}>Geometry (GeoJSON)</Text>
        <TextInput
          style={[styles.input, styles.geojson]}
          value={geojson}
          onChangeText={setGeojson}
          placeholder='{"type":"LineString","coordinates":[[-120,50],…]}'
          multiline
          testID="import-geojson"
        />

        <View style={styles.actions}>
          <Button onPress={onSubmit} disabled={busy} testID="import-submit">
            {busy ? "Importing…" : "Import"}
          </Button>
        </View>

        {result ? (
          <View style={styles.success} testID="import-success">
            <Text style={styles.successText}>
              ✓ Created "{result.name}" ({result.tier}, {result.slug})
            </Text>
            <Text style={styles.muted}>id: {result.id}</Text>
          </View>
        ) : null}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 16 },
  h1: { fontSize: 18, fontWeight: "700", marginBottom: 4 },
  muted: { color: "#6b7280", marginBottom: 12 },
  label: { fontWeight: "600", color: "#374151", marginTop: 12, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
  },
  geojson: { minHeight: 140, textAlignVertical: "top", fontFamily: "monospace" },
  row: { flexDirection: "row", gap: 8 },
  actions: { marginTop: 16, alignItems: "flex-end" },
  success: { marginTop: 16, padding: 12, backgroundColor: "#d1fae5", borderRadius: 8 },
  successText: { color: "#065f46", fontWeight: "600" },
});
