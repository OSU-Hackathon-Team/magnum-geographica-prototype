import { useCallback, useState } from "react";
import { Modal, Pressable, StyleSheet, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../providers/ThemeProvider";
import { hexToRgba } from "../../theme/hexToRgba";
import { radii, spacing, text, elevation } from "../../theme/tokens";

export interface OverflowMenuItem {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
  testID?: string;
}

export interface OverflowMenuProps {
  items: OverflowMenuItem[];
  /** Optional testID for the trigger button. */
  testID?: string;
  /** Tint of the trigger icon. Defaults to text color. */
  tint?: "default" | "primary" | "danger";
}

/**
 * OverflowMenu — the canonical "⋯" menu used on detail-page headers.
 *
 * Replaces ad-hoc rows of "Edit" / "Move to" / "Organize" buttons with
 * a single tappable trigger. Tap → bottom sheet with a list of items.
 * The sheet uses the same surface/elevation/radius tokens as the rest
 * of the app, so the menu visually belongs to the page.
 *
 * Keep items short (verb + target, like "Edit boundary") and prefer a
 * single primary action surfaced elsewhere when one item is far more
 * common than the rest.
 */
export function OverflowMenu({ items, testID, tint = "default" }: OverflowMenuProps) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  const handleItem = useCallback(
    (item: OverflowMenuItem) => {
      setOpen(false);
      // Defer to next tick so the sheet can finish closing before the
      // parent's navigation/modal logic runs.
      setTimeout(() => {
        if (!item.disabled) item.onPress();
      }, 50);
    },
    [],
  );

  const tintColor =
    tint === "primary" ? colors.primary : tint === "danger" ? colors.danger : colors.text;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={12}
        style={({ pressed }) => [
          styles.trigger,
          { backgroundColor: pressed ? colors.surfaceMutedStrong : "transparent" },
        ]}
        testID={testID ?? "overflow-menu-trigger"}
        accessibilityLabel="More actions"
        accessibilityRole="button"
      >
        <Ionicons name="ellipsis-horizontal" size={22} color={tintColor} />
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        testID={testID ? `${testID}-modal` : undefined}
      >
        <Pressable
          style={[styles.backdrop, { backgroundColor: hexToRgba(colors.shadow, 0.45) }]}
          onPress={() => setOpen(false)}
          testID={testID ? `${testID}-backdrop` : "overflow-menu-backdrop"}
          accessibilityLabel="Close menu"
        >
          <Pressable
            // Stop propagation so taps inside the sheet don't dismiss.
            onPress={() => undefined}
            style={[
              styles.sheet,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
              elevation.sheet,
            ]}
            testID={testID ? `${testID}-sheet` : "overflow-menu-sheet"}
          >
            {items.map((item, i) => {
              const isLast = i === items.length - 1;
              const itemColor = item.destructive ? colors.danger : colors.text;
              return (
                <Pressable
                  key={`${item.label}-${i}`}
                  onPress={() => handleItem(item)}
                  disabled={item.disabled}
                  testID={item.testID ?? `overflow-menu-item-${i}`}
                  style={({ pressed }) => [
                    styles.item,
                    {
                      borderBottomColor: colors.divider,
                      borderBottomWidth: isLast ? 0 : 1,
                      backgroundColor: pressed ? colors.surfaceMutedStrong : "transparent",
                      opacity: item.disabled ? 0.4 : 1,
                    },
                  ]}
                >
                  {item.icon ? (
                    <Ionicons
                      name={item.icon}
                      size={18}
                      color={itemColor}
                      style={styles.itemIcon}
                    />
                  ) : null}
                  <Text style={[text.bodyStrong, { color: itemColor, flex: 1 }]}>{item.label}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
  },
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    marginHorizontal: spacing.sm,
    marginBottom: spacing.xl,
    borderRadius: radii.xl,
    borderWidth: 1,
    overflow: "hidden",
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  itemIcon: {},
});
