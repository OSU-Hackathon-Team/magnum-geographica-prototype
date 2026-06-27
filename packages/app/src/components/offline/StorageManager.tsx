import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { STORAGE_SOFT_WARN_BYTES, STORAGE_HARD_CAP_BYTES } from "@magnum/shared";
import { useOfflineStore } from "../../stores/offlineStore";
import { Button } from "../ui/Button";
import { useTheme } from "../../providers/ThemeProvider";
import { spacing, text as textTokens } from "../../theme/tokens";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface StorageManagerProps {
  onDeleteRegion: (regionId: string) => Promise<void>;
}

export function StorageManager({ onDeleteRegion }: StorageManagerProps) {
  const { colors } = useTheme();
  const { offlineRegions } = useOfflineStore();
  const [deleting, setDeleting] = useState<string | null>(null);

  const totalBytes = offlineRegions.reduce(
    (sum, r) => sum + r.tileSizeBytes + r.geojsonSizeBytes + r.wikiSizeBytes, 0,
  );
  const usagePercent = Math.min(100, (totalBytes / STORAGE_HARD_CAP_BYTES) * 100);
  const nearLimit = totalBytes >= STORAGE_SOFT_WARN_BYTES;

  async function handleDelete(regionId: string) {
    setDeleting(regionId);
    try { await onDeleteRegion(regionId); }
    finally { setDeleting(null); }
  }

  return (
    <View style={styles.container} testID="storage-manager">
      <Text style={[textTokens.h3, { color: colors.textMuted }]}>Offline Storage</Text>
      <View style={[styles.usageBar, { backgroundColor: colors.surfaceMutedStrong }]}>
        <View style={[styles.usageFill, { width: `${usagePercent}%`, backgroundColor: nearLimit ? colors.warning : colors.success }]} />
      </View>
      <Text style={[textTokens.meta, { color: nearLimit ? colors.warning : colors.textMuted }]}>
        {formatSize(totalBytes)} / {formatSize(STORAGE_HARD_CAP_BYTES)}
        {nearLimit ? "  Warning: approaching limit" : ""}
      </Text>
      {offlineRegions.length === 0 ? (
        <Text style={[textTokens.meta, { color: colors.textMuted, fontStyle: "italic" }]} testID="storage-empty">No regions downloaded for offline use.</Text>
      ) : (
        offlineRegions.map((region) => (
          <View key={region.id} style={[styles.regionRow, { borderBottomColor: colors.divider }]} testID={`storage-region-${region.id}`}>
            <View style={styles.regionInfo}>
              <Text style={[textTokens.bodyStrong, { color: colors.text }]}>{region.name}</Text>
              <Text style={[textTokens.meta, { color: colors.textMuted }]}>{region.baseLayerId} · z{region.minZoom}–{region.maxZoom} · {region.totalTiles} tiles</Text>
              <Text style={[textTokens.meta, { color: colors.textMuted }]}>
                {formatSize(region.tileSizeBytes + region.geojsonSizeBytes + region.wikiSizeBytes)}
                {region.lastSynced ? ` · Synced ${new Date(region.lastSynced).toLocaleDateString()}` : ""}
              </Text>
            </View>
            <Button variant="ghost" size="small" onPress={() => handleDelete(region.id)} disabled={deleting === region.id} testID={`storage-delete-${region.id}`}>
              <Ionicons name="trash-outline" size={14} color={colors.danger} />
            </Button>
          </View>
        ))
      )}
      {offlineRegions.length > 0 ? (
        <View style={styles.deleteAll}>
          <Button variant="ghost" size="small" onPress={() => { offlineRegions.forEach((r) => handleDelete(r.id)); }} testID="storage-delete-all">Delete All</Button>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  usageBar: { height: 8, borderRadius: 4, overflow: "hidden" },
  usageFill: { height: "100%", borderRadius: 4 },
  regionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: spacing.sm, borderBottomWidth: 1 },
  regionInfo: { flex: 1, gap: 2 },
  deleteAll: { alignItems: "flex-end", paddingTop: spacing.sm },
});
