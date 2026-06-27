import { Redirect, Stack } from "expo-router";
import { useAuthStore } from "../../src/stores/authStore";
import { ActivityIndicator, View } from "react-native";
import { useTheme } from "../../src/providers/ThemeProvider";

export default function AdminLayout() {
  const { colors } = useTheme();
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const isLoading = useAuthStore((s) => s.isLoading);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!isAdmin) {
    return <Redirect href="/(tabs)/explore" />;
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.primary,
      }}
    >
      <Stack.Screen name="dashboard" options={{ title: "Admin" }} />
      <Stack.Screen name="revisions" options={{ title: "Revisions" }} />
      <Stack.Screen name="users" options={{ title: "Users" }} />
      <Stack.Screen name="patrol" options={{ title: "Patrol" }} />
      <Stack.Screen name="presets" options={{ title: "Presets", headerShown: false }} />
      <Stack.Screen name="presets/[id]" options={{ title: "Preset", headerShown: false }} />
    </Stack>
  );
}
