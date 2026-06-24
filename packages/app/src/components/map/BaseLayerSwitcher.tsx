import { useState, useCallback } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useBaseLayerStore } from "../../stores/baseLayerStore";
import type { BaseLayerDef } from "@magnum/map";

interface BaseLayerSwitcherProps {
  layers: BaseLayerDef[];
  testID?: string;
}

const TRIGGER_HEIGHT = 36;
const ITEM_HEIGHT = 40;

export function BaseLayerSwitcher({ layers, testID }: BaseLayerSwitcherProps) {
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

  return (
    <View style={styles.root} testID={testID}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={({ pressed }) => [styles.trigger, pressed && styles.triggerPressed]}
        accessibilityRole="button"
        accessibilityLabel={`Map style: ${active.label}. Tap to change.`}
        testID={testID ? `${testID}-trigger` : undefined}
      >
        <View style={styles.dot}>
          <View
            style={[
              styles.dotInner,
              active.kind === "raster" ? styles.dotInnerRaster : styles.dotInnerMvt,
            ]}
          />
        </View>
        <Text style={styles.triggerLabel} numberOfLines={1}>
          {active.label}
        </Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>

      {open ? (
        <Modal transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable
            style={styles.backdrop}
            onPress={() => setOpen(false)}
            testID={testID ? `${testID}-backdrop` : undefined}
          >
            <Pressable
              style={styles.menu}
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
                      isActive && styles.itemActive,
                      pressed && styles.itemPressed,
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
                      <Text style={styles.itemLabel}>{l.label}</Text>
                      {l.attribution ? (
                        <Text style={styles.itemAttribution} numberOfLines={1}>
                          {l.attribution}
                        </Text>
                      ) : null}
                    </View>
                    {isActive ? <Text style={styles.check}>✓</Text> : null}
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
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  triggerPressed: {
    backgroundColor: "rgba(245,245,245,1)",
  },
  triggerLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#222",
    maxWidth: 110,
  },
  chevron: {
    fontSize: 12,
    color: "#666",
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.15)",
    backgroundColor: "#fff",
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
    backgroundColor: "rgba(0,0,0,0.25)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingTop: 60,
    paddingRight: 12,
  },
  menu: {
    minWidth: 220,
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    shadowColor: "#000",
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
  itemActive: {
    backgroundColor: "rgba(34,197,94,0.08)",
  },
  itemPressed: {
    backgroundColor: "rgba(0,0,0,0.04)",
  },
  itemText: {
    flex: 1,
  },
  itemLabel: {
    fontSize: 14,
    color: "#222",
    fontWeight: "500",
  },
  itemAttribution: {
    fontSize: 11,
    color: "#888",
    marginTop: 1,
  },
  check: {
    fontSize: 14,
    color: "#22c55e",
    fontWeight: "700",
  },
});
