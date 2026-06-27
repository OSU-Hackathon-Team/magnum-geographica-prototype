import { Stack } from "expo-router";
import { useTheme } from "@/providers/ThemeProvider";

export default function SystemLayout() {
  const { colors, isDark } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="[slug]" />
      <Stack.Screen name="[slug]/organize" options={{ title: "Organize Traces" }} />
      <Stack.Screen name="[slug]/traces/upload" options={{ title: "Upload Trace" }} />
      <Stack.Screen name="new" />
      <Stack.Screen name="boundary" />
    </Stack>
  );
}
