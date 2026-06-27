import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "../../src/providers/ThemeProvider";
import { Card } from "../../src/components/ui/Card";
import { Button } from "../../src/components/ui/Button";
import { useAuthStore } from "../../src/stores/authStore";
import { createMagnumClient } from "@magnum/shared/api/endpoints";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

interface DashboardStats {
  userCount: number;
  revisionCount: number;
  trailCount: number;
  featureCount: number;
}

export default function AdminDashboard() {
  const { colors } = useTheme();
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const client = createMagnumClient(API_URL, { getAuthToken: () => token ?? undefined });
        const data = await client.raw.get<DashboardStats>("/api/admin/dashboard");
        setStats(data);
      } catch {
        // ignore errors
      } finally {
        setLoading(false);
      }
    };
    void fetchStats();
  }, [token]);

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.bg }]}
      contentContainerStyle={styles.content}
      testID="admin-dashboard"
    >
      <Text style={styles.heading}>Admin Dashboard</Text>
      <View style={styles.statsGrid}>
        <Card testID="admin-stat-users">
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Users</Text>
          <Text style={[styles.statValue, { color: colors.primary }]}>{stats?.userCount ?? 0}</Text>
        </Card>
        <Card testID="admin-stat-revisions">
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Revisions</Text>
          <Text style={[styles.statValue, { color: colors.primary }]}>{stats?.revisionCount ?? 0}</Text>
        </Card>
        <Card testID="admin-stat-trails">
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Trails</Text>
          <Text style={[styles.statValue, { color: colors.primary }]}>{stats?.trailCount ?? 0}</Text>
        </Card>
        <Card testID="admin-stat-features">
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Features</Text>
          <Text style={[styles.statValue, { color: colors.primary }]}>{stats?.featureCount ?? 0}</Text>
        </Card>
      </View>

      <View style={styles.links}>
        <Button
          variant="secondary"
          testID="admin-link-revisions"
          onPress={() => router.push("/admin/revisions")}
        >
          View Revisions
        </Button>
        <Button
          variant="secondary"
          testID="admin-link-users"
          onPress={() => router.push("/admin/users")}
        >
          Manage Users
        </Button>
        <Button
          variant="secondary"
          testID="admin-link-patrol"
          onPress={() => router.push("/admin/patrol")}
        >
          Patrol Feed
        </Button>
        <Button
          variant="secondary"
          testID="admin-link-presets"
          onPress={() => router.push("/admin/presets")}
        >
          Manage Presets
        </Button>
        <Button
          variant="secondary"
          testID="admin-link-synthesis"
          onPress={() => router.push("/admin/synthesis")}
        >
          Synthesis Proposals
        </Button>
        <Button
          variant="secondary"
          testID="admin-link-import"
          onPress={() => router.push("/admin/import")}
        >
          Premium Import
        </Button>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 12 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  heading: { fontSize: 22, fontWeight: "700", marginBottom: 4 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statLabel: { fontSize: 12 },
  statValue: { fontSize: 28, fontWeight: "700" },
  links: { gap: 8, marginTop: 8 },
});
