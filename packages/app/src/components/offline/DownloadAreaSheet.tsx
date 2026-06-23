import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  QUALITY_LEVELS,
  QUALITY_LEVEL_ORDER,
  DEFAULT_OFFLINE_QUALITY,
  type QualityLevelKey,
} from "@magnum/shared";
import { estimateRegionSize, downloadRegion, formatBytes } from "../../services/offlinePackService";

interface DownloadAreaSheetProps {
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number };
  baseLayerId: string;
  baseLayerLabel: string;
  onDismiss: () => void;
  testID?: string;
}

export function DownloadAreaSheet({
  bbox,
  baseLayerId,
  baseLayerLabel,
  onDismiss,
  testID,
}: DownloadAreaSheetProps) {
  const [quality, setQuality] = useState<QualityLevelKey>(DEFAULT_OFFLINE_QUALITY);
  const [estimatedBytes, setEstimatedBytes] = useState<number | null>(null);
  const [estimatedTiles, setEstimatedTiles] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState({ message: "", pct: 0 });
  const [error, setError] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  const level = QUALITY_LEVELS[quality];

  const estimate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await estimateRegionSize(
        bbox.minLon,
        bbox.minLat,
        bbox.maxLon,
        bbox.maxLat,
        baseLayerId,
        level.minZoom,
        level.maxZoom,
      );
      setEstimatedBytes(result.totalEstimatedBytes);
      setEstimatedTiles(result.tileCount);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to estimate size");
    } finally {
      setLoading(false);
    }
  }, [bbox, baseLayerId, level]);

  useEffect(() => {
    const timer = setTimeout(estimate, 400);
    return () => clearTimeout(timer);
  }, [estimate]);

  const currentQualityIndex = QUALITY_LEVEL_ORDER.indexOf(quality);

  const handleQualityChange = useCallback((delta: number) => {
    const newIndex = Math.max(0, Math.min(QUALITY_LEVEL_ORDER.length - 1, currentQualityIndex + delta));
    setQuality(QUALITY_LEVEL_ORDER[newIndex]!);
  }, [currentQualityIndex]);

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    setError(null);
    try {
      const regionName = `Area ${bbox.minLat.toFixed(2)},${bbox.minLon.toFixed(2)} - ${bbox.maxLat.toFixed(2)},${bbox.maxLon.toFixed(2)}`;
      await downloadRegion(
        bbox.minLon,
        bbox.minLat,
        bbox.maxLon,
        bbox.maxLat,
        baseLayerId,
        level.minZoom,
        level.maxZoom,
        regionName,
        (message, pct) => setProgress({ message, pct }),
      );
      setDownloaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  }, [bbox, baseLayerId, level]);

  return (
    <View style={styles.overlay} testID={testID}>
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>Download Area</Text>
          <Pressable onPress={onDismiss} testID="download-sheet-close">
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>

        <Text style={styles.layerLabel}>Base Layer: {baseLayerLabel}</Text>

        <View style={styles.qualityRow}>
          <Pressable
            onPress={() => handleQualityChange(-1)}
            style={[styles.qualityBtn, currentQualityIndex <= 0 && styles.qualityBtnDisabled]}
            disabled={currentQualityIndex <= 0}
            testID="download-quality-less"
          >
            <Text style={styles.qualityBtnText}>−</Text>
          </Pressable>
          <View style={styles.qualityCenter}>
            <Text style={styles.qualityLabel} testID="download-quality-label">
              {level.label}
            </Text>
            <Text style={styles.qualityZoom}>
              Zoom {level.minZoom}–{level.maxZoom}
            </Text>
          </View>
          <Pressable
            onPress={() => handleQualityChange(1)}
            style={[styles.qualityBtn, currentQualityIndex >= QUALITY_LEVEL_ORDER.length - 1 && styles.qualityBtnDisabled]}
            disabled={currentQualityIndex >= QUALITY_LEVEL_ORDER.length - 1}
            testID="download-quality-more"
          >
            <Text style={styles.qualityBtnText}>+</Text>
          </Pressable>
        </View>

        <View style={styles.estimateRow}>
          {loading ? (
            <ActivityIndicator size="small" />
          ) : error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : estimatedBytes != null ? (
            <Text style={styles.estimateText} testID="download-estimate">
              ~{formatBytes(estimatedBytes)}{" "}
              {estimatedTiles != null ? `(${estimatedTiles} tiles)` : ""}
            </Text>
          ) : null}
        </View>

        {downloading ? (
          <View style={styles.progressRow}>
            <Text style={styles.progressText}>{progress.message}</Text>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${progress.pct}%` }]} />
            </View>
          </View>
        ) : downloaded ? (
          <View style={styles.downloadedRow}>
            <Text style={styles.downloadedText}>Downloaded successfully</Text>
          </View>
        ) : (
          <Pressable
            style={styles.downloadBtn}
            onPress={handleDownload}
            testID="download-start"
          >
            <Text style={styles.downloadBtnText}>Download</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 30,
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 36,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 16,
    gap: 14,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { fontSize: 18, fontWeight: "700", color: "#111" },
  closeText: { fontSize: 24, color: "#888", lineHeight: 26 },
  layerLabel: { fontSize: 13, color: "#666" },
  qualityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  qualityBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f0f0f0",
    alignItems: "center",
    justifyContent: "center",
  },
  qualityBtnDisabled: { opacity: 0.3 },
  qualityBtnText: { fontSize: 20, color: "#333", lineHeight: 22 },
  qualityCenter: { alignItems: "center", minWidth: 100 },
  qualityLabel: { fontSize: 16, fontWeight: "600", color: "#111" },
  qualityZoom: { fontSize: 12, color: "#888", marginTop: 2 },
  estimateRow: { alignItems: "center", minHeight: 24 },
  estimateText: { fontSize: 14, color: "#333", fontWeight: "500" },
  errorText: { fontSize: 12, color: "#ef4444" },
  progressRow: { gap: 8 },
  progressText: { fontSize: 12, color: "#888", textAlign: "center" },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#e8e8e8",
    overflow: "hidden",
  },
  progressBarFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#22c55e",
  },
  downloadedRow: { alignItems: "center" },
  downloadedText: { fontSize: 14, color: "#22c55e", fontWeight: "600" },
  downloadBtn: {
    backgroundColor: "#22c55e",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  downloadBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
});
