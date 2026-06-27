import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import type { ReactNode } from "react";
import { useTheme } from "../../providers/ThemeProvider";
import { radii, spacing, text as textTokens } from "../../theme/tokens";

export interface ButtonProps {
  title?: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "small" | "medium";
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  children?: ReactNode;
}

function nodeIsString(node: ReactNode): node is string {
  return typeof node === "string";
}

/**
 * Button — the app's primary control. Variants map to visual roles:
 * - primary  : brand green; the page's main call to action
 * - secondary: light grey surface; the secondary action
 * - ghost    : transparent; tertiary actions (Edit, Move to, etc.)
 * - danger   : red; destructive actions (Delete, Remove)
 */
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
  const { colors } = useTheme();
  const isDisabled = disabled || !onPress;
  const textStyle = [
    size === "small" ? textTokens.buttonSmall : textTokens.button,
    { color: textColor(variant, colors) },
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
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        size === "small" ? styles.small : styles.medium,
        variant === "primary" && { backgroundColor: colors.primary },
        variant === "secondary" && { backgroundColor: colors.surfaceMutedStrong },
        variant === "ghost" && { backgroundColor: "transparent" },
        variant === "danger" && { backgroundColor: colors.danger },
        pressed && !isDisabled ? styles.pressed : null,
        isDisabled ? styles.disabled : null,
        style,
      ]}
      testID={testID}
    >
      {content}
    </Pressable>
  );
}

function textColor(
  variant: NonNullable<ButtonProps["variant"]>,
  colors: ReturnType<typeof useTheme>["colors"],
): string {
  switch (variant) {
    case "primary":
      return colors.textInverse;
    case "danger":
      return colors.textInverse;
    case "secondary":
      return colors.text;
    case "ghost":
    default:
      return colors.primary;
  }
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.xs,
  },
  small: { paddingVertical: spacing.xs + 2, paddingHorizontal: spacing.md },
  medium: { paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.lg },
  pressed: { opacity: 0.78 },
  disabled: { opacity: 0.4 },
});
