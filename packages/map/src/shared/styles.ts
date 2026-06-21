import { SURFACE_COLORS, DIFFICULTY_COLORS, FEATURE_ICONS } from "@magnum/shared/constants";

export const TRAIL_STROKE_WIDTH = 3;
export const SYSTEM_FILL_OPACITY = 0.08;
export const SYSTEM_STROKE_WIDTH = 1.5;
export const FEATURE_ICON_SIZE = 14;

export function trailStrokeFor(surface: string | null | undefined): string {
  if (!surface) return SURFACE_COLORS.natural;
  return (SURFACE_COLORS as Record<string, string>)[surface] ?? SURFACE_COLORS.natural;
}

export function difficultyFillFor(difficulty: string | null | undefined): string {
  if (!difficulty) return DIFFICULTY_COLORS.easy;
  return (DIFFICULTY_COLORS as Record<string, string>)[difficulty] ?? DIFFICULTY_COLORS.easy;
}

export function featureLabelFor(typeTag: string | null | undefined): string {
  if (!typeTag) return "?";
  return FEATURE_ICONS[typeTag as keyof typeof FEATURE_ICONS] ?? "?";
}
