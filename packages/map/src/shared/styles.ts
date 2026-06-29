import {
  SURFACE_COLORS,
  DIFFICULTY_COLORS,
  FEATURE_ICONS,
  ANNOTATION_PIN_COLORS,
  PSEUDO_TRAIL_LINE_WIDTH,
  PSEUDO_TRAIL_DASH,
  LOW_CONSENSUS_OPACITY,
  BOUNDARY_HANDLE_RADIUS,
  BOUNDARY_HANDLE_STROKE,
  ANNOTATION_PIN_SIZE,
  type TraceAnnotationType,
} from "@magnum/shared/constants";

export const TRAIL_STROKE_WIDTH = 4;
export const SYSTEM_FILL_OPACITY = 0.25;
export const SYSTEM_STROKE_WIDTH = 2;
export const SUPER_SYSTEM_STROKE_WIDTH = 2;
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

export { PSEUDO_TRAIL_LINE_WIDTH, PSEUDO_TRAIL_DASH, LOW_CONSENSUS_OPACITY, BOUNDARY_HANDLE_RADIUS, BOUNDARY_HANDLE_STROKE, ANNOTATION_PIN_SIZE };

export function annotationPinColor(type: string): string {
  return (ANNOTATION_PIN_COLORS as Record<string, string>)[type] ?? "#9ca3af";
}
