import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../providers/ThemeProvider";
import { radii, spacing, text } from "../../theme/tokens";

export interface TabDescriptor {
  key: string;
  label: string;
  testID?: string;
}

export interface TabsProps {
  tabs: TabDescriptor[];
  active: string;
  onChange: (key: string) => void;
  /**
   * Optional accessory rendered on the right side of the tab bar
   * (e.g. a counter pill or a small "New" button).
   */
  accessory?: ReactNode;
}

/**
 * Tabs — a horizontal tab strip that sticks under the page header.
 *
 * Used on the system detail page to separate Overview / Trails /
 * Traces / Wiki without nesting them in one giant scroll. The active
 * tab is marked with a 2px primary underline; inactive tabs use
 * muted text. The strip is horizontally scrollable so it survives
 * narrow viewports and a long list of tabs.
 *
 * Why a custom component instead of expo-router nested routes: tabs
 * here are a view switch, not a navigation change — the user is
 * still on the same system, just looking at a different facet.
 */
export function Tabs({ tabs, active, onChange, accessory }: TabsProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: colors.bg, borderBottomColor: colors.divider },
      ]}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {tabs.map((tab) => {
          const isActive = tab.key === active;
          return (
            <Pressable
              key={tab.key}
              onPress={() => onChange(tab.key)}
              testID={tab.testID ?? `tab-${tab.key}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              style={styles.tab}
            >
              <Text
                style={[
                  text.bodyStrong,
                  { color: isActive ? colors.text : colors.textMuted },
                ]}
              >
                {tab.label}
              </Text>
              <View
                style={[
                  styles.indicator,
                  {
                    backgroundColor: isActive ? colors.primary : "transparent",
                  },
                ]}
              />
            </Pressable>
          );
        })}
      </ScrollView>
      {accessory ? <View style={styles.accessory}>{accessory}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "stretch",
    borderBottomWidth: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
  },
  tab: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  indicator: {
    height: 2,
    width: "100%",
    borderRadius: radii.xs,
    position: "absolute",
    bottom: 0,
  },
  accessory: {
    paddingRight: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
});
