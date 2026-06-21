import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export interface SearchBarProps extends Omit<TextInputProps, "style"> {
  onChangeText?: (text: string) => void;
}

export function SearchBar(props: SearchBarProps) {
  return (
    <View style={styles.container}>
      <Ionicons name="search" size={18} color="#888" style={styles.icon} />
      <TextInput
        {...props}
        style={styles.input}
        placeholderTextColor="#999"
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
    backgroundColor: "#f1f1f1",
    margin: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    height: 40,
  },
  icon: { marginRight: 8 },
  input: { flex: 1, fontSize: 14, color: "#111" },
});
