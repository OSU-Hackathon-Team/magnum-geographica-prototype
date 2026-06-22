import { useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { FEATURE_TYPES, type FeatureType } from "@magnum/shared";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { FeatureTypeIcon } from "./FeatureTypeIcon";

export interface FeatureFormData {
  name: string;
  type_tag: string;
  description: string;
  lon: number;
  lat: number;
}

export interface FeatureFormProps {
  initialName?: string;
  initialTypeTag?: string;
  initialDescription?: string;
  initialLon: number;
  initialLat: number;
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
  onSave,
  saving,
  submitLabel = "Save Feature",
  testID,
}: FeatureFormProps) {
  const [name, setName] = useState(initialName);
  const [typeTag, setTypeTag] = useState(initialTypeTag);
  const [description, setDescription] = useState(initialDescription);

  const canSave = name.trim().length > 0 && !saving;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      name: name.trim(),
      type_tag: typeTag,
      description: description.trim(),
      lon: initialLon,
      lat: initialLat,
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
});
