import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { createMagnumClient, type TrailSegment } from "@magnum/shared";
import { SegmentTypeBadge } from "@/components/ui/SegmentTypeBadge";
import { Card } from "@/components/ui/Card";
import { Section } from "@/components/ui/Section";
import { useTheme } from "@/providers/ThemeProvider";
import { getTrailSegments } from "@/services/offlineDataService";
import { useOfflineStore } from "@/stores/offlineStore";
import { spacing, text as textTokens } from "@/theme/tokens";

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
    setLoading(true); setError(null);
    (async () => {
      try {
        const localSegs = await getTrailSegments("");
        const match = localSegs.find((s: Record<string, unknown>) => String(s.id) === id);
        if (match && !cancelled) {
          hasLocalRef.current = true;
          setSegment({
            id: String(match.id), trail_id: String(match.trail_id ?? ""),
            name: match.name ? String(match.name) : null, sort_order: Number(match.sort_order ?? 0),
            surface_type: (match.surface_type as TrailSegment["surface_type"]) ?? null,
            hazards: Array.isArray(match.hazards) ? (match.hazards as string[]) : typeof match.hazards === "string" ? JSON.parse(match.hazards as string) : [],
            is_road_connector: Boolean(match.is_road_connector), steep_grade: Boolean(match.steep_grade),
            one_way: Boolean(match.one_way), description: match.description ? String(match.description) : null,
            length_meters: Number(match.length_meters ?? 0), created_at: "", updated_at: "",
          } as TrailSegment);
        }
      } catch { /* ignore local errors */ }
      if (isOnline) {
        try {
          const client = createMagnumClient(API_URL);
          const fresh = await client.raw.request<TrailSegment>("GET", `/api/segments/${id}`);
          if (!cancelled) setSegment(fresh);
        } catch (e: unknown) {
          if (!hasLocalRef.current && e && typeof e === "object" && "status" in e && (e as { status: number }).status === 404) {
            setError("Segment not found");
          }
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id, isOnline]);

  if (loading) return (
    <View style={[styles.centered, { backgroundColor: colors.bg }]} testID="segment-detail-loading">
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
  if (!segment) return (
    <View style={[styles.centered, { backgroundColor: colors.bg }]} testID="segment-detail-not-found">
      <Ionicons name="alert-circle-outline" size={36} color={colors.danger} />
      <Text style={[textTokens.body, { color: colors.danger, marginTop: spacing.sm }]}>{error ?? "Segment not found"}</Text>
    </View>
  );

  const hazards = segment.hazards ?? [];

  return (
    <>
      <Stack.Screen options={{ title: segment.name ?? `Segment ${segment.sort_order + 1}`, headerShown: true }} />
      <ScrollView style={[styles.container, { backgroundColor: colors.bg }]} contentContainerStyle={styles.content} testID={`segment-detail-${segment.id}`}>
        <Section hero>
          <Text style={[textTokens.title, { color: colors.text }]}>{segment.name ?? `Segment ${segment.sort_order + 1}`}</Text>
          {segment.surface_type ? <View style={{ flexDirection: "row", marginTop: spacing.sm }}><SegmentTypeBadge surface={segment.surface_type} /></View> : null}
        </Section>
        {segment.description ? (
          <Section title="Description">
            <Text style={[textTokens.body, { color: colors.textSecondary }]}>{segment.description}</Text>
          </Section>
        ) : null}
        <Section title="Details">
          <Card>
            {[
              ["Length", segment.length_meters != null ? `${(segment.length_meters / 1000).toFixed(1)} km` : "\u2014"],
              ["Surface", segment.surface_type ?? "\u2014"],
              ["Steep Grade", segment.steep_grade ? "Yes" : "No"],
              ["One Way", segment.one_way ? "Yes" : "No"],
              ["Road Connector", segment.is_road_connector ? "Yes" : "No"],
            ].map(([label, value], i, arr) => (
              <View key={i} style={[styles.detailRow, { borderBottomColor: colors.divider }, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                <Text style={[textTokens.meta, { color: colors.textMuted }]}>{label}</Text>
                <Text style={[textTokens.body, { color: colors.text, fontWeight: "500" }]}>{value}</Text>
              </View>
            ))}
          </Card>
        </Section>
        {hazards.length > 0 ? (
          <Section title="Hazards">
            <Card>
              {hazards.map((h: string, i: number) => (
                <View key={i} style={styles.hazardRow}>
                  <Text style={styles.hazardIcon}>{String.fromCodePoint(0x26A0)}</Text>
                  <Text style={[textTokens.body, { color: colors.warning }]}>{h}</Text>
                </View>
              ))}
            </Card>
          </Section>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: spacing.xxxl },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  detailRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.sm, borderBottomWidth: 1 },
  hazardRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingVertical: spacing.xxs },
  hazardIcon: { fontSize: 14 },
});
