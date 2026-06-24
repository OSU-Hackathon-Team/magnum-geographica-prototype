import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { createMagnumClient, type TrailSegment } from "@magnum/shared";
import { SegmentTypeBadge } from "../../src/components/ui/SegmentTypeBadge";
import { Card } from "../../src/components/ui/Card";
import { getTrailSegments } from "../../src/services/offlineDataService";
import { useOfflineStore } from "../../src/stores/offlineStore";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export default function SegmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
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
      <View style={styles.centered} testID="segment-detail-loading">
        <ActivityIndicator />
      </View>
    );
  }

  if (!segment) {
    return (
      <View style={styles.centered} testID="segment-detail-not-found">
        <Text style={styles.errorText}>{error ?? "Segment not found"}</Text>
      </View>
    );
  }

  const hazards = segment.hazards ?? [];

  return (
    <>
      <Stack.Screen options={{ title: segment.name ?? `Segment ${segment.sort_order + 1}` }} />
      <ScrollView
        style={styles.container}
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
            <Text style={styles.label}>Description</Text>
            <Text style={styles.value}>{segment.description}</Text>
          </Card>
        ) : null}

        <Card>
          <Text style={styles.label}>Details</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Length</Text>
            <Text style={styles.detailValue}>
              {segment.length_meters != null
                ? `${(segment.length_meters / 1000).toFixed(1)} km`
                : "—"}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Surface</Text>
            <Text style={styles.detailValue}>{segment.surface_type ?? "—"}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Steep Grade</Text>
            <Text style={styles.detailValue}>{segment.steep_grade ? "Yes" : "No"}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>One Way</Text>
            <Text style={styles.detailValue}>{segment.one_way ? "Yes" : "No"}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Road Connector</Text>
            <Text style={styles.detailValue}>{segment.is_road_connector ? "Yes" : "No"}</Text>
          </View>
        </Card>

        {hazards.length > 0 ? (
          <Card>
            <Text style={styles.label}>Hazards</Text>
            {hazards.map((h: string, i: number) => (
              <View key={i} style={styles.hazardRow}>
                <Text style={styles.hazardIcon}>⚠</Text>
                <Text style={styles.hazardText}>{h}</Text>
              </View>
            ))}
          </Card>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 16, gap: 12 },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  errorText: { color: "#ef4444", fontSize: 14 },
  name: { fontSize: 20, fontWeight: "700" },
  badgeRow: { flexDirection: "row", marginTop: 8 },
  label: { fontSize: 12, color: "#888", marginBottom: 8 },
  value: { fontSize: 14, color: "#333" },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  detailLabel: { fontSize: 13, color: "#888" },
  detailValue: { fontSize: 13, color: "#333", fontWeight: "500" },
  hazardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
  },
  hazardIcon: { fontSize: 14 },
  hazardText: { fontSize: 13, color: "#333" },
});
