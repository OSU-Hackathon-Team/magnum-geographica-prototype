// Design tokens — single source of truth for spacing, typography, color,
// radii, and elevation across the app. Use these instead of hard-coded
// values so the system feels coherent and can be re-themed in one place.
//
// Color tokens live in `./colors.ts` and are theme-aware (light/dark).
// Static tokens (spacing, type, radii, elevation) are the same in both
// themes.

import type { TextStyle } from "react-native";

// ─── Spacing ────────────────────────────────────────────────────────────
// A 4-pt scale. Names map to a "tightness" gradient so call sites read
// like English: `gap.md` is "a normal gap", `gap.xl` is "a generous one".
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
} as const;
export type SpacingKey = keyof typeof spacing;

// ─── Typography ─────────────────────────────────────────────────────────
// Two font families (system + monospace) on a small modular scale. Use
// `text.title` for page-level hero text, `text.h2` for section headings,
// `text.h3` for labels, `text.body` for paragraphs, `text.meta` for
// secondary detail, `text.label` for buttons and chrome.
export const text = {
  title: { fontSize: 22, fontWeight: "700" as const, letterSpacing: -0.3 },
  h2: { fontSize: 17, fontWeight: "700" as const, letterSpacing: -0.1 },
  h3: {
    fontSize: 12,
    fontWeight: "700" as const,
    letterSpacing: 0.6,
    textTransform: "uppercase" as const,
  },
  body: { fontSize: 14, fontWeight: "400" as const, lineHeight: 20 },
  bodyStrong: { fontSize: 14, fontWeight: "600" as const, lineHeight: 20 },
  meta: { fontSize: 12, fontWeight: "500" as const, lineHeight: 16 },
  label: { fontSize: 14, fontWeight: "600" as const, letterSpacing: 0.1 },
  small: { fontSize: 12, fontWeight: "600" as const },
  button: { fontSize: 14, fontWeight: "600" as const },
  buttonSmall: { fontSize: 12, fontWeight: "600" as const },
} satisfies Record<string, TextStyle>;
export type TextKey = keyof typeof text;

// ─── Radii ──────────────────────────────────────────────────────────────
// One corner-radius per surface type. Larger surfaces (sheets) get larger
// radii; controls (buttons, inputs) are small enough to feel "tappable".
export const radii = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 10,
  xl: 12,
  xxl: 16,
  pill: 999,
} as const;
export type RadiusKey = keyof typeof radii;

// ─── Elevation ──────────────────────────────────────────────────────────
// Three shadow recipes. `card` is barely-there separation; `sheet` is a
// real modal; `fab` is a floating action button (more lift).
export const elevation = {
  none: {
    shadowColor: "transparent",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  card: {
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  sheet: {
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 12,
  },
  fab: {
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 6,
  },
} as const;
export type ElevationKey = keyof typeof elevation;

// ─── FAB (floating action button) ───────────────────────────────────────
// Standard FAB size. The "+" system-list button used to be 36px — too
// small to feel like the other FABs in the app. Always 48.
export const fab = {
  size: 48,
  offset: 16,
} as const;
