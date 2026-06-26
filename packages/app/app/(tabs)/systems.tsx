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
import { useOfflineStore } from "../../src/stores/offlineStore";
import { getAllDownloadedSystems } from "../../src/services/offlineDataService";

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
      <View style={styles.container} testID="systems-screen">
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
            <Text style={styles.empty} testID="systems-empty">
              {loading ? "Loading..." : "No downloaded systems yet."}
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/system/${item.slug}` as never)}
              testID={`system-card-${item.slug}`}
            >
              <Card>
                <Text style={styles.name}>{item.name}</Text>
                {item.description ? <Text style={styles.desc}>{item.description}</Text> : null}
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
    <View style={styles.container} testID="systems-screen">
      <View style={styles.header}>
        <SearchBar
          value={q}
          onChangeText={setQ}
          placeholder="Filter systems..."
          testID="systems-search"
        />
        <View style={styles.headerActions}>
          <Pressable
            style={styles.newBtn}
            onPress={() => router.push("/system/boundary?mode=create" as never)}
            testID="systems-new"
            accessibilityLabel="New system"
          >
            <Ionicons name="add" size={20} color="#fff" />
          </Pressable>
        </View>
      </View>
      {loading && groups.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#22c55e" />
        </View>
      ) : error && groups.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.empty} testID="systems-empty">
            Failed to load systems.
          </Text>
        </View>
      ) : groups.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.empty} testID="systems-empty">
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
            />
          }
          ListEmptyComponent={
            <Text style={styles.empty} testID="systems-empty">
              No systems match "{q}".
            </Text>
          }
          renderItem={({ item: group }) => (
            <View style={styles.group} testID={`systems-group-${group.slug}`}>
              <View style={styles.groupHeader}>
                <Ionicons
                  name={group.tier === "loose" ? "folder-outline" : "git-network"}
                  size={14}
                  color={group.tier === "loose" ? "#f59e0b" : "#22c55e"}
                />
                <Text style={styles.groupName} testID={`systems-group-name-${group.slug}`}>
                  {group.name}
                </Text>
                <Text style={styles.groupCount}>
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
                      <Text style={styles.name}>{s.name}</Text>
                      {s.description ? (
                        <Text style={styles.desc}>{s.description}</Text>
                      ) : null}
                    </Card>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        />
      )}
      <Text style={styles.foot} testID="systems-total">
        {q
          ? `${totalSystems} of ${allTotal} ${allTotal === 1 ? "system" : "systems"}`
          : `${allTotal} ${allTotal === 1 ? "system" : "systems"} total`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: { paddingHorizontal: 12, paddingTop: 8, gap: 8 },
  headerActions: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8 },
  newBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#22c55e",
    alignItems: "center",
    justifyContent: "center",
  },
  list: { padding: 16, gap: 16 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  empty: { textAlign: "center", color: "#888", marginTop: 24 },
  group: { gap: 8 },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  groupName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    flex: 1,
  },
  groupCount: { fontSize: 11, color: "#64748b" },
  groupChildren: { gap: 8 },
  name: { fontSize: 16, fontWeight: "600" },
  desc: { fontSize: 13, color: "#555", marginTop: 4 },
  foot: {
    textAlign: "center",
    fontSize: 11,
    color: "#94a3b8",
    paddingVertical: 8,
  },
});
