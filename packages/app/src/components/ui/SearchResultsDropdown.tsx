import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { System, Trail, Feature } from "@magnum/shared";
import { useTheme } from "../../providers/ThemeProvider";

export interface SearchResults {
  systems: System[];
  trails: Trail[];
  features: Feature[];
}

export interface SearchResultsDropdownProps {
  query: string;
  results: SearchResults | null;
  loading: boolean;
  onSelectSystem: (system: System) => void;
  onSelectTrail: (trail: Trail) => void;
  onSelectFeature: (feature: Feature) => void;
  onDismiss: () => void;
}

export function SearchResultsDropdown({
  query,
  results,
  loading,
  onSelectSystem,
  onSelectTrail,
  onSelectFeature,
  onDismiss,
}: SearchResultsDropdownProps) {
  const { colors } = useTheme();

  if (!query || query.length < 1) return null;

  const systems = results?.systems ?? [];
  const trails = results?.trails ?? [];
  const features = results?.features ?? [];
  const total = systems.length + trails.length + features.length;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          shadowColor: colors.shadow,
        },
      ]}
      testID="search-results"
    >
      {loading ? (
        <Text style={[styles.muted, { color: colors.textMuted }]} testID="search-loading">
          Searching…
        </Text>
      ) : total === 0 ? (
        <Text style={[styles.muted, { color: colors.textMuted }]} testID="search-empty">
          No results for &ldquo;{query}&rdquo;.
        </Text>
      ) : null}

      {systems.length > 0 ? (
        <Section label={`Systems (${systems.length})`} colors={colors}>
          {systems.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => onSelectSystem(s)}
              testID={`search-result-system-${s.slug}`}
              style={({ pressed }) => [
                styles.row,
                pressed && { backgroundColor: colors.surfaceMutedStrong },
              ]}
            >
              <Text style={[styles.title, { color: colors.text }]}>{s.name}</Text>
              {s.description ? (
                <Text numberOfLines={1} style={[styles.subtitle, { color: colors.textSecondary }]}>
                  {s.description}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </Section>
      ) : null}

      {trails.length > 0 ? (
        <Section label={`Trails (${trails.length})`} colors={colors}>
          {trails.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => onSelectTrail(t)}
              testID={`search-result-trail-${t.slug}`}
              style={({ pressed }) => [
                styles.row,
                pressed && { backgroundColor: colors.surfaceMutedStrong },
              ]}
            >
              <Text style={[styles.title, { color: colors.text }]}>{t.name}</Text>
              {t.description ? (
                <Text numberOfLines={1} style={[styles.subtitle, { color: colors.textSecondary }]}>
                  {t.description}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </Section>
      ) : null}

      {features.length > 0 ? (
        <Section label={`Features (${features.length})`} colors={colors}>
          {features.map((f) => (
            <Pressable
              key={f.id}
              onPress={() => onSelectFeature(f)}
              testID={`search-result-feature-${f.id}`}
              style={({ pressed }) => [
                styles.row,
                pressed && { backgroundColor: colors.surfaceMutedStrong },
              ]}
            >
              <Text style={[styles.title, { color: colors.text }]}>{f.name}</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{f.type_tag}</Text>
            </Pressable>
          ))}
        </Section>
      ) : null}

      {total > 0 ? (
        <Pressable
          onPress={onDismiss}
          testID="search-dismiss"
          style={[styles.dismiss, { borderColor: colors.border }]}
        >
          <Text style={[styles.dismissText, { color: colors.primary }]}>Close</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Section({
  label,
  colors,
  children,
}: {
  label: string;
  colors: ReturnType<typeof useTheme>["colors"];
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>{label}</Text>
      <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 56,
    left: 12,
    right: 12,
    borderRadius: 10,
    borderWidth: 1,
    padding: 8,
    maxHeight: 360,
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 6,
    zIndex: 50,
  },
  section: { marginTop: 6 },
  sectionLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  row: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  title: { fontSize: 14, fontWeight: "600" },
  subtitle: { fontSize: 12, marginTop: 2 },
  muted: { fontSize: 13, padding: 10 },
  dismiss: {
    paddingVertical: 8,
    alignItems: "center",
    borderTopWidth: 1,
    marginTop: 6,
  },
  dismissText: { fontWeight: "600" },
});
