import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { System, Trail, Feature } from "@magnum/shared";

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
  if (!query || query.length < 1) return null;

  const systems = results?.systems ?? [];
  const trails = results?.trails ?? [];
  const features = results?.features ?? [];
  const total = systems.length + trails.length + features.length;

  return (
    <View style={styles.container} testID="search-results">
      {loading ? (
        <Text style={styles.muted} testID="search-loading">Searching…</Text>
      ) : total === 0 ? (
        <Text style={styles.muted} testID="search-empty">No results for &ldquo;{query}&rdquo;.</Text>
      ) : null}

      {systems.length > 0 ? (
        <Section label={`Systems (${systems.length})`}>
          {systems.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => onSelectSystem(s)}
              testID={`search-result-system-${s.slug}`}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <Text style={styles.title}>{s.name}</Text>
              {s.description ? (
                <Text numberOfLines={1} style={styles.subtitle}>
                  {s.description}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </Section>
      ) : null}

      {trails.length > 0 ? (
        <Section label={`Trails (${trails.length})`}>
          {trails.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => onSelectTrail(t)}
              testID={`search-result-trail-${t.slug}`}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <Text style={styles.title}>{t.name}</Text>
              {t.description ? (
                <Text numberOfLines={1} style={styles.subtitle}>
                  {t.description}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </Section>
      ) : null}

      {features.length > 0 ? (
        <Section label={`Features (${features.length})`}>
          {features.map((f) => (
            <Pressable
              key={f.id}
              onPress={() => onSelectFeature(f)}
              testID={`search-result-feature-${f.id}`}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <Text style={styles.title}>{f.name}</Text>
              <Text style={styles.subtitle}>{f.type_tag}</Text>
            </Pressable>
          ))}
        </Section>
      ) : null}

      {total > 0 ? (
        <Pressable onPress={onDismiss} testID="search-dismiss" style={styles.dismiss}>
          <Text style={styles.dismissText}>Close</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
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
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#eee",
    padding: 8,
    maxHeight: 360,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 6,
    zIndex: 50,
  },
  section: { marginTop: 6 },
  sectionLabel: {
    fontSize: 11,
    color: "#888",
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
  rowPressed: { backgroundColor: "#f1f1f1" },
  title: { fontSize: 14, fontWeight: "600", color: "#111" },
  subtitle: { fontSize: 12, color: "#666", marginTop: 2 },
  muted: { color: "#888", fontSize: 13, padding: 10 },
  dismiss: { paddingVertical: 8, alignItems: "center", borderTopWidth: 1, borderColor: "#eee", marginTop: 6 },
  dismissText: { color: "#22c55e", fontWeight: "600" },
});
