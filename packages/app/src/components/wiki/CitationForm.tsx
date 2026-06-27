import { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Citation } from "@magnum/shared";
import { Button } from "../ui/Button";
import { useTheme } from "../../providers/ThemeProvider";
import { radii, spacing } from "../../theme/tokens";

export interface CitationFormProps {
  citations: Citation[];
  onAdd: (citation: { url?: string; title: string }) => void;
  onDelete: (citationId: string) => void;
}

export function CitationForm({ citations, onAdd, onDelete }: CitationFormProps) {
  const { colors } = useTheme();
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
        <Text style={[styles.empty, { color: colors.textMuted }]} testID="citations-empty">
          No citations yet.
        </Text>
      ) : (
        citations.map((c) => (
          <View
            key={c.id}
            style={[styles.citationRow, { borderBottomColor: colors.divider }]}
            testID={`citation-${c.id}`}
          >
            <View style={styles.citationInfo}>
              <Text style={styles.citationTitle}>{c.title}</Text>
              {c.url ? (
                <Pressable onPress={() => Linking.openURL(c.url!)}>
                  <Text style={[styles.citationUrl, { color: colors.primary }]}>{c.url}</Text>
                </Pressable>
              ) : null}
            </View>
            <Button
              variant="ghost"
              size="small"
              onPress={() => onDelete(c.id)}
              testID={`citation-delete-${c.id}`}
            >
              <Ionicons name="trash-outline" size={14} color={colors.danger} />
            </Button>
          </View>
        ))
      )}

      <View style={[styles.addForm, { borderTopColor: colors.divider }]}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>Add Citation</Text>
        <TextInput
          style={[
            styles.input,
            {
              borderColor: colors.border,
              color: colors.text,
              backgroundColor: colors.surfaceMuted,
            },
          ]}
          value={title}
          onChangeText={setTitle}
          placeholder="Title (required)"
          testID="citation-input-title"
        />
        <TextInput
          style={[
            styles.input,
            {
              borderColor: colors.border,
              color: colors.text,
              backgroundColor: colors.surfaceMuted,
            },
          ]}
          value={url}
          onChangeText={setUrl}
          placeholder="URL (optional)"
          keyboardType="url"
          autoCapitalize="none"
          testID="citation-input-url"
        />
        {error ? (
          <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
        ) : null}
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
  empty: { fontSize: 13, fontStyle: "italic" },
  citationRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  citationInfo: { flex: 1, gap: spacing.xxs },
  citationTitle: { fontSize: 13, fontWeight: "500" },
  citationUrl: { fontSize: 11, textDecorationLine: "underline" },
  addForm: {
    borderTopWidth: 1,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  label: { fontSize: 13, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderRadius: radii.sm,
    padding: spacing.sm,
    fontSize: 13,
  },
  error: { fontSize: 12 },
});
