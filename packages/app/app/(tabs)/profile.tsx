import { ScrollView, StyleSheet, Text } from "react-native";
import { useAuthStore } from "../../src/stores/authStore";
import { useOfflineStore } from "../../src/stores/offlineStore";
import { Card } from "../../src/components/ui/Card";

export default function ProfileScreen() {
  const contributor = useAuthStore((s) => s.contributorName);
  const setContributor = useAuthStore((s) => s.setContributorName);
  const pending = useOfflineStore((s) => s.pendingCount);
  const isOnline = useOfflineStore((s) => s.isOnline);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Card>
        <Text style={styles.label}>Contributing as</Text>
        <Text style={styles.value}>{contributor}</Text>
        <Text style={styles.hint} onPress={() => setContributor("anonymous")}>
          Tap to reset
        </Text>
      </Card>

      <Card>
        <Text style={styles.label}>Status</Text>
        <Text style={styles.value}>{isOnline ? "Online" : "Offline"}</Text>
        <Text style={styles.sub}>{pending} pending change(s)</Text>
      </Card>

      <Card>
        <Text style={styles.label}>Storage</Text>
        <Text style={styles.value}>0 MB / 500 MB used</Text>
        <Text style={styles.sub}>Download systems to browse offline</Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 16, gap: 12 },
  label: { fontSize: 12, color: "#888", marginBottom: 4 },
  value: { fontSize: 16, fontWeight: "600" },
  sub: { fontSize: 12, color: "#888", marginTop: 4 },
  hint: { fontSize: 12, color: "#22c55e", marginTop: 8 },
});
