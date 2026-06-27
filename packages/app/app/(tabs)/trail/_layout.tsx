import { Stack } from "expo-router";
import { useTheme } from "@/providers/ThemeProvider";

export default function TrailLayout() {
  const { colors } = useTheme();
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
    </Stack>
  );
}
