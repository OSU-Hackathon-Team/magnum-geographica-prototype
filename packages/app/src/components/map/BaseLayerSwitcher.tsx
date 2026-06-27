import { useState, useCallback } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useBaseLayerStore } from "../../stores/baseLayerStore";
import { useTheme } from "../../providers/ThemeProvider";
import type { BaseLayerDef } from "@magnum/map";

interface BaseLayerSwitcherProps {
  layers: BaseLayerDef[];
  testID?: string;
}

const TRIGGER_HEIGHT = 36;
const ITEM_HEIGHT = 40;

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function BaseLayerSwitcher({ layers, testID }: BaseLayerSwitcherProps) {
  const { colors } = useTheme();
  const activeId = useBaseLayerStore((s) => s.baseLayerId);
  const setActiveId = useBaseLayerStore((s) => s.setBaseLayerId);
  const hasHydrated = useBaseLayerStore((s) => s.hasHydrated);
  const [open, setOpen] = useState(false);

  const onPick = useCallback(
    (id: string) => {
      setActiveId(id);
      setOpen(false);
    },
    [setActiveId],
  );

  const active = layers.find((l) => l.id === activeId) ?? layers[0];
  // Don't render until the persisted store has rehydrated — otherwise the
  // label may flash from the default to the user's choice on app launch.
  if (!hasHydrated || !active) return null;

  const shadowRgba08 = hexToRgba(colors.shadow, 0.08);
  const shadowRgba15 = hexToRgba(colors.shadow, 0.15);

  return (
    <View style={styles.root} testID={testID}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={({ pressed }) => [
          styles.trigger,
          {
            backgroundColor: hexToRgba(colors.surface, 0.95),
            borderColor: shadowRgba08,
            shadowColor: colors.shadow,
          },
          pressed && { backgroundColor: colors.surfaceMuted },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Map style: ${active.label}. Tap to change.`}
        testID={testID ? `${testID}-trigger` : undefined}
      >
        <View style={[styles.dot, { backgroundColor: colors.surface, borderColor: shadowRgba15 }]}>
          <View
            style={[
              styles.dotInner,
              active.kind === "raster" ? styles.dotInnerRaster : styles.dotInnerMvt,
            ]}
          />
        </View>
        <Text style={[styles.triggerLabel, { color: colors.text }]} numberOfLines={1}>
          {active.label}
        </Text>
        <Text style={[styles.chevron, { color: colors.textMuted }]}>▾</Text>
      </Pressable>

      {open ? (
        <Modal transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable
            style={[styles.backdrop, { backgroundColor: hexToRgba(colors.shadow, 0.25) }]}
            onPress={() => setOpen(false)}
            testID={testID ? `${testID}-backdrop` : undefined}
          >
            <Pressable
              style={[
                styles.menu,
                {
                  backgroundColor: colors.surface,
                  borderColor: shadowRgba08,
                  shadowColor: colors.shadow,
                },
              ]}
              onPress={() => {
                /* swallow so the menu doesn't close when tapping inside */
              }}
            >
              {layers.map((l) => {
                const isActive = l.id === active.id;
                return (
                  <Pressable
                    key={l.id}
                    onPress={() => onPick(l.id)}
                    style={({ pressed }) => [
                      styles.item,
                      isActive && { backgroundColor: colors.primaryMuted },
                      pressed && { backgroundColor: colors.surfaceMutedStrong },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                    testID={testID ? `${testID}-option-${l.id}` : undefined}
                  >
                    <View
                      style={[
                        styles.dot,
                        l.kind === "raster" ? styles.dotInnerRaster : styles.dotInnerMvt,
                      ]}
                    />
                    <View style={styles.itemText}>
                      <Text style={[styles.itemLabel, { color: colors.text }]}>
                        {l.label}
                      </Text>
                      {l.attribution ? (
                        <Text
                          style={[styles.itemAttribution, { color: colors.textMuted }]}
                          numberOfLines={1}
                        >
                          {l.attribution}
                        </Text>
                      ) : null}
                    </View>
                    {isActive ? (
                      <Text style={[styles.check, { color: colors.primary }]}>✓</Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    top: 12,
    right: 12,
    zIndex: 50,
  },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: TRIGGER_HEIGHT,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  triggerLabel: {
    fontSize: 13,
    fontWeight: "600",
    maxWidth: 110,
  },
  chevron: {
    fontSize: 12,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotInnerMvt: {
    backgroundColor: "#a4c47a",
  },
  dotInnerRaster: {
    backgroundColor: "#3a6f8a",
  },
  backdrop: {
    flex: 1,
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingTop: 60,
    paddingRight: 12,
  },
  menu: {
    minWidth: 220,
    borderRadius: 10,
    paddingVertical: 4,
    borderWidth: 1,
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: ITEM_HEIGHT,
    paddingHorizontal: 12,
  },
  itemText: {
    flex: 1,
  },
  itemLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  itemAttribution: {
    fontSize: 11,
    marginTop: 1,
  },
  check: {
    fontSize: 14,
    fontWeight: "700",
  },
});
