export type BaseLayerKind = "mvt" | "raster";

export interface BaseLayerDefBase {
  id: string;
  label: string;
  minZoom?: number;
  maxZoom?: number;
  attribution?: string;
}

export type MvtBaseLayerDef = BaseLayerDefBase & {
  kind: "mvt";
  url: string;
};

export type RasterBaseLayerDef = BaseLayerDefBase & {
  kind: "raster";
  url: string;
};

export type BaseLayerDef = MvtBaseLayerDef | RasterBaseLayerDef;

export interface MapConfig {
  martinTilesUrl?: string;
  apiUrl?: string;
  baseLayers?: BaseLayerDef[];
  defaultBaseLayerId?: string;
  initialCenter: [number, number];
  initialZoom: number;
  minZoom: number;
  maxZoom: number;
}

export const SIMPLIFIED_BASE_LAYER_ID = "simplified";
export const SATELLITE_BASE_LAYER_ID = "satellite";

export const EOX_SENTINEL2_CLOUDLESS_URL =
  "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg";

export function defaultBaseLayers(martinTilesUrl: string | undefined): BaseLayerDef[] {
  const simplified: MvtBaseLayerDef = {
    id: SIMPLIFIED_BASE_LAYER_ID,
    label: "Simplified",
    kind: "mvt",
    url: martinTilesUrl ? `${martinTilesUrl}/basemap/{z}/{x}/{y}` : "/basemap/{z}/{x}/{y}",
    minZoom: 2,
    maxZoom: 18,
    attribution: "© OpenStreetMap contributors",
  };
  const satellite: RasterBaseLayerDef = {
    id: SATELLITE_BASE_LAYER_ID,
    label: "Satellite",
    kind: "raster",
    url: EOX_SENTINEL2_CLOUDLESS_URL,
    minZoom: 0,
    maxZoom: 18,
    attribution: "Sentinel-2 cloudless by EOX",
  };
  return [simplified, satellite];
}

export const defaultMapConfig: MapConfig = {
  initialCenter: [-82.9988, 39.9612],
  initialZoom: 6,
  minZoom: 2,
  maxZoom: 18,
};

export function resolveBaseLayers(
  cfg: Pick<MapConfig, "martinTilesUrl" | "baseLayers">,
): BaseLayerDef[] {
  return cfg.baseLayers ?? defaultBaseLayers(cfg.martinTilesUrl);
}

export function resolveDefaultBaseLayerId(
  cfg: Pick<MapConfig, "defaultBaseLayerId">,
  layers: BaseLayerDef[],
): string {
  const requested = cfg.defaultBaseLayerId ?? SIMPLIFIED_BASE_LAYER_ID;
  return layers.some((l) => l.id === requested) ? requested : layers[0]!.id;
}

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

export function superSystemsTileUrl(cfg: MapConfig): string | undefined {
  if (!cfg.martinTilesUrl) return undefined;
  return `${cfg.martinTilesUrl}/super_systems/{z}/{x}/{y}`;
}
