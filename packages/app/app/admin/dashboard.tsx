import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View, ActivityIndicator } from "react-native";
import { Link } from "expo-router";
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
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#22c55e" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      testID="admin-dashboard"
    >
      <Text style={styles.heading}>Admin Dashboard</Text>
      <View style={styles.statsGrid}>
        <Card testID="admin-stat-users">
          <Text style={styles.statLabel}>Users</Text>
          <Text style={styles.statValue}>{stats?.userCount ?? 0}</Text>
        </Card>
        <Card testID="admin-stat-revisions">
          <Text style={styles.statLabel}>Revisions</Text>
          <Text style={styles.statValue}>{stats?.revisionCount ?? 0}</Text>
        </Card>
        <Card testID="admin-stat-trails">
          <Text style={styles.statLabel}>Trails</Text>
          <Text style={styles.statValue}>{stats?.trailCount ?? 0}</Text>
        </Card>
        <Card testID="admin-stat-features">
          <Text style={styles.statLabel}>Features</Text>
          <Text style={styles.statValue}>{stats?.featureCount ?? 0}</Text>
        </Card>
      </View>

      <View style={styles.links}>
        <Link href="/admin/revisions" asChild>
          <Button variant="secondary" testID="admin-link-revisions">
            View Revisions
          </Button>
        </Link>
        <Link href="/admin/users" asChild>
          <Button variant="secondary" testID="admin-link-users">
            Manage Users
          </Button>
        </Link>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 16, gap: 12 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  heading: { fontSize: 22, fontWeight: "700", marginBottom: 4 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statLabel: { fontSize: 12, color: "#888" },
  statValue: { fontSize: 28, fontWeight: "700", color: "#22c55e" },
  links: { gap: 8, marginTop: 8 },
});
