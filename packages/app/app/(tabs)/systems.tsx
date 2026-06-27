import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { createMagnumClient, type HierarchyTreeNode, type System } from "@magnum/shared";
import { SearchBar } from "../../src/components/ui/SearchBar";
import { Card } from "../../src/components/ui/Card";
import { useTheme } from "../../src/providers/ThemeProvider";
import { useOfflineStore } from "../../src/stores/offlineStore";
import { getAllDownloadedSystems } from "../../src/services/offlineDataService";
import { fab, radii, spacing, text as textTokens } from "../../src/theme/tokens";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

interface SystemGroup {
  id: string;
  name: string;
  slug: string;
  tier: "super" | "loose";
  systems: System[];
}

function flattenSystems(
  node: HierarchyTreeNode,
  into: System[] = [],
): System[] {
  if (node.tier === "system" || node.tier === "sub") {
    into.push({
      id: node.id,
      name: node.name,
      slug: node.slug,
      description: null,
      boundary: null,
      ownership_source: null,
      source_date: null,
      external_url: null,
      created_at: "",
      updated_at: "",
    });
  }
  for (const child of node.children) flattenSystems(child, into);
  return into;
}

function nodeToGroups(nodes: HierarchyTreeNode[]): SystemGroup[] {
  const groups: SystemGroup[] = [];
  for (const sup of nodes) {
    if (sup.tier !== "super") continue;
    const systems: System[] = [];
    for (const sys of sup.children) {
      flattenSystems(sys, systems);
    }
    if (systems.length === 0) continue;
    groups.push({
      id: sup.id,
      name: sup.name,
      slug: sup.slug,
      tier: sup.id === "__loose__" ? "loose" : "super",
      systems,
    });
  }
  return groups;
}

function matchesQuery(group: SystemGroup, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  if (group.name.toLowerCase().includes(needle)) return true;
  return group.systems.some(
    (s) =>
      s.name.toLowerCase().includes(needle) ||
      (s.description?.toLowerCase().includes(needle) ?? false),
  );
}

function filterGroupSystems(group: SystemGroup, q: string): System[] {
  if (!q) return group.systems;
  const needle = q.toLowerCase();
  if (group.name.toLowerCase().includes(needle)) return group.systems;
  return group.systems.filter(
    (s) =>
      s.name.toLowerCase().includes(needle) ||
      (s.description?.toLowerCase().includes(needle) ?? false),
  );
}

export default function SystemsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [groups, setGroups] = useState<SystemGroup[]>([]);
  const [flat, setFlat] = useState<System[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const isOnline = useOfflineStore((s) => s.isOnline);

  const fetchHierarchy = useCallback(async () => {
    try {
      setError(null);
      const client = createMagnumClient(API_URL);
      const res = await client.getHierarchyTree();
      setGroups(nodeToGroups(res.nodes));
    } catch (e) {
      setError((e as Error).message);
      setGroups([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!isOnline) {
      void getAllDownloadedSystems().then((rows) =>
        setFlat(
          rows.map((r) => ({
            id: String(r.id),
            name: String(r.name),
            slug: String(r.slug),
            description: r.description ? String(r.description) : null,
            boundary: null,
            ownership_source: null,
            source_date: null,
            external_url: null,
            created_at: "",
            updated_at: "",
          })),
        ),
      );
      setLoading(false);
      return;
    }
    setLoading(true);
    void fetchHierarchy();
  }, [isOnline, fetchHierarchy]);

  const visibleGroups = useMemo(() => {
    if (!q) return groups;
    return groups
      .filter((g) => matchesQuery(g, q))
      .map((g) => ({ ...g, systems: filterGroupSystems(g, q) }));
  }, [groups, q]);

  const visibleFlat = useMemo(() => {
    if (!q) return flat;
    const needle = q.toLowerCase();
    return flat.filter(
      (s) =>
        s.name.toLowerCase().includes(needle) ||
        (s.description?.toLowerCase().includes(needle) ?? false),
    );
  }, [flat, q]);

  if (!isOnline) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]} testID="systems-screen">
        <View style={styles.header}>
          <SearchBar
            value={q}
            onChangeText={setQ}
            placeholder="Filter systems..."
            testID="systems-search"
          />
        </View>
        <FlatList
          data={visibleFlat}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.list}
          testID="systems-list"
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="cloud-offline-outline" size={32} color={colors.textMuted} />
              <Text style={[textTokens.body, { color: colors.textMuted }]} testID="systems-empty">
                {loading ? "Loading..." : "No downloaded systems yet."}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/system/${item.slug}` as never)}
              testID={`system-card-${item.slug}`}
            >
              <Card>
                <Text style={[textTokens.bodyStrong, { color: colors.text }]}>{item.name}</Text>
                {item.description ? (
                  <Text
                    style={[
                      textTokens.meta,
                      { color: colors.textMuted, marginTop: spacing.xxs },
                    ]}
                    numberOfLines={2}
                  >
                    {item.description}
                  </Text>
                ) : null}
              </Card>
            </Pressable>
          )}
        />
      </View>
    );
  }

  const totalSystems = visibleGroups.reduce((n, g) => n + g.systems.length, 0);
  const allTotal = groups.reduce((n, g) => n + g.systems.length, 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]} testID="systems-screen">
      <View style={styles.header}>
        <SearchBar
          value={q}
          onChangeText={setQ}
          placeholder="Filter systems..."
          testID="systems-search"
        />
        <Pressable
          onPress={() => router.push("/system/boundary?mode=create" as never)}
          testID="systems-new"
          accessibilityLabel="New system"
          style={({ pressed }) => [
            styles.newBtn,
            { backgroundColor: colors.primary },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Ionicons name="add" size={26} color={colors.textInverse} />
        </Pressable>
      </View>
      {loading && groups.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error && groups.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={32} color={colors.danger} />
          <Text
            style={[textTokens.body, { color: colors.danger, marginTop: spacing.sm }]}
            testID="systems-empty"
          >
            Failed to load systems.
          </Text>
        </View>
      ) : groups.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="business-outline" size={40} color={colors.textMuted} />
          <Text
            style={[textTokens.body, { color: colors.textMuted, marginTop: spacing.md }]}
            testID="systems-empty"
          >
            No systems yet. Tap + to create the first one.
          </Text>
        </View>
      ) : (
        <FlatList
          data={visibleGroups}
          keyExtractor={(g) => g.id}
          contentContainerStyle={styles.list}
          testID="systems-list"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void fetchHierarchy();
              }}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="search-outline" size={28} color={colors.textMuted} />
              <Text
                style={[textTokens.body, { color: colors.textMuted }]}
                testID="systems-empty"
              >
                No systems match &ldquo;{q}&rdquo;.
              </Text>
            </View>
          }
          renderItem={({ item: group }) => (
            <View style={styles.group} testID={`systems-group-${group.slug}`}>
              <View
                style={[
                  styles.groupHeader,
                  { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
                ]}
              >
                <Ionicons
                  name={group.tier === "loose" ? "archive-outline" : "git-network-outline"}
                  size={14}
                  color={group.tier === "loose" ? colors.warning : colors.primary}
                />
                <Text
                  style={[
                    textTokens.h3,
                    { color: colors.text, flex: 1 },
                  ]}
                  testID={`systems-group-name-${group.slug}`}
                >
                  {group.name}
                </Text>
                <Text style={[textTokens.meta, { color: colors.textMuted }]}>
                  {group.systems.length} {group.systems.length === 1 ? "system" : "systems"}
                </Text>
              </View>
              <View style={styles.groupChildren}>
                {group.systems.map((s) => (
                  <Pressable
                    key={s.id}
                    onPress={() => router.push(`/system/${s.slug}` as never)}
                    testID={`system-card-${s.slug}`}
                  >
                    <Card>
                      <View style={styles.cardHeader}>
                        <Text
                          style={[textTokens.bodyStrong, { color: colors.text, flex: 1 }]}
                        >
                          {s.name}
                        </Text>
                        <Ionicons
                          name="chevron-forward"
                          size={16}
                          color={colors.textMuted}
                        />
                      </View>
                      {s.description ? (
                        <Text
                          style={[
                            textTokens.meta,
                            { color: colors.textSecondary, marginTop: spacing.xxs },
                          ]}
                          numberOfLines={2}
                        >
                          {s.description}
                        </Text>
                      ) : null}
                    </Card>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        />
      )}
      {allTotal > 0 ? (
        <Text
          style={[
            textTokens.meta,
            styles.foot,
            { color: colors.textMuted, backgroundColor: colors.bg, borderTopColor: colors.divider },
          ]}
          testID="systems-total"
        >
          {q
            ? `${totalSystems} of ${allTotal} ${allTotal === 1 ? "system" : "systems"}`
            : `${allTotal} ${allTotal === 1 ? "system" : "systems"} total`}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: spacing.md,
    paddingTop: spacing.sm,
  },
  newBtn: {
    width: fab.size,
    height: fab.size,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -spacing.xs,
  },
  list: { padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxxl },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
  },
  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
    gap: spacing.sm,
  },
  group: { gap: spacing.sm },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  groupChildren: { gap: spacing.sm },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  foot: {
    textAlign: "center",
    paddingVertical: spacing.md,
    borderTopWidth: 1,
  },
});
