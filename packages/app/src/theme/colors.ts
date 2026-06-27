// Color palette — theme-aware. Single source of truth for every color
// used by the system flow. Components should import from this module
// (or `useTheme()`) instead of inlining hex codes.
//
// Naming follows Tailwind-ish semantic roles: `bg`, `surface`, `text`,
// `primary`, etc. The two themes differ in neutrals; the green/amber/
// red semantic colors stay consistent because they encode meaning
// (success / warning / error), not just decoration.

export interface ThemeColors {
  // Backgrounds
  bg: string; // page background (white in light, near-black in dark)
  surface: string; // raised surface (cards, sheets)
  surfaceMuted: string; // subtle surface (search bar, input bg)
  surfaceMutedStrong: string; // hover / active surface (chips, rows)
  surfaceTint: string; // tinted background (success/warning banners)

  // Text
  text: string; // primary text
  textSecondary: string; // body / descriptions
  textMuted: string; // meta / captions
  textInverse: string; // text on primary-colored backgrounds
  textOnTint: string; // text on tinted (green) backgrounds

  // Borders & dividers
  border: string;
  borderStrong: string;
  divider: string;

  // Brand
  primary: string; // brand green
  primaryMuted: string; // brand green at 12% (for tints, pill backgrounds)
  primaryStrong: string; // brand green hover/pressed

  // Semantic
  success: string;
  successMuted: string;
  warning: string;
  warningMuted: string;
  danger: string;
  dangerMuted: string;

  // Shadows
  shadow: string; // iOS shadow color (RN shadowColor)
}

export const lightColors: ThemeColors = {
  bg: "#ffffff",
  surface: "#ffffff",
  surfaceMuted: "#f8fafc",
  surfaceMutedStrong: "#f1f5f9",
  surfaceTint: "#f0fdf4",

  text: "#0f172a",
  textSecondary: "#334155",
  textMuted: "#64748b",
  textInverse: "#ffffff",
  textOnTint: "#14532d",

  border: "#e2e8f0",
  borderStrong: "#cbd5e1",
  divider: "#e2e8f0",

  primary: "#22c55e",
  primaryMuted: "#22c55e22",
  primaryStrong: "#16a34a",

  success: "#16a34a",
  successMuted: "#dcfce7",
  warning: "#d97706",
  warningMuted: "#fef3c7",
  danger: "#dc2626",
  dangerMuted: "#fee2e2",

  shadow: "#0f172a",
};

export const darkColors: ThemeColors = {
  bg: "#0a0a0a",
  surface: "#171717",
  surfaceMuted: "#1f1f1f",
  surfaceMutedStrong: "#262626",
  surfaceTint: "#052e1a",

  text: "#f5f5f5",
  textSecondary: "#cbd5e1",
  textMuted: "#94a3b8",
  textInverse: "#0a0a0a",
  textOnTint: "#bbf7d0",

  border: "#2a2a2a",
  borderStrong: "#3f3f46",
  divider: "#262626",

  primary: "#22c55e",
  primaryMuted: "#22c55e33",
  primaryStrong: "#4ade80",

  success: "#22c55e",
  successMuted: "#052e1a",
  warning: "#f59e0b",
  warningMuted: "#422006",
  danger: "#ef4444",
  dangerMuted: "#450a0a",

  shadow: "#000000",
};
