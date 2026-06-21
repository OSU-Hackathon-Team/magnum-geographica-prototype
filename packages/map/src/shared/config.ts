export interface MapConfig {
  baseTileUrl: string;
  martinTilesUrl?: string;
  initialCenter: [number, number];
  initialZoom: number;
  minZoom: number;
  maxZoom: number;
}

export const defaultMapConfig: MapConfig = {
  baseTileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  initialCenter: [-82.9988, 39.9612],
  initialZoom: 6,
  minZoom: 2,
  maxZoom: 18,
};

export function trailsTileUrl(cfg: MapConfig): string | undefined {
  if (!cfg.martinTilesUrl) return undefined;
  return `${cfg.martinTilesUrl}/trails/{z}/{x}/{y}`;
}

export function segmentsTileUrl(cfg: MapConfig): string | undefined {
  if (!cfg.martinTilesUrl) return undefined;
  return `${cfg.martinTilesUrl}/segments/{z}/{x}/{y}`;
}

export function systemsTileUrl(cfg: MapConfig): string | undefined {
  if (!cfg.martinTilesUrl) return undefined;
  return `${cfg.martinTilesUrl}/systems/{z}/{x}/{y}`;
}

export function featuresTileUrl(cfg: MapConfig): string | undefined {
  if (!cfg.martinTilesUrl) return undefined;
  return `${cfg.martinTilesUrl}/features/{z}/{x}/{y}`;
}
