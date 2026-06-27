import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { createMagnumClient, type TrailSegment } from "@magnum/shared";
import { useTheme } from "../../src/providers/ThemeProvider";
import { SegmentTypeBadge } from "../../src/components/ui/SegmentTypeBadge";
import { Card } from "../../src/components/ui/Card";
import { getTrailSegments } from "../../src/services/offlineDataService";
import { useOfflineStore } from "../../src/stores/offlineStore";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export default function SegmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const isOnline = useOfflineStore((s) => s.isOnline);
  const [segment, setSegment] = useState<TrailSegment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLocalRef = useRef(false);

  useEffect(() => {
    if (!id || typeof id !== "string") return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      // Try local first
      try {
        const localSegs = await getTrailSegments("");
        const match = localSegs.find((s: Record<string, unknown>) => String(s.id) === id);
        if (match && !cancelled) {
          hasLocalRef.current = true;
          setSegment({
            id: String(match.id),
            trail_id: String(match.trail_id ?? ""),
            name: match.name ? String(match.name) : null,
            sort_order: Number(match.sort_order ?? 0),
            surface_type: (match.surface_type as TrailSegment["surface_type"]) ?? null,
            hazards: Array.isArray(match.hazards)
              ? (match.hazards as string[])
              : typeof match.hazards === "string"
                ? JSON.parse(match.hazards as string)
                : [],
            is_road_connector: Boolean(match.is_road_connector),
            steep_grade: Boolean(match.steep_grade),
            one_way: Boolean(match.one_way),
            description: match.description ? String(match.description) : null,
            length_meters: Number(match.length_meters ?? 0),
            created_at: "",
            updated_at: "",
          } as TrailSegment);
        }
      } catch {
        /* ignore local errors */
      }

      // If online, fetch fresh from API
      if (isOnline) {
        try {
          const client = createMagnumClient(API_URL);
          const fresh = await client.raw.request<TrailSegment>("GET", `/api/segments/${id}`);
          if (!cancelled) setSegment(fresh);
        } catch (e: unknown) {
          if (
            hasLocalRef.current ||
            !e ||
            typeof e !== "object" ||
            !("status" in e) ||
            (e as { status: number }).status !== 404
          ) {
            // Keep local data if available
          } else if (!hasLocalRef.current) {
            setError("Segment not found");
          }
        }
      }
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [id, isOnline]);

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg }]} testID="segment-detail-loading">
        <ActivityIndicator />
      </View>
    );
  }

  if (!segment) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg }]} testID="segment-detail-not-found">
        <Text style={[styles.errorText, { color: colors.danger }]}>{error ?? "Segment not found"}</Text>
      </View>
    );
  }

  const hazards = segment.hazards ?? [];

  return (
    <>
      <Stack.Screen options={{ title: segment.name ?? `Segment ${segment.sort_order + 1}` }} />
      <ScrollView
        style={[styles.container, { backgroundColor: colors.bg }]}
        contentContainerStyle={styles.content}
        testID={`segment-detail-${segment.id}`}
      >
        <Card>
          <Text style={styles.name}>{segment.name ?? `Segment ${segment.sort_order + 1}`}</Text>
          {segment.surface_type ? (
            <View style={styles.badgeRow}>
              <SegmentTypeBadge surface={segment.surface_type} />
            </View>
          ) : null}
        </Card>

        {segment.description ? (
          <Card>
            <Text style={[styles.label, { color: colors.textMuted }]}>Description</Text>
            <Text style={[styles.value, { color: colors.textSecondary }]}>{segment.description}</Text>
          </Card>
        ) : null}

        <Card>
          <Text style={[styles.label, { color: colors.textMuted }]}>Details</Text>
          <View style={[styles.detailRow, { borderBottomColor: colors.divider }]}>
            <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Length</Text>
            <Text style={[styles.detailValue, { color: colors.textSecondary }]}>
              {segment.length_meters != null
                ? `${(segment.length_meters / 1000).toFixed(1)} km`
                : "—"}
            </Text>
          </View>
          <View style={[styles.detailRow, { borderBottomColor: colors.divider }]}>
            <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Surface</Text>
            <Text style={[styles.detailValue, { color: colors.textSecondary }]}>{segment.surface_type ?? "—"}</Text>
          </View>
          <View style={[styles.detailRow, { borderBottomColor: colors.divider }]}>
            <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Steep Grade</Text>
            <Text style={[styles.detailValue, { color: colors.textSecondary }]}>{segment.steep_grade ? "Yes" : "No"}</Text>
          </View>
          <View style={[styles.detailRow, { borderBottomColor: colors.divider }]}>
            <Text style={[styles.detailLabel, { color: colors.textMuted }]}>One Way</Text>
            <Text style={[styles.detailValue, { color: colors.textSecondary }]}>{segment.one_way ? "Yes" : "No"}</Text>
          </View>
          <View style={[styles.detailRow, { borderBottomColor: colors.divider }]}>
            <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Road Connector</Text>
            <Text style={[styles.detailValue, { color: colors.textSecondary }]}>{segment.is_road_connector ? "Yes" : "No"}</Text>
          </View>
        </Card>

        {hazards.length > 0 ? (
          <Card>
            <Text style={[styles.label, { color: colors.textMuted }]}>Hazards</Text>
            {hazards.map((h: string, i: number) => (
              <View key={i} style={styles.hazardRow}>
                <Text style={styles.hazardIcon}>⚠</Text>
                <Text style={[styles.hazardText, { color: colors.textSecondary }]}>{h}</Text>
              </View>
            ))}
          </Card>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 12 },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: { fontSize: 14 },
  name: { fontSize: 20, fontWeight: "700" },
  badgeRow: { flexDirection: "row", marginTop: 8 },
  label: { fontSize: 12, marginBottom: 8 },
  value: { fontSize: 14 },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  detailLabel: { fontSize: 13 },
  detailValue: { fontSize: 13, fontWeight: "500" },
  hazardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
  },
  hazardIcon: { fontSize: 14 },
  hazardText: { fontSize: 13 },
});
