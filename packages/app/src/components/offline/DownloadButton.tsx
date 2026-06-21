import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "../ui/Button";

export interface DownloadButtonProps {
  systemId: string;
  systemName: string;
  isDownloaded: boolean;
  downloadSizeBytes?: number;
  onDownload: () => Promise<void>;
  disabled?: boolean;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DownloadButton({
  systemId,
  systemName,
  isDownloaded,
  downloadSizeBytes,
  onDownload,
  disabled,
}: DownloadButtonProps) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setDownloading(true);
    setError(null);
    try {
      await onDownload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  }

  if (isDownloaded) {
    return (
      <View style={styles.downloaded} testID={`download-done-${systemId}`}>
        <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
        <Text style={styles.downloadedText}>Downloaded for offline use</Text>
      </View>
    );
  }

  return (
    <View style={styles.container} testID={`download-container-${systemId}`}>
      <Button
        variant="primary"
        size="small"
        onPress={handleDownload}
        disabled={disabled || downloading}
        testID={`download-button-${systemId}`}
      >
        <Ionicons name="download-outline" size={14} color="#fff" />
        {" "}{downloading ? "Downloading..." : "Download for Offline"}
      </Button>
      {downloadSizeBytes !== undefined ? (
        <Text style={styles.size}>~{formatSize(downloadSizeBytes)}</Text>
      ) : null}
      {error ? (
        <Text style={styles.error} testID={`download-error-${systemId}`}>{error}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  downloaded: { flexDirection: "row", alignItems: "center", gap: 6 },
  downloadedText: { fontSize: 12, color: "#22c55e" },
  size: { fontSize: 11, color: "#999" },
  error: { color: "#ef4444", fontSize: 12 },
});
