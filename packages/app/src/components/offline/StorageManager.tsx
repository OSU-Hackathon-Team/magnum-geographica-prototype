import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { STORAGE_SOFT_WARN_BYTES, STORAGE_HARD_CAP_BYTES } from "@magnum/shared";
import { useOfflineStore, type DownloadedPack } from "../../stores/offlineStore";
import { Button } from "../ui/Button";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface StorageManagerProps {
  onDeletePack: (systemId: string) => Promise<void>;
}

export function StorageManager({ onDeletePack }: StorageManagerProps) {
  const { downloadedPacks } = useOfflineStore();
  const [deleting, setDeleting] = useState<string | null>(null);

  const totalBytes = downloadedPacks.reduce(
    (sum, p) => sum + p.tileSizeBytes + p.geojsonSizeBytes + p.wikiSizeBytes,
    0,
  );
  const usagePercent = Math.min(100, (totalBytes / STORAGE_HARD_CAP_BYTES) * 100);
  const nearLimit = totalBytes >= STORAGE_SOFT_WARN_BYTES;

  async function handleDelete(systemId: string) {
    setDeleting(systemId);
    try {
      await onDeletePack(systemId);
    } finally {
      setDeleting(null);
    }
  }

  return (
    <View style={styles.container} testID="storage-manager">
      <Text style={styles.heading}>Offline Storage</Text>

      <View style={styles.usageBar}>
        <View
          style={[
            styles.usageFill,
            {
              width: `${usagePercent}%`,
              backgroundColor: nearLimit ? "#f97316" : "#22c55e",
            },
          ]}
        />
      </View>
      <Text style={[styles.usageText, nearLimit ? styles.usageWarn : null]}>
        {formatSize(totalBytes)} / {formatSize(STORAGE_HARD_CAP_BYTES)}
        {nearLimit ? "  Warning: approaching limit" : ""}
      </Text>

      {downloadedPacks.length === 0 ? (
        <Text style={styles.empty} testID="storage-empty">No systems downloaded for offline use.</Text>
      ) : (
        downloadedPacks.map((pack) => (
          <View key={pack.systemId} style={styles.packRow} testID={`storage-pack-${pack.systemId}`}>
            <View style={styles.packInfo}>
              <Text style={styles.packName}>{pack.systemName}</Text>
              <Text style={styles.packSize}>
                {formatSize(pack.tileSizeBytes + pack.geojsonSizeBytes + pack.wikiSizeBytes)}
                {pack.lastSynced ? ` · Synced ${new Date(pack.lastSynced).toLocaleDateString()}` : ""}
              </Text>
            </View>
            <Button
              variant="ghost"
              size="small"
              onPress={() => handleDelete(pack.systemId)}
              disabled={deleting === pack.systemId}
              testID={`storage-delete-${pack.systemId}`}
            >
              <Ionicons name="trash-outline" size={14} color="#ef4444" />
            </Button>
          </View>
        ))
      )}

      {downloadedPacks.length > 0 ? (
        <View style={styles.deleteAll}>
          <Button variant="ghost" size="small" onPress={() => {
            downloadedPacks.forEach((p) => handleDelete(p.systemId));
          }} testID="storage-delete-all">
            Delete All
          </Button>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  heading: { fontSize: 16, fontWeight: "600" },
  usageBar: {
    height: 8,
    backgroundColor: "#e8e8e8",
    borderRadius: 4,
    overflow: "hidden",
  },
  usageFill: { height: "100%", borderRadius: 4 },
  usageText: { fontSize: 11, color: "#888" },
  usageWarn: { color: "#f97316" },
  empty: { fontSize: 13, color: "#aaa", fontStyle: "italic" },
  packRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  packInfo: { flex: 1, gap: 2 },
  packName: { fontSize: 13, fontWeight: "500" },
  packSize: { fontSize: 11, color: "#888" },
  deleteAll: { alignItems: "flex-end", paddingTop: 8 },
});
