import type { MapCenter } from "../types/index.js";

export interface BuildExploreDeepLinkOptions {
  center: MapCenter;
  zoom?: number;
}

export function buildExploreDeepLink({ center, zoom }: BuildExploreDeepLinkOptions): string {
  const params = new URLSearchParams();
  params.set("lat", center.lat.toFixed(6));
  params.set("lon", center.lon.toFixed(6));
  if (typeof zoom === "number" && Number.isFinite(zoom)) {
    params.set("zoom", String(zoom));
  }
  return `/explore?${params.toString()}`;
}
