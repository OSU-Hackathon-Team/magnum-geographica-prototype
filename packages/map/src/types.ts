export interface MapContainerProps {
  config?: {
    martinTilesUrl?: string;
    baseLayers?: import("./shared/config.js").BaseLayerDef[];
    defaultBaseLayerId?: string;
    initialCenter?: [number, number];
    initialZoom?: number;
    minZoom?: number;
    maxZoom?: number;
  };
  baseLayerId?: string;
  onReady?: () => void;
  onClick?: (lon: number, lat: number) => void;
  onLongClick?: (lon: number, lat: number) => void;
  onMoveEnd?: (center: [number, number], zoom: number) => void;
  onFeatureSelect?: (selection: {
    id: string;
    layer: "trails" | "segments" | "systems" | "features" | "superSystems";
    slug?: string | null;
    name?: string | null;
  }) => void;
  flyTo?: { lon: number; lat: number; zoom?: number } | null;
  offlineMode?: boolean;
  offlineData?: {
    trails?: unknown;
    systems?: unknown;
    features?: unknown;
  } | null;
  offlineBaseLayer?: {
    kind: "mvt" | "raster";
    tilesPath: string;
    minZoom: number;
    maxZoom: number;
  } | null;
  drawMode?: boolean;
  onDrawEnd?: (bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number }) => void;
  onMapRef?: (send: (cmd: import("./bridge/types.js").BridgeCommand) => void) => void;
}
