import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { createMagnumClient, type HierarchyTreeNode } from "@magnum/shared";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

/**
 * §21.5 — the hierarchy tree view (`systems/tree`).
 *
 * Super-systems → systems → sub-systems. Each node is collapsible; tapping
 * a system row navigates to its detail page. The "Loose systems" bucket
 * holds systems that aren't in any super-system. The "+" in the header
 * takes the user to the system create form (Phase 3.7).
 */
export default function HierarchyTreeScreen() {
  const router = useRouter();
  const [nodes, setNodes] = useState<HierarchyTreeNode[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTree = useCallback(async () => {
    try {
      const client = createMagnumClient(API_URL);
      const res = await client.getHierarchyTree();
      setNodes(res.nodes as HierarchyTreeNode[]);
    } catch {
      // ignore — offline read-only fallback could go here
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchTree();
  }, [fetchTree]);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  return (
    <View style={styles.container} testID="hierarchy-tree-screen">
      <Stack.Screen options={{ title: "Hierarchy" }} />
      <View style={styles.header}>
        <Text style={styles.heading}>Hierarchy</Text>
        <Pressable
          style={styles.newBtn}
          onPress={() => router.push("/system/new" as never)}
          testID="hierarchy-new-system"
        >
          <Ionicons name="add" size={20} color="#fff" />
        </Pressable>
      </View>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#22c55e" />
        </View>
      ) : nodes.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.hint}>
            No systems yet. Tap + to create the first one.
          </Text>
        </View>
      ) : (
        <FlatList
          data={nodes}
          keyExtractor={(n) => n.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void fetchTree();
              }}
            />
          }
          renderItem={({ item: sup }) => (
            <View style={styles.superBlock}>
              <Pressable
                style={styles.superHeader}
                onPress={() => toggle(sup.id)}
                testID={`tree-super-${sup.slug}`}
              >
                <Ionicons
                  name={expanded[sup.id] ? "chevron-down" : "chevron-forward"}
                  size={18}
                  color="#22c55e"
                />
                <Text style={styles.superName}>{sup.name}</Text>
                {sup.id === "__loose__" ? (
                  <Text style={styles.looseBadge}>Loose</Text>
                ) : null}
              </Pressable>
              {expanded[sup.id] !== false ? (
                <View style={styles.children}>
                  {sup.children.length === 0 ? (
                    <Text style={styles.hint}>No systems here yet.</Text>
                  ) : (
                    sup.children.map((sys) => (
                      <View key={sys.id}>
                        <Pressable
                          style={styles.systemRow}
                          onPress={() => router.push(`/system/${sys.slug}` as never)}
                          testID={`tree-system-${sys.slug}`}
                        >
                          <Ionicons
                            name="git-network"
                            size={16}
                            color="#3b82f6"
                          />
                          <Text style={styles.systemName}>{sys.name}</Text>
                          {sys.children.length > 0 ? (
                            <Pressable
                              onPress={(e) => {
                                e.stopPropagation?.();
                                toggle(sys.id);
                              }}
                              hitSlop={8}
                              testID={`tree-system-toggle-${sys.slug}`}
                            >
                              <Ionicons
                                name={
                                  expanded[sys.id] ? "chevron-down" : "chevron-forward"
                                }
                                size={16}
                                color="#888"
                              />
                            </Pressable>
                          ) : null}
                        </Pressable>
                        {expanded[sys.id] && sys.children.length > 0 ? (
                          <View style={styles.subChildren}>
                            {sys.children.map((sub) => (
                              <Pressable
                                key={sub.id}
                                style={styles.subRow}
                                onPress={() =>
                                  router.push(`/system/${sys.slug}#sub-${sub.id}` as never)
                                }
                                testID={`tree-sub-${sub.slug}`}
                              >
                                <Ionicons name="ellipse" size={12} color="#888" />
                                <Text style={styles.subName}>{sub.name}</Text>
                              </Pressable>
                            ))}
                          </View>
                        ) : null}
                      </View>
                    ))
                  )}
                </View>
              ) : null}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
  },
  heading: { fontSize: 18, fontWeight: "700" },
  newBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#22c55e",
    alignItems: "center",
    justifyContent: "center",
  },
  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
  superBlock: { gap: 4 },
  superHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
  },
  superName: { fontSize: 14, fontWeight: "700", color: "#0f172a", flex: 1 },
  looseBadge: {
    fontSize: 10,
    color: "#f59e0b",
    backgroundColor: "#fef3c7",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  children: {
    paddingLeft: 16,
    gap: 4,
    borderLeftWidth: 1,
    borderLeftColor: "#e5e7eb",
    marginLeft: 8,
  },
  systemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  systemName: { fontSize: 14, fontWeight: "600", color: "#1e293b", flex: 1 },
  subChildren: { paddingLeft: 16, gap: 2 },
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  subName: { fontSize: 12, color: "#475569" },
  hint: { color: "#888", fontSize: 13, padding: 12 },
});
