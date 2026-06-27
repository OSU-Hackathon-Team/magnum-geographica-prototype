import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { createMagnumClient } from "@magnum/shared";
import { FeatureForm, type FeatureFormData } from "../../src/components/feature/FeatureForm";
import { useTheme } from "../../src/providers/ThemeProvider";
import { useOfflineStore } from "../../src/stores/offlineStore";
import { useAuthStore } from "../../src/stores/authStore";
import { addPendingContribution, getPendingCount } from "../../src/services/offlineDataService";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export default function CreateFeatureScreen() {
  const { lon, lat, systemId, trailId } = useLocalSearchParams<{
    lon: string;
    lat: string;
    systemId?: string;
    trailId?: string;
  }>();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOnline = useOfflineStore((s) => s.isOnline);
  const setPendingCount = useOfflineStore((s) => s.setPendingCount);
  const contributorName = useAuthStore((s) => s.contributorName);
  const { colors } = useTheme();

  const parsedLon = Number(lon);
  const parsedLat = Number(lat);

  const handleSave = async (data: FeatureFormData) => {
    setSaving(true);
    setError(null);

    const payload: Record<string, unknown> = {
      name: data.name,
      description: data.description,
      point: { type: "Point", coordinates: [data.lon, data.lat] },
      system_id: data.system_id,
      trail_id: data.trail_id,
    };
    if (data.preset_id) {
      payload.preset_id = data.preset_id;
      if (data.answers) payload.answers = data.answers;
    } else if (data.type_tag) {
      payload.type_tag = data.type_tag;
    }

    if (!isOnline) {
      try {
        await addPendingContribution("feature", "create", payload, contributorName || "anonymous");
        const newCount = await getPendingCount();
        setPendingCount(newCount);
        router.back();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to queue");
      } finally {
        setSaving(false);
      }
      return;
    }

    try {
      const client = createMagnumClient(API_URL);
      await client.createFeature(payload as Parameters<typeof client.createFeature>[0]);
      router.back();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to create feature";
      if (/network|fetch|timeout/i.test(msg)) {
        try {
          await addPendingContribution(
            "feature",
            "create",
            payload,
            contributorName || "anonymous",
          );
          const newCount = await getPendingCount();
          setPendingCount(newCount);
          router.back();
        } catch {
          setError(msg);
        }
      } else {
        setError(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: "Add Feature", headerBackTitle: "Map" }} />
      {error ? (
        <View style={[styles.errorBanner, { backgroundColor: colors.dangerMuted }]} testID="create-feature-error">
          <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
        </View>
      ) : null}
      {!isOnline ? (
        <View style={[styles.offlineBanner, { backgroundColor: colors.warningMuted }]} testID="create-feature-offline-banner">
          <Text style={[styles.offlineText, { color: colors.warning }]}>
            Offline — feature will be saved locally and synced when back online.
          </Text>
        </View>
      ) : null}
      <FeatureForm
        initialLon={parsedLon}
        initialLat={parsedLat}
        initialSystemId={systemId || null}
        initialTrailId={trailId || null}
        onSave={handleSave}
        saving={saving}
        submitLabel="Create Feature"
        testID="create-feature-form"
      />
    </>
  );
}

const styles = StyleSheet.create({
  errorBanner: { padding: 10 },
  errorText: { fontSize: 13 },
  offlineBanner: { padding: 10 },
  offlineText: { fontSize: 12 },
});
