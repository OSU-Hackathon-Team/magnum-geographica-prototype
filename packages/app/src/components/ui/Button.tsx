import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import type { ReactNode } from "react";

export interface ButtonProps {
  title?: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost";
  size?: "small" | "medium";
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  children?: ReactNode;
}

export function Button({
  title,
  onPress,
  variant = "primary",
  size = "medium",
  disabled,
  style,
  testID,
  children,
}: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        styles[size],
        styles[variant],
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
        style,
      ]}
      testID={testID}
    >
      {typeof children === "string" ? (
        <Text
          style={[styles.text, styles[`${variant}Text` as const], styles[`${size}Text` as const]]}
        >
          {children}
        </Text>
      ) : children !== undefined ? (
        children
      ) : (
        <Text
          style={[styles.text, styles[`${variant}Text` as const], styles[`${size}Text` as const]]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 4,
  },
  small: { paddingVertical: 6, paddingHorizontal: 12 },
  medium: { paddingVertical: 10, paddingHorizontal: 16 },
  primary: { backgroundColor: "#22c55e" },
  secondary: { backgroundColor: "#e5e5e5" },
  ghost: { backgroundColor: "transparent" },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.4 },
  text: { fontSize: 14, fontWeight: "600" },
  smallText: { fontSize: 12 },
  mediumText: { fontSize: 14 },
  primaryText: { color: "#fff" },
  secondaryText: { color: "#111" },
  ghostText: { color: "#22c55e" },
});
