import { useState } from "react";
import { Image, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "../ui/Button";
import { useTheme } from "../../providers/ThemeProvider";
import { radii, spacing } from "../../theme/tokens";

export interface MediaUploaderProps {
  onSelect: (base64: string, mimeType: string) => void;
  uploading?: boolean;
  testID?: string;
}

export function MediaUploader({ onSelect, uploading, testID }: MediaUploaderProps) {
  const { colors } = useTheme();
  const [base64Input, setBase64Input] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAttach = () => {
    setError(null);
    const raw = base64Input.trim();
    if (!raw) {
      setError("Paste a base64 data URL to attach");
      return;
    }
    const match = raw.match(/^data:(image\/\w+);base64,(.+)$/i);
    if (match) {
      const mimeType = match[1] ?? "image/jpeg";
      const base64 = match[2] ?? "";
      setPreview(`data:${mimeType};base64,${base64}`);
      onSelect(base64, mimeType);
      return;
    }
    if (/^[A-Za-z0-9+/=]+$/.test(raw)) {
      setPreview(`data:image/jpeg;base64,${raw}`);
      onSelect(raw, "image/jpeg");
      return;
    }
    setError("Invalid format. Paste a base64 data URL.");
  };

  return (
    <View style={styles.container} testID={testID}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>
        Attach Photo
      </Text>
      <View style={styles.inputRow}>
        <TextInput
          style={[
            styles.input,
            {
              borderColor: colors.border,
              color: colors.text,
              backgroundColor: colors.surfaceMuted,
            },
          ]}
          value={base64Input}
          onChangeText={setBase64Input}
          placeholder="Paste base64 data URL..."
          multiline
          textAlignVertical="top"
          testID="media-uploader-input"
        />
        <Button
          variant="primary"
          size="small"
          onPress={handleAttach}
          disabled={uploading || !base64Input.trim()}
          testID="media-uploader-attach"
        >
          <Ionicons name="attach-outline" size={14} color={colors.textInverse} />
        </Button>
      </View>

      {preview ? (
        <View style={styles.previewRow}>
          <Image
            source={{ uri: preview }}
            style={[styles.thumbnail, { backgroundColor: colors.border }]}
          />
          <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
          <Text style={[styles.attached, { color: colors.primary }]}>Attached</Text>
          <Button
            variant="ghost"
            size="small"
            onPress={() => {
              setPreview(null);
              setBase64Input("");
            }}
          >
            <Ionicons name="close-outline" size={14} color={colors.textMuted} />
          </Button>
        </View>
      ) : null}

      {error ? (
        <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  label: { fontSize: 13, fontWeight: "600" },
  inputRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radii.sm,
    padding: spacing.sm,
    fontSize: 12,
    minHeight: 60,
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  thumbnail: { width: 48, height: 48, borderRadius: radii.sm },
  attached: { fontSize: 12 },
  error: { fontSize: 12 },
});
