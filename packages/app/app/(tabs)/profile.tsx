import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "../../src/stores/authStore";
import { useOfflineStore } from "../../src/stores/offlineStore";
import { useUiStore, type ThemeMode } from "../../src/stores/uiStore";
import { useTheme } from "../../src/providers/ThemeProvider";
import { Card } from "../../src/components/ui/Card";
import { Button } from "../../src/components/ui/Button";
import { StorageManager } from "../../src/components/offline/StorageManager";
import { PendingQueue, type PendingItem } from "../../src/components/offline/PendingQueue";
import { TrustTierBadge } from "../../src/components/vote/TrustTierBadge";
import {
  getPendingContributions,
  deleteOfflineRegion as deleteRegion,
  deletePendingContribution,
} from "../../src/services/offlineDataService";
import { syncContributions } from "../../src/services/syncService";
import { createMagnumClient } from "@magnum/shared/api/endpoints";
import { type TrustTier } from "@magnum/shared/constants";
import { radii, spacing, text as textTokens } from "../../src/theme/tokens";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

const THEME_OPTIONS: { key: ThemeMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "system", label: "System", icon: "phone-portrait-outline" },
  { key: "light", label: "Light", icon: "sunny-outline" },
  { key: "dark", label: "Dark", icon: "moon-outline" },
];

interface UserKarma {
  user_id: string;
  karma: number;
  tier: TrustTier;
  tier_label: string;
  upvotes_received: number;
  downvotes_received: number;
  trace_count: number;
  feature_count: number;
  revision_count: number;
}

export default function ProfileScreen() {
  const { colors } = useTheme();
  const contributor = useAuthStore((s) => s.contributorName);
  const isIpContributor = useAuthStore((s) => s.isIpContributor);
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const logout = useAuthStore((s) => s.logout);
  const pending = useOfflineStore((s) => s.pendingCount);
  const isOnline = useOfflineStore((s) => s.isOnline);
  const syncState = useOfflineStore((s) => s.syncState);
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);

  const [items, setItems] = useState<PendingItem[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [karma, setKarma] = useState<UserKarma | null>(null);

  const refreshPending = useCallback(async () => {
    const pending = await getPendingContributions();
    setItems(pending as PendingItem[]);
  }, []);

  useEffect(() => {
    void refreshPending();
  }, [refreshPending, pending]);

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    let cancelled = false;
    const client = createMagnumClient(API_URL, {
      getAuthToken: () => useAuthStore.getState().token ?? undefined,
    });
    client.getMe().catch(async (e: unknown) => {
      if (cancelled) return;
      const status =
        e && typeof e === "object" && "status" in e ? (e as { status: number }).status : 0;
      if (status === 401 || status === 404) {
        await logout();
        router.replace("/auth/login");
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isAuthenticated, logout]);

  useEffect(() => {
    if (!user?.id) {
      setKarma(null);
      return;
    }
    const client = createMagnumClient(API_URL, {
      getAuthToken: () => useAuthStore.getState().token ?? undefined,
    });
    client
      .getUserKarma(user.id)
      .then((k) => setKarma(k as unknown as UserKarma))
      .catch(() => setKarma(null));
  }, [user?.id]);

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
      style={[styles.container, { backgroundColor: colors.bg }]}
      contentContainerStyle={styles.content}
      testID="profile-screen"
    >
      <Card>
        <Text style={[textTokens.h3, { color: colors.textMuted }]}>Account</Text>
        {isAuthenticated && user ? (
          <View>
            <Text style={[textTokens.bodyStrong, { color: colors.text }]} testID="profile-username">
              {user.username}
            </Text>
            <Text style={[textTokens.meta, { color: colors.textMuted, marginTop: spacing.xxs }]}>
              {user.email}
            </Text>
            <View
              style={[
                styles.roleBadge,
                {
                  backgroundColor: user.role === "admin"
                    ? colors.dangerMuted
                    : user.role === "moderator"
                    ? colors.primaryMuted
                    : colors.surfaceMuted,
                  borderColor: user.role === "admin"
                    ? colors.danger
                    : user.role === "moderator"
                    ? colors.primary
                    : colors.border,
                },
              ]}
              testID="profile-role"
            >
              <Text
                style={[
                  textTokens.small,
                  {
                    color: user.role === "admin"
                      ? colors.danger
                      : user.role === "moderator"
                      ? colors.primary
                      : colors.textSecondary,
                  },
                ]}
              >
                {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
              </Text>
            </View>
            <View style={styles.buttonRow}>
              <Button
                onPress={handleLogout}
                variant="secondary"
                size="small"
                testID="profile-logout"
              >
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
            <Text style={[textTokens.bodyStrong, { color: colors.text }]} testID="profile-contributor">
              {contributor}
            </Text>
            <Text style={[textTokens.meta, { color: colors.textMuted, marginTop: spacing.xxs }]}>
              {isIpContributor ? "Editing as your IP address" : "Editing anonymously"}
            </Text>
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
            {isIpContributor ? (
              <Text
                style={[
                  textTokens.meta,
                  { color: colors.textSecondary, marginTop: spacing.sm, fontStyle: "italic" },
                ]}
                testID="profile-ip-note"
              >
                Your edits are publicly attributed to your IP address. Create an account to use a
                username instead.
              </Text>
            ) : null}
          </View>
        )}
      </Card>

      <Card>
        <Text style={[textTokens.h3, { color: colors.textMuted }]}>Appearance</Text>
        <View style={styles.themeRow}>
          {THEME_OPTIONS.map((opt) => {
            const active = theme === opt.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => setTheme(opt.key)}
                style={({ pressed }) => [
                  styles.themeChip,
                  {
                    backgroundColor: active ? colors.primary : colors.surfaceMuted,
                    borderColor: active ? colors.primary : colors.border,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
                testID={`profile-theme-${opt.key}`}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
              >
                <Ionicons
                  name={opt.icon}
                  size={16}
                  color={active ? colors.textInverse : colors.textSecondary}
                />
                <Text
                  style={[
                    textTokens.small,
                    { color: active ? colors.textInverse : colors.textSecondary },
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card>
        <Text style={[textTokens.h3, { color: colors.textMuted }]}>Status</Text>
        <Text style={[textTokens.bodyStrong, { color: colors.text }]} testID="profile-status">
          {isOnline ? (syncState === "syncing" ? "Syncing..." : "Online") : "Offline"}
        </Text>
        <Text style={[textTokens.meta, { color: colors.textMuted, marginTop: spacing.xxs }]}>
          {pending} pending change(s)
        </Text>
      </Card>

      {karma ? (
        <Card testID="profile-karma">
          <Text style={[textTokens.h3, { color: colors.textMuted }]}>Karma</Text>
          <View style={styles.karmaRow}>
            <Text style={[styles.karmaValue, { color: colors.primary }]} testID="profile-karma-value">
              {karma.karma.toFixed(0)}
            </Text>
            <TrustTierBadge tier={karma.tier} size="medium" testID="profile-tier-badge" />
          </View>
          <View style={styles.karmaStats}>
            <View style={[styles.karmaStat, { backgroundColor: colors.surfaceMuted }]}>
              <Text style={[styles.karmaStatValue, { color: colors.text }]}>
                {karma.upvotes_received}
              </Text>
              <Text style={[styles.karmaStatLabel, { color: colors.textMuted }]}>
                {String.fromCharCode(8593)} received
              </Text>
            </View>
            <View style={[styles.karmaStat, { backgroundColor: colors.surfaceMuted }]}>
              <Text style={[styles.karmaStatValue, { color: colors.text }]}>
                {karma.trace_count}
              </Text>
              <Text style={[styles.karmaStatLabel, { color: colors.textMuted }]}>traces</Text>
            </View>
            <View style={[styles.karmaStat, { backgroundColor: colors.surfaceMuted }]}>
              <Text style={[styles.karmaStatValue, { color: colors.text }]}>
                {karma.feature_count}
              </Text>
              <Text style={[styles.karmaStatLabel, { color: colors.textMuted }]}>features</Text>
            </View>
            <View style={[styles.karmaStat, { backgroundColor: colors.surfaceMuted }]}>
              <Text style={[styles.karmaStatValue, { color: colors.text }]}>
                {karma.revision_count}
              </Text>
              <Text style={[styles.karmaStatLabel, { color: colors.textMuted }]}>edits</Text>
            </View>
          </View>
        </Card>
      ) : user ? (
        <Card>
          <Text style={[textTokens.h3, { color: colors.textMuted }]}>Karma</Text>
          <Text style={[textTokens.meta, { color: colors.textMuted }]}>
            Sign in to track your karma and trust tier.
          </Text>
        </Card>
      ) : null}

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
  container: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md },
  buttonRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  themeRow: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.sm },
  themeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  karmaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  karmaValue: { fontSize: 32, fontWeight: "700" },
  karmaStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  karmaStat: {
    flex: 1,
    minWidth: 70,
    padding: spacing.sm,
    borderRadius: radii.sm,
  },
  karmaStatValue: { fontSize: 18, fontWeight: "600" },
  karmaStatLabel: { fontSize: 10 },
  roleBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radii.sm,
    borderWidth: 1,
    marginTop: spacing.xs,
  },
});
