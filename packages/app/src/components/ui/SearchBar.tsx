import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ClientOnly } from "./ClientOnly";
import { useTheme } from "../../providers/ThemeProvider";
import { radii, spacing, text as textTokens } from "../../theme/tokens";

export interface SearchBarProps extends Omit<TextInputProps, "style"> {
  onChangeText?: (text: string) => void;
  testID?: string;
}

export function SearchBar({ testID, ...props }: SearchBarProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.surfaceMuted },
      ]}
    >
      <ClientOnly fallback={<View style={styles.icon} />}>
        <Ionicons name="search" size={18} color={colors.textMuted} style={styles.icon} />
      </ClientOnly>
      <TextInput
        {...props}
        testID={testID}
        style={[styles.input, { color: colors.text }]}
        placeholderTextColor={colors.textMuted}
        autoCorrect={false}
        autoCapitalize="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    margin: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    height: 40,
  },
  icon: { marginRight: spacing.sm },
  input: { flex: 1, ...textTokens.body },
});
