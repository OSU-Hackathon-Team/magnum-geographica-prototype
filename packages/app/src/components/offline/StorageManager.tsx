import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { STORAGE_SOFT_WARN_BYTES, STORAGE_HARD_CAP_BYTES } from "@magnum/shared";
import { useOfflineStore } from "../../stores/offlineStore";
import { Button } from "../ui/Button";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface StorageManagerProps {
  onDeleteRegion: (regionId: string) => Promise<void>;
}

export function StorageManager({ onDeleteRegion }: StorageManagerProps) {
  const { offlineRegions } = useOfflineStore();
  const [deleting, setDeleting] = useState<string | null>(null);

  const totalBytes = offlineRegions.reduce(
    (sum, r) => sum + r.tileSizeBytes + r.geojsonSizeBytes + r.wikiSizeBytes,
    0,
  );
  const usagePercent = Math.min(100, (totalBytes / STORAGE_HARD_CAP_BYTES) * 100);
  const nearLimit = totalBytes >= STORAGE_SOFT_WARN_BYTES;

  async function handleDelete(regionId: string) {
    setDeleting(regionId);
    try {
      await onDeleteRegion(regionId);
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

      {offlineRegions.length === 0 ? (
        <Text style={styles.empty} testID="storage-empty">
          No regions downloaded for offline use.
        </Text>
      ) : (
        offlineRegions.map((region) => (
          <View key={region.id} style={styles.regionRow} testID={`storage-region-${region.id}`}>
            <View style={styles.regionInfo}>
              <Text style={styles.regionName}>{region.name}</Text>
              <Text style={styles.regionDetail}>
                {region.baseLayerId} · z{region.minZoom}–{region.maxZoom} · {region.totalTiles} tiles
              </Text>
              <Text style={styles.regionSize}>
                {formatSize(region.tileSizeBytes + region.geojsonSizeBytes + region.wikiSizeBytes)}
                {region.lastSynced
                  ? ` · Synced ${new Date(region.lastSynced).toLocaleDateString()}`
                  : ""}
              </Text>
            </View>
            <Button
              variant="ghost"
              size="small"
              onPress={() => handleDelete(region.id)}
              disabled={deleting === region.id}
              testID={`storage-delete-${region.id}`}
            >
              <Ionicons name="trash-outline" size={14} color="#ef4444" />
            </Button>
          </View>
        ))
      )}

      {offlineRegions.length > 0 ? (
        <View style={styles.deleteAll}>
          <Button
            variant="ghost"
            size="small"
            onPress={() => {
              offlineRegions.forEach((r) => handleDelete(r.id));
            }}
            testID="storage-delete-all"
          >
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
  regionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  regionInfo: { flex: 1, gap: 2 },
  regionName: { fontSize: 13, fontWeight: "500" },
  regionDetail: { fontSize: 11, color: "#999" },
  regionSize: { fontSize: 11, color: "#888" },
  deleteAll: { alignItems: "flex-end", paddingTop: 8 },
});
