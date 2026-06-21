import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { createMagnumClient, type Feature } from "@magnum/shared";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export default function FeatureDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [feature, setFeature] = useState<Feature | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || typeof id !== "string") return;
    const client = createMagnumClient(API_URL);
    client
      .getFeature(id)
      .then(setFeature)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, [id]);

  if (error) {
    return (
      <View style={styles.centered} testID="feature-detail-error">
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }
  if (!feature) {
    return (
      <View style={styles.centered} testID="feature-detail-loading">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: feature.name, headerShown: true }} />
      <ScrollView style={styles.container} testID="feature-detail-screen">
        <View style={styles.section} testID="feature-meta">
          <Text style={styles.title} testID="feature-name">{feature.name}</Text>
          <Text style={styles.badge}>{feature.type_tag}</Text>
          {feature.description ? <Text style={styles.body}>{feature.description}</Text> : null}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { color: "#ef4444", padding: 16 },
  section: { padding: 16, gap: 8 },
  title: { fontSize: 22, fontWeight: "700" },
  body: { fontSize: 14, color: "#444", lineHeight: 20 },
  badge: {
    fontSize: 12,
    color: "#666",
    backgroundColor: "#f1f1f1",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: "flex-start",
  },
});
