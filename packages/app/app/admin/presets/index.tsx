import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { createMagnumClient, PRESET_CATEGORY_LABELS, type Preset, type PresetCategory } from "@magnum/shared";
import { useAuthStore } from "../../../src/stores/authStore";
import { useTheme } from "../../../src/providers/ThemeProvider";
import { Card } from "../../../src/components/ui/Card";
import { Button } from "../../../src/components/ui/Button";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export default function AdminPresetsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPresets = useCallback(async () => {
    setError(null);
    try {
      const client = createMagnumClient(API_URL, {
        getAuthToken: () => token ?? undefined,
      });
      const result = await client.raw.request<{ items: Preset[] }>("GET", "/api/presets");
      setPresets(result.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, [token]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await fetchPresets();
      setLoading(false);
    })();
  }, [fetchPresets]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchPresets();
    setRefreshing(false);
  }, [fetchPresets]);

  const handleDelete = useCallback(
    (p: Preset) => {
      Alert.alert(
        "Delete preset",
        `Delete "${p.label}"? Features using it will be unlinked (preset_id = null).`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                const client = createMagnumClient(API_URL, {
                  getAuthToken: () => token ?? undefined,
                });
                await client.raw.request("DELETE", `/api/presets/${p.id}`);
                await fetchPresets();
              } catch (e) {
                Alert.alert("Error", e instanceof Error ? e.message : "Failed to delete");
              }
            },
          },
        ],
      );
    },
    [fetchPresets, token],
  );

  const renderItem = useCallback(
    ({ item }: { item: Preset }) => (
      <Card testID={`admin-preset-${item.key}`}>
        <View style={styles.row}>
          <Ionicons
            name={(item.icon_name as never) ?? "ellipse"}
            size={28}
            color={item.icon_color}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>{item.label}</Text>
            <Text style={[styles.meta, { color: colors.textMuted }]}>
              {PRESET_CATEGORY_LABELS[item.category as PresetCategory] ?? item.category} ·{" "}
              {item.questions.length} question{item.questions.length === 1 ? "" : "s"}
              {item.upstreamable ? " · upstreamable" : ""}
            </Text>
          </View>
          <Button
            size="small"
            variant="secondary"
            testID={`admin-preset-edit-${item.key}`}
            onPress={() => router.push(`/admin/presets/${item.id}`)}
          >
            Edit
          </Button>
          <Pressable onPress={() => handleDelete(item)} style={styles.deleteBtn} testID={`admin-preset-delete-${item.key}`}>
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
          </Pressable>
        </View>
      </Card>
    ),
    [handleDelete, router],
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]} testID="admin-presets">
      <Stack.Screen options={{ title: "Presets" }} />
      <View style={styles.header}>
        <Text style={styles.heading}>Presets ({presets.length})</Text>
        <Button
          size="small"
          variant="primary"
          testID="admin-preset-new"
          onPress={() => router.push("/admin/presets/new")}
        >
          New
        </Button>
      </View>
      {loading && presets.length === 0 ? (
        <View style={[styles.centered, { backgroundColor: colors.bg }]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error && presets.length === 0 ? (
        <View style={styles.centered}>
          <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={presets}
          keyExtractor={(p) => p.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={[styles.hint, { color: colors.textMuted }]}>No presets yet.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  heading: { fontSize: 18, fontWeight: "700" },
  list: { padding: 16, gap: 8, paddingBottom: 32 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  label: { fontSize: 15, fontWeight: "600" },
  meta: { fontSize: 11, marginTop: 2 },
  deleteBtn: { padding: 6 },
  errorText: { fontSize: 12 },
  hint: { fontSize: 13 },
});
