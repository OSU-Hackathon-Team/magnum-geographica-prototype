// Convert a `#RRGGBB` (or `#RGB`) hex color to `rgba(r, g, b, alpha)`. Used
// to derive semi-transparent overlays (modal backdrops, scrims, etc.) from
// a single theme-aware source color — typically `colors.shadow` — so the
// same UI element renders consistently in light and dark themes without
// hardcoding a specific rgba.
export function hexToRgba(hex: string, alpha: number): string {
  const cleaned = hex.replace("#", "");
  const expand = cleaned.length === 3
    ? cleaned
        .split("")
        .map((c) => c + c)
        .join("")
    : cleaned;
  const r = parseInt(expand.slice(0, 2), 16);
  const g = parseInt(expand.slice(2, 4), 16);
  const b = parseInt(expand.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
