import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import type { ReactNode } from "react";

export interface ButtonProps {
  title?: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  size?: "small" | "medium";
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  children?: ReactNode;
}

function nodeIsString(node: ReactNode): node is string {
  return typeof node === "string";
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
  const textStyle = [
    styles.text,
    styles[`${variant}Text` as keyof typeof styles],
    styles[`${size}Text` as keyof typeof styles],
  ];

  let content: ReactNode;
  if (children === undefined || children === null) {
    content = <Text style={textStyle}>{title}</Text>;
  } else if (nodeIsString(children)) {
    content = <Text style={textStyle}>{children}</Text>;
  } else if (
    Array.isArray(children) &&
    children.some((c) => nodeIsString(c))
  ) {
    // Mixed children (e.g. icon + text) — wrap in a row and ensure
    // every string child gets its own <Text> wrapper so React Native
    // never sees a raw string outside of <Text>.
    content = (
      <>
        {children.map((child, i) =>
          nodeIsString(child) ? (
            <Text key={i} style={textStyle}>
              {child}
            </Text>
          ) : (
            child
          ),
        )}
      </>
    );
  } else {
    content = children;
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
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
      {content}
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
