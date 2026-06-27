import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MapContainer } from "@magnum/map";
import { createMagnumClient, type System, type Trail, type WikiPage } from "@magnum/shared";
import { Card } from "@/components/ui/Card";
import { Tabs } from "@/components/ui/Tabs";
import { OverflowMenu, type OverflowMenuItem } from "@/components/ui/OverflowMenu";
import { StatusPill } from "@/components/ui/StatusPill";
import { Button } from "@/components/ui/Button";
import { DifficultyBadge } from "@/components/ui/DifficultyBadge";
import { ViewOnMapButton } from "@/components/ui/ViewOnMapButton";
import { Section } from "@/components/ui/Section";
import { SystemHeader } from "@/components/system/SystemHeader";
import { WikiPageView } from "@/components/wiki/WikiPageView";
import { MoveToSheet } from "@/components/hierarchy/MoveToSheet";
import { TrailTracesTab } from "@/components/trace/TrailTracesTab";
import { useTheme } from "@/providers/ThemeProvider";
import { getAllDownloadedSystems } from "@/services/offlineDataService";
import { useOfflineStore } from "@/stores/offlineStore";
import { radii, spacing, text as textTokens } from "@/theme/tokens";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
const MARTIN_URL = process.env.EXPO_PUBLIC_MARTIN_URL ?? "http://localhost:3001";

type TabKey = "overview" | "trails" | "traces" | "wiki";

const TABS: Array<{ key: TabKey; label: string; testID: string }> = [
  { key: "overview", label: "Overview", testID: "system-tab-overview" },
  { key: "trails", label: "Trails", testID: "system-tab-trails" },
  { key: "traces", label: "Traces", testID: "system-tab-traces" },
  { key: "wiki", label: "Wiki", testID: "system-tab-wiki" },
];

function SystemMapPreview({
  center,
  boundary,
}: {
  center?: { lon: number; lat: number } | null;
  boundary?: unknown;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.mapPreview,
        { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
      ]}
    >
      <MapContainer
        config={{
          martinTilesUrl: MARTIN_URL,
          initialCenter: center ? [center.lon, center.lat] : [-82.9988, 39.9612],
          initialZoom: 10,
        }}
        fitGeometry={boundary ?? null}
      />
    </View>
  );
}

export default function SystemDetail() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const [system, setSystem] = useState<System | null>(null);
  const [trails, setTrails] = useState<Trail[]>([]);
  const [wikiPage, setWikiPage] = useState<WikiPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOfflineAvailable, setIsOfflineAvailable] = useState(false);
  const [showMoveTo, setShowMoveTo] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [savingDescription, setSavingDescription] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const isOnline = useOfflineStore((s) => s.isOnline);
  const offlineRegions = useOfflineStore((s) => s.offlineRegions);

  useFocusEffect(
    useCallback(() => {
      if (!slug || typeof slug !== "string") return;
      const client = createMagnumClient(API_URL);

      if (!isOnline) {
        getAllDownloadedSystems()
          .then((localSystems) => {
            const found = localSystems.find(
              (s: Record<string, unknown>) => String(s.slug) === slug,
            );
            if (found) {
              setSystem({
                id: String(found.id),
                name: String(found.name),
                slug: String(found.slug),
                description: null,
                boundary: null,
                ownership_source: null,
                source_date: null,
                external_url: null,
                created_at: "",
                updated_at: "",
              } as System);
              setIsOfflineAvailable(true);
            } else {
              setError("Offline and not downloaded");
            }
          })
          .catch(() => setError("Offline and not downloaded"));
        return;
      }

      client
        .getSystemBySlug(slug)
        .then(async (s) => {
          setSystem(s);
          const [t, w] = await Promise.all([
            client.listSystemTrails(s.id).catch(() => ({ items: [] as Trail[], total: 0 })),
            client.getWikiPage("system", s.id).catch(() => null),
          ]);
          setTrails(t.items);
          if (w) setWikiPage(w as WikiPage);

          getAllDownloadedSystems()
            .then((localSystems) => {
              const found = localSystems.some(
                (ls: Record<string, unknown>) => String(ls.id) === s.id,
              );
              setIsOfflineAvailable(found);
            })
            .catch(() => {});
        })
        .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"));
    }, [slug, isOnline]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!system) return;
      getAllDownloadedSystems()
        .then((localSystems) => {
          const found = localSystems.some(
            (s: Record<string, unknown>) => String(s.id) === system.id,
          );
          setIsOfflineAvailable(found);
        })
        .catch(() => {});
    }, [offlineRegions, system]),
  );

  const handleSaveDescription = async () => {
    if (!system) return;
    setSavingDescription(true);
    try {
      const client = createMagnumClient(API_URL);
      const updated = await client.updateSystem(system.id, {
        description: descriptionDraft || undefined,
      });
      setSystem(updated);
      setEditingDescription(false);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingDescription(false);
    }
  };

  if (error) {
    return (
      <View style={styles.centered} testID="system-detail-error">
        <Stack.Screen options={{ title: slug ?? "System", headerShown: true }} />
        <Ionicons name="alert-circle-outline" size={36} color={colors.danger} />
        <Text style={[textTokens.body, { color: colors.danger, marginTop: spacing.sm }]}>
          {error}
        </Text>
      </View>
    );
  }
  if (!system) {
    return (
      <View style={styles.centered} testID="system-detail-loading">
        <Stack.Screen options={{ title: "Loading…" }} />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const overflowItems: OverflowMenuItem[] = [
    {
      label: "Edit boundary",
      icon: "map-outline",
      onPress: () =>
        router.push(`/system/boundary?mode=edit&slug=${system.slug}` as never),
      testID: "system-edit-boundary",
    },
    {
      label: "Move to…",
      icon: "git-merge-outline",
      onPress: () => setShowMoveTo(true),
      disabled: !isOnline,
      testID: "system-move-to",
    },
    {
      label: "Organize traces",
      icon: "git-compare-outline",
      onPress: () => router.push(`/system/${system.slug}/organize` as never),
      testID: "system-organize",
    },
  ];

  return (
    <>
      <Stack.Screen
        options={{
          title: system.name,
          headerShown: true,
          headerRight: () => (
            <OverflowMenu items={overflowItems} testID="system-overflow" />
          ),
        }}
      />
      <View style={[styles.root, { backgroundColor: colors.bg }]} testID="system-detail-screen">
        <SystemHeader system={system} isOfflineAvailable={isOfflineAvailable} />
        <SystemMapPreview center={system.center} boundary={system.boundary} />
        <View style={styles.ctaRow}>
          <ViewOnMapButton
            center={system.center ?? null}
            zoom={10}
            testID="system-view-on-map"
          />
        </View>
        <Tabs
          tabs={TABS}
          active={activeTab}
          onChange={(k) => setActiveTab(k as TabKey)}
          accessory={
            activeTab === "traces" && trails.length === 0 ? null : null
          }
        />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          testID={`system-tab-${activeTab}-content`}
        >
          {activeTab === "overview" ? (
            <OverviewTab
              system={system}
              editingDescription={editingDescription}
              setEditingDescription={setEditingDescription}
              descriptionDraft={descriptionDraft}
              setDescriptionDraft={setDescriptionDraft}
              savingDescription={savingDescription}
              onSaveDescription={handleSaveDescription}
            />
          ) : null}
          {activeTab === "trails" ? (
            <TrailsTab
              trails={trails}
              onOpen={(t) => router.push(`/trail/${t.slug}` as never)}
            />
          ) : null}
          {activeTab === "traces" ? (
            <View style={styles.tabContent} testID="system-traces-tab">
              <TrailTracesTab
                systemId={system.id}
                testID="system-traces-tab-content"
              />
            </View>
          ) : null}
          {activeTab === "wiki" ? (
            <WikiTab
              system={system}
              wikiPage={wikiPage}
              onEdit={() =>
                router.push({
                  pathname: "/wiki/edit/system/[targetId]" as never,
                  params: { targetId: system.id, defaultTitle: system.name },
                } as never)
              }
            />
          ) : null}
        </ScrollView>
      </View>
      <MoveToSheet
        visible={showMoveTo}
        onClose={() => setShowMoveTo(false)}
        sourceSystemId={system.id}
        sourceName={system.name}
        onMoved={() => router.replace(`/system/${slug}` as never)}
        testID="system-move-to-sheet"
      />
    </>
  );
}

function OverviewTab({
  system,
  editingDescription,
  setEditingDescription,
  descriptionDraft,
  setDescriptionDraft,
  savingDescription,
  onSaveDescription,
}: {
  system: System;
  editingDescription: boolean;
  setEditingDescription: (v: boolean) => void;
  descriptionDraft: string;
  setDescriptionDraft: (v: string) => void;
  savingDescription: boolean;
  onSaveDescription: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View testID="system-overview">
      <Section
        title="About"
        action={
          !editingDescription ? (
            <Button
              variant="ghost"
              size="small"
              onPress={() => {
                setDescriptionDraft(system.description ?? "");
                setEditingDescription(true);
              }}
              testID="system-description-edit"
            >
              {system.description ? "Edit" : "Add"}
            </Button>
          ) : null
        }
      >
        {editingDescription ? (
          <View style={styles.editBox}>
            <TextInput
              style={[
                styles.textArea,
                {
                  backgroundColor: colors.surfaceMuted,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
              value={descriptionDraft}
              onChangeText={setDescriptionDraft}
              placeholder="Describe this system…"
              multiline
              textAlignVertical="top"
              testID="system-description-input"
            />
            <View style={styles.editActions}>
              <Button
                variant="ghost"
                size="small"
                onPress={() => setEditingDescription(false)}
                testID="system-description-cancel"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="small"
                onPress={onSaveDescription}
                disabled={savingDescription}
                testID="system-description-save"
              >
                {savingDescription ? "Saving…" : "Save"}
              </Button>
            </View>
          </View>
        ) : system.description ? (
          <Text style={[textTokens.body, { color: colors.textSecondary }]}>
            {system.description}
          </Text>
        ) : (
          <Text
            style={[textTokens.body, { color: colors.textMuted, fontStyle: "italic" }]}
            testID="system-description-empty"
          >
            No description yet. Tap &ldquo;Add&rdquo; to write the first one.
          </Text>
        )}
      </Section>
    </View>
  );
}

function TrailsTab({ trails, onOpen }: { trails: Trail[]; onOpen: (t: Trail) => void }) {
  const { colors } = useTheme();
  return (
    <View testID="system-trails">
      <Section title={`Trails · ${trails.length}`}>
        {trails.length === 0 ? (
          <Text
            style={[
              textTokens.body,
              { color: colors.textMuted, fontStyle: "italic" },
            ]}
            testID="system-trails-empty"
          >
            No trails yet for this system.
          </Text>
        ) : (
          trails.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => onOpen(t)}
              testID={`system-trail-card-${t.slug}`}
            >
              <Card>
                <View style={styles.cardRow}>
                  <Text
                    style={[textTokens.bodyStrong, { color: colors.text, flex: 1 }]}
                  >
                    {t.name}
                  </Text>
                  {t.difficulty ? <DifficultyBadge difficulty={t.difficulty} /> : null}
                </View>
                {t.length_meters ? (
                  <Text
                    style={[
                      textTokens.meta,
                      { color: colors.textMuted, marginTop: spacing.xxs },
                    ]}
                  >
                    {(t.length_meters / 1000).toFixed(1)} km
                    {t.elevation_gain_meters
                      ? ` · ${t.elevation_gain_meters.toFixed(0)} m gain`
                      : ""}
                  </Text>
                ) : null}
              </Card>
            </Pressable>
          ))
        )}
      </Section>
    </View>
  );
}

function WikiTab({
  system,
  wikiPage,
  onEdit,
}: {
  system: System;
  wikiPage: WikiPage | null;
  onEdit: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View testID="system-wiki">
      <Section
        title="Wiki"
        action={
          <Button
            variant={wikiPage ? "ghost" : "primary"}
            size="small"
            onPress={onEdit}
            testID="system-wiki-edit"
          >
            {wikiPage ? "Edit" : "Create"}
          </Button>
        }
      >
        {wikiPage ? (
          <Pressable onPress={onEdit} testID="system-wiki-view">
            <Card variant="tinted">
              <WikiPageView wikiPage={wikiPage} compact />
            </Card>
          </Pressable>
        ) : (
          <Text
            style={[textTokens.body, { color: colors.textMuted, fontStyle: "italic" }]}
          >
            No wiki page yet for this system.
          </Text>
        )}
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
  },
  mapPreview: {
    height: 200,
    borderBottomWidth: 1,
  },
  ctaRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: spacing.xxxl },
  tabContent: { paddingTop: spacing.sm },
  cardRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  editBox: { gap: spacing.sm },
  textArea: {
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    fontSize: 14,
    minHeight: 100,
  },
  editActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
});
