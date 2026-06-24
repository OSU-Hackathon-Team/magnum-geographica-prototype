import { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Citation } from "@magnum/shared";
import { Button } from "../ui/Button";

export interface CitationFormProps {
  citations: Citation[];
  onAdd: (citation: { url?: string; title: string }) => void;
  onDelete: (citationId: string) => void;
}

export function CitationForm({ citations, onAdd, onDelete }: CitationFormProps) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    onAdd({ url: url.trim() || undefined, title: title.trim() });
    setUrl("");
    setTitle("");
    setError(null);
  }

  return (
    <View style={styles.container} testID="citation-form">
      <Text style={styles.heading}>Citations</Text>

      {citations.length === 0 ? (
        <Text style={styles.empty} testID="citations-empty">
          No citations yet.
        </Text>
      ) : (
        citations.map((c) => (
          <View key={c.id} style={styles.citationRow} testID={`citation-${c.id}`}>
            <View style={styles.citationInfo}>
              <Text style={styles.citationTitle}>{c.title}</Text>
              {c.url ? (
                <Pressable onPress={() => Linking.openURL(c.url!)}>
                  <Text style={styles.citationUrl}>{c.url}</Text>
                </Pressable>
              ) : null}
            </View>
            <Button
              variant="ghost"
              size="small"
              onPress={() => onDelete(c.id)}
              testID={`citation-delete-${c.id}`}
            >
              <Ionicons name="trash-outline" size={14} color="#ef4444" />
            </Button>
          </View>
        ))
      )}

      <View style={styles.addForm}>
        <Text style={styles.label}>Add Citation</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Title (required)"
          testID="citation-input-title"
        />
        <TextInput
          style={styles.input}
          value={url}
          onChangeText={setUrl}
          placeholder="URL (optional)"
          keyboardType="url"
          autoCapitalize="none"
          testID="citation-input-url"
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          variant="secondary"
          size="small"
          onPress={handleAdd}
          disabled={!title.trim()}
          testID="citation-add-button"
        >
          Add Citation
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  heading: { fontSize: 16, fontWeight: "600" },
  empty: { fontSize: 13, color: "#aaa", fontStyle: "italic" },
  citationRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  citationInfo: { flex: 1, gap: 2 },
  citationTitle: { fontSize: 13, fontWeight: "500" },
  citationUrl: { fontSize: 11, color: "#22c55e", textDecorationLine: "underline" },
  addForm: {
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
    paddingTop: 12,
    gap: 8,
  },
  label: { fontSize: 13, fontWeight: "600", color: "#444" },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 6,
    padding: 8,
    fontSize: 13,
    color: "#222",
    backgroundColor: "#fafafa",
  },
  error: { color: "#ef4444", fontSize: 12 },
});
