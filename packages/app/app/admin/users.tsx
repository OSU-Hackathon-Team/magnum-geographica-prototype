import { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  Alert,
  TextInput,
} from "react-native";
import { useTheme } from "../../src/providers/ThemeProvider";
import { Card } from "../../src/components/ui/Card";
import { Button } from "../../src/components/ui/Button";
import { useAuthStore } from "../../src/stores/authStore";
import { createMagnumClient } from "@magnum/shared/api/endpoints";
import type { User } from "@magnum/shared/types";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
const PAGE_SIZE = 20;

export default function AdminUsers() {
  const { colors } = useTheme();
  const token = useAuthStore((s) => s.token);
  const [items, setItems] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");

  const fetchUsers = useCallback(
    async (p: number, q?: string) => {
      setLoading(true);
      try {
        const client = createMagnumClient(API_URL, { getAuthToken: () => token ?? undefined });
        const result = await client.adminListUsers({ page: p, pageSize: PAGE_SIZE, q: q || undefined });
        setItems((prev) => (p === 1 ? result.items : [...prev, ...result.items]));
        setTotal(result.total);
        setPage(p);
      } catch {
        // ignore errors
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    void fetchUsers(1);
  }, [fetchUsers]);

  const handleSearch = () => {
    void fetchUsers(1, search.trim() || undefined);
  };

  const handleBan = async (user: User) => {
    const action = user.role === "banned" ? "unban" : "ban";
    Alert.alert(
      action.charAt(0).toUpperCase() + action.slice(1),
      `${action.charAt(0).toUpperCase() + action.slice(1)} user "${user.username}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: action.charAt(0).toUpperCase() + action.slice(1),
          style: "destructive",
          onPress: async () => {
            try {
              const client = createMagnumClient(API_URL, { getAuthToken: () => token ?? undefined });
              if (user.role === "banned") {
                await client.adminUnbanUser(user.id);
              } else {
                await client.adminBanUser(user.id);
              }
              void fetchUsers(page);
            } catch {
              Alert.alert("Error", `Failed to ${action} user`);
            }
          },
        },
      ],
    );
  };

  const renderItem = ({ item }: { item: User }) => (
    <Card testID={`admin-user-${item.username}`}>
      <View style={styles.userRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.userName}>{item.username}</Text>
          <Text style={[styles.userEmail, { color: colors.textMuted }]}>{item.email}</Text>
          <View style={styles.badges}>
            <Text style={[
              styles.badge,
              item.role === "banned"
                ? [styles.badgeBanned, { backgroundColor: colors.dangerMuted, color: colors.danger }]
                : [styles.badgeRole, { backgroundColor: colors.surfaceMutedStrong, color: colors.textSecondary }],
            ]}>
              {item.role}
            </Text>
            <Text style={[styles.badgeTrust, { backgroundColor: colors.successMuted, color: colors.primary }]}>
              Trust: {item.trust_score.toFixed(2)}
            </Text>
          </View>
        </View>
        <Button
          variant="secondary"
          size="small"
          onPress={() => handleBan(item)}
          testID={`admin-ban-${item.username}`}
        >
          {item.role === "banned" ? "Unban" : "Ban"}
        </Button>
      </View>
    </Card>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]} testID="admin-users">
      <Text style={styles.heading}>Users ({total})</Text>
      <View style={styles.searchRow}>
        <TextInput
          style={[styles.input, { borderColor: colors.border }]}
          value={search}
          onChangeText={setSearch}
          placeholder="Search users..."
          onSubmitEditing={handleSearch}
          testID="admin-user-search"
        />
        <Button onPress={handleSearch} size="small">Search</Button>
      </View>
      {loading && items.length === 0 ? (
        <View style={[styles.centered, { backgroundColor: colors.bg }]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          onEndReached={() => {
            if (items.length < total) void fetchUsers(page + 1);
          }}
          onEndReachedThreshold={0.5}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  heading: { fontSize: 18, fontWeight: "700", padding: 16, paddingBottom: 8 },
  searchRow: { flexDirection: "row", paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    fontSize: 14,
  },
  list: { paddingHorizontal: 16, gap: 8, paddingBottom: 32 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  userRow: { flexDirection: "row", alignItems: "center" },
  userName: { fontSize: 15, fontWeight: "600" },
  userEmail: { fontSize: 12, marginTop: 2 },
  badges: { flexDirection: "row", gap: 6, marginTop: 4 },
  badge: { fontSize: 11, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: "hidden" },
  badgeRole: {},
  badgeBanned: {},
  badgeTrust: {},
});
