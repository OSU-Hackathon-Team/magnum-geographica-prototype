import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router, Link } from "expo-router";
import { useAuthStore } from "../../src/stores/authStore";
import { useOfflineStore } from "../../src/stores/offlineStore";
import { Card } from "../../src/components/ui/Card";
import { Button } from "../../src/components/ui/Button";
import { StorageManager } from "../../src/components/offline/StorageManager";
import { PendingQueue, type PendingItem } from "../../src/components/offline/PendingQueue";
import {
  getPendingContributions,
  deleteOfflineRegion as deleteRegion,
  deletePendingContribution,
} from "../../src/services/offlineDataService";
import { syncContributions } from "../../src/services/syncService";

export default function ProfileScreen() {
  const contributor = useAuthStore((s) => s.contributorName);
  const setContributor = useAuthStore((s) => s.setContributorName);
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const logout = useAuthStore((s) => s.logout);
  const pending = useOfflineStore((s) => s.pendingCount);
  const isOnline = useOfflineStore((s) => s.isOnline);
  const syncState = useOfflineStore((s) => s.syncState);

  const [items, setItems] = useState<PendingItem[]>([]);
  const [syncing, setSyncing] = useState(false);

  const refreshPending = useCallback(async () => {
    const pending = await getPendingContributions();
    setItems(pending as PendingItem[]);
  }, []);

  useEffect(() => {
    void refreshPending();
  }, [refreshPending, pending]);

  const handleSyncAll = useCallback(async () => {
    setSyncing(true);
    try {
      await syncContributions(contributor);
      await refreshPending();
    } finally {
      setSyncing(false);
    }
  }, [contributor, refreshPending]);

  const handleDeletePending = useCallback(
    async (id: number) => {
      await deletePendingContribution(id);
      await refreshPending();
    },
    [refreshPending],
  );

  const handleDeleteRegion = useCallback(async (regionId: string) => {
    await deleteRegion(regionId);
  }, []);

  const handleLogout = async () => {
    await logout();
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      testID="profile-screen"
    >
      <Card>
        <Text style={styles.label}>Account</Text>
        {isAuthenticated && user ? (
          <View>
            <Text style={styles.value} testID="profile-username">
              {user.username}
            </Text>
            <Text style={styles.sub}>{user.email}</Text>
            <View style={styles.buttonRow}>
              <Button onPress={handleLogout} variant="secondary" size="small" testID="profile-logout">
                Log Out
              </Button>
              {isAdmin && (
                <Link href="/admin/dashboard" asChild>
                  <Button variant="primary" size="small" testID="profile-admin">
                    Admin Panel
                  </Button>
                </Link>
              )}
            </View>
          </View>
        ) : (
          <View>
            <Text style={styles.value} testID="profile-contributor">
              {contributor}
            </Text>
            <Text style={styles.sub}>Editing anonymously</Text>
            <View style={styles.buttonRow}>
              <Link href="/auth/login" asChild>
                <Button variant="primary" size="small" testID="profile-login">
                  Log In
                </Button>
              </Link>
              <Link href="/auth/register" asChild>
                <Button variant="secondary" size="small" testID="profile-register">
                  Register
                </Button>
              </Link>
            </View>
            <Text
              style={styles.hint}
              onPress={() => setContributor("anonymous")}
              testID="profile-reset"
            >
              Tap to reset contributor name
            </Text>
          </View>
        )}
      </Card>

      <Card>
        <Text style={styles.label}>Status</Text>
        <Text style={styles.value} testID="profile-status">
          {isOnline ? (syncState === "syncing" ? "Syncing..." : "Online") : "Offline"}
        </Text>
        <Text style={styles.sub}>{pending} pending change(s)</Text>
      </Card>

      <Card>
        <StorageManager onDeleteRegion={handleDeleteRegion} />
      </Card>

      <View testID="profile-pending-section">
        <PendingQueue
          items={items}
          onDelete={handleDeletePending}
          onSyncAll={handleSyncAll}
          syncing={syncing}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 16, gap: 12 },
  label: { fontSize: 12, color: "#888", marginBottom: 4 },
  value: { fontSize: 16, fontWeight: "600" },
  sub: { fontSize: 12, color: "#888", marginTop: 4 },
  hint: { fontSize: 12, color: "#22c55e", marginTop: 8 },
  buttonRow: { flexDirection: "row", gap: 8, marginTop: 8 },
});
