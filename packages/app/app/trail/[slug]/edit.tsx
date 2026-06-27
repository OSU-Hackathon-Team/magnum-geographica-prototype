import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { createMagnumClient, type Trail } from "@magnum/shared";
import { useTheme } from "../../../src/providers/ThemeProvider";
import { useAuthStore } from "../../../src/stores/authStore";
import { Button } from "../../../src/components/ui/Button";
import { Card } from "../../../src/components/ui/Card";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

const DIFFICULTIES = ["easy", "moderate", "hard", "expert"] as const;

export default function TrailEditScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const token = useAuthStore((s) => s.token);
  const [trail, setTrail] = useState<Trail | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [difficulty, setDifficulty] = useState<"easy" | "moderate" | "hard" | "expert" | "">("");
  const [source, setSource] = useState("");
  const [sourceDate, setSourceDate] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!slug || typeof slug !== "string") return;
    const client = createMagnumClient(API_URL);
    client.getTrailBySlug(slug).then((t) => {
      setTrail(t);
      setName(t.name ?? "");
      setDescription(t.description ?? "");
      setDifficulty((t.difficulty as Trail["difficulty"]) ?? "");
      setSource(t.source ?? "");
      setSourceDate(t.source_date ?? "");
      setExternalUrl(t.external_url ?? "");
    }).catch(() => Alert.alert("Error", "Failed to load trail"));
  }, [slug]);

  const canSave = name.trim().length > 0;

  async function onSave() {
    if (!trail || !canSave) return;
    setBusy(true);
    try {
      const client = createMagnumClient(API_URL, {
        getAuthToken: () => token ?? undefined,
      });
      await client.updateTrail(trail.id, {
        name: name.trim(),
        description: description.trim() || null as unknown as undefined,
        difficulty: difficulty || (null as unknown as undefined),
        source: source.trim() || (null as unknown as undefined),
        source_date: sourceDate.trim() || (null as unknown as undefined),
        external_url: externalUrl.trim() || (null as unknown as undefined),
      } as Parameters<typeof client.updateTrail>[1]);
      router.back();
    } catch (err) {
      Alert.alert("Save failed", err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: "Edit Trail", headerShown: true }} />
      <ScrollView style={[styles.root, { backgroundColor: colors.bg }]} contentContainerStyle={styles.content}>
        <Card>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Name</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.borderStrong, color: colors.text, backgroundColor: colors.surfaceMuted }]}
            value={name}
            onChangeText={setName}
            placeholder="Trail name"
            testID="edit-trail-name"
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>Difficulty</Text>
          <View style={styles.chipRow}>
            {DIFFICULTIES.map((d) => (
              <Button
                key={d}
                size="small"
                variant={difficulty === d ? "primary" : "secondary"}
                onPress={() => setDifficulty(d)}
                testID={`edit-trail-difficulty-${d}`}
              >
                {d}
              </Button>
            ))}
          </View>

          <Text style={[styles.label, { color: colors.textSecondary }]}>Description</Text>
          <TextInput
            style={[styles.input, styles.multiline, { borderColor: colors.borderStrong, color: colors.text, backgroundColor: colors.surfaceMuted }]}
            value={description}
            onChangeText={setDescription}
            placeholder="Describe the trail…"
            multiline
            testID="edit-trail-description"
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>Source (provenance)</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.borderStrong, color: colors.text, backgroundColor: colors.surfaceMuted }]}
            value={source}
            onChangeText={setSource}
            placeholder="osm, agency, usfs, …"
            testID="edit-trail-source"
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>Source date</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.borderStrong, color: colors.text, backgroundColor: colors.surfaceMuted }]}
            value={sourceDate}
            onChangeText={setSourceDate}
            placeholder="YYYY-MM-DD"
            testID="edit-trail-source-date"
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>External URL</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.borderStrong, color: colors.text, backgroundColor: colors.surfaceMuted }]}
            value={externalUrl}
            onChangeText={setExternalUrl}
            placeholder="https://example.com/trail"
            autoCapitalize="none"
            testID="edit-trail-url"
          />

          <View style={styles.actions}>
            <Button onPress={onSave} disabled={busy || !canSave} testID="edit-trail-save">
              {busy ? "Saving…" : "Save"}
            </Button>
          </View>
        </Card>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16 },
  label: { fontWeight: "600", marginTop: 12, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
  },
  multiline: { minHeight: 80, textAlignVertical: "top" },
  chipRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  actions: { marginTop: 16, alignItems: "flex-end" },
});
