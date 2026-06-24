import { Redirect, Stack } from "expo-router";
import { useAuthStore } from "../../src/stores/authStore";
import { ActivityIndicator, View } from "react-native";

export default function AdminLayout() {
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const isLoading = useAuthStore((s) => s.isLoading);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color="#22c55e" />
      </View>
    );
  }

  if (!isAdmin) {
    return <Redirect href="/(tabs)/explore" />;
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#fff" },
        headerTintColor: "#22c55e",
      }}
    >
      <Stack.Screen name="dashboard" options={{ title: "Admin" }} />
      <Stack.Screen name="revisions" options={{ title: "Revisions" }} />
      <Stack.Screen name="users" options={{ title: "Users" }} />
    </Stack>
  );
}
