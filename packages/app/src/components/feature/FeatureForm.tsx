import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { FEATURE_TYPES, createMagnumClient, type System, type Trail } from "@magnum/shared";
import { Button } from "../ui/Button";
import { FeatureTypeIcon } from "./FeatureTypeIcon";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export interface FeatureFormData {
  name: string;
  type_tag: string;
  description: string;
  lon: number;
  lat: number;
  system_id: string | null;
  trail_id: string | null;
}

export interface FeatureFormProps {
  initialName?: string;
  initialTypeTag?: string;
  initialDescription?: string;
  initialLon: number;
  initialLat: number;
  initialSystemId?: string | null;
  initialTrailId?: string | null;
  onSave: (data: FeatureFormData) => void;
  saving?: boolean;
  submitLabel?: string;
  testID?: string;
}

export function FeatureForm({
  initialName = "",
  initialTypeTag = "other",
  initialDescription = "",
  initialLon,
  initialLat,
  initialSystemId = null,
  initialTrailId = null,
  onSave,
  saving,
  submitLabel = "Save Feature",
  testID,
}: FeatureFormProps) {
  const [name, setName] = useState(initialName);
  const [typeTag, setTypeTag] = useState(initialTypeTag);
  const [description, setDescription] = useState(initialDescription);
  const [systemId, setSystemId] = useState<string | null>(initialSystemId);
  const [trailId, setTrailId] = useState<string | null>(initialTrailId);
  const [systems, setSystems] = useState<System[]>([]);
  const [trails, setTrails] = useState<Trail[]>([]);
  const [loadingSystems, setLoadingSystems] = useState(false);
  const [loadingTrails, setLoadingTrails] = useState(false);

  const canSave = name.trim().length > 0 && !saving && (systemId !== null || trailId !== null);

  useEffect(() => {
    setLoadingSystems(true);
    const client = createMagnumClient(API_URL);
    client.raw
      .request<{ items: System[] }>("GET", "/api/systems?limit=50")
      .then((res) => setSystems(res.items))
      .catch(() => setSystems([]))
      .finally(() => setLoadingSystems(false));
  }, []);

  useEffect(() => {
    if (!systemId) {
      setTrails([]);
      return;
    }
    setLoadingTrails(true);
    const client = createMagnumClient(API_URL);
    client.raw
      .request<{ items: Trail[] }>("GET", `/api/systems/${systemId}/trails?limit=50`)
      .then((res) => setTrails(res.items))
      .catch(() => setTrails([]))
      .finally(() => setLoadingTrails(false));
  }, [systemId]);

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      name: name.trim(),
      type_tag: typeTag,
      description: description.trim(),
      lon: initialLon,
      lat: initialLat,
      system_id: systemId,
      trail_id: trailId,
    });
  };

  return (
    <ScrollView style={styles.container} testID={testID}>
      <View style={styles.section}>
        <Text style={styles.label}>Feature Type</Text>
        <View style={styles.typeGrid}>
          {FEATURE_TYPES.map((t) => (
            <Button
              key={t}
              variant={typeTag === t ? "primary" : "secondary"}
              size="small"
              onPress={() => setTypeTag(t)}
              testID={`feature-type-${t}`}
            >
              <FeatureTypeIcon type={t} size={12} />
              <Text style={[styles.typeLabel, typeTag === t && styles.typeLabelActive]}>
                {t.replace(/_/g, " ")}
              </Text>
            </Button>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Feature name"
          testID="feature-form-name"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Coordinates</Text>
        <Text style={styles.coords}>
          {initialLat.toFixed(5)}, {initialLon.toFixed(5)}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>System (required)</Text>
        {loadingSystems ? (
          <ActivityIndicator size="small" />
        ) : systems.length === 0 ? (
          <Text style={styles.hint}>No systems available</Text>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.hierarchyScroll}
          >
            <View style={styles.hierarchyRow}>
              <Button
                key="none"
                variant={systemId === null ? "primary" : "secondary"}
                size="small"
                onPress={() => {
                  setSystemId(null);
                  setTrailId(null);
                }}
                testID="feature-system-none"
              >
                None
              </Button>
              {systems.map((s) => (
                <Button
                  key={s.id}
                  variant={systemId === s.id ? "primary" : "secondary"}
                  size="small"
                  onPress={() => {
                    setSystemId(s.id);
                    setTrailId(null);
                  }}
                  testID={`feature-system-${s.slug}`}
                >
                  {s.name}
                </Button>
              ))}
            </View>
          </ScrollView>
        )}
      </View>

      {systemId ? (
        <View style={styles.section}>
          <Text style={styles.label}>Trail (optional)</Text>
          {loadingTrails ? (
            <ActivityIndicator size="small" />
          ) : trails.length === 0 ? (
            <Text style={styles.hint}>No trails in this system</Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.hierarchyScroll}
            >
              <View style={styles.hierarchyRow}>
                <Button
                  key="none"
                  variant={trailId === null ? "primary" : "secondary"}
                  size="small"
                  onPress={() => setTrailId(null)}
                  testID="feature-trail-none"
                >
                  None
                </Button>
                {trails.map((t) => (
                  <Button
                    key={t.id}
                    variant={trailId === t.id ? "primary" : "secondary"}
                    size="small"
                    onPress={() => setTrailId(t.id)}
                    testID={`feature-trail-${t.slug}`}
                  >
                    {t.name}
                  </Button>
                ))}
              </View>
            </ScrollView>
          )}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.label}>Description (optional)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          placeholder="Describe this feature..."
          multiline
          textAlignVertical="top"
          testID="feature-form-description"
        />
      </View>

      <View style={styles.section}>
        {!canSave && name.trim().length > 0 && (
          <Text style={styles.hint}>Assign this feature to a System to save.</Text>
        )}
        <Button
          variant="primary"
          onPress={handleSave}
          disabled={!canSave}
          testID="feature-form-save"
        >
          {saving ? "Saving..." : submitLabel}
        </Button>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  section: { padding: 16, gap: 8 },
  label: { fontSize: 13, fontWeight: "600", color: "#444" },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
    color: "#222",
    backgroundColor: "#fafafa",
  },
  textArea: { minHeight: 100 },
  typeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  typeLabel: { fontSize: 11, color: "#666", textTransform: "capitalize" },
  typeLabelActive: { color: "#fff" },
  coords: { fontSize: 13, color: "#666", fontFamily: "monospace" },
  hint: { fontSize: 12, color: "#888", fontStyle: "italic" },
  hierarchyScroll: { maxHeight: 50 },
  hierarchyRow: { flexDirection: "row", gap: 6, alignItems: "center" },
});
