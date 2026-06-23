export interface MapContainerProps {
  config?: {
    baseTileUrl?: string;
    martinTilesUrl?: string;
    initialCenter?: [number, number];
    initialZoom?: number;
    minZoom?: number;
    maxZoom?: number;
  };
  onReady?: () => void;
  onClick?: (lon: number, lat: number) => void;
  onLongClick?: (lon: number, lat: number) => void;
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
  onMapRef?: (send: (cmd: { method: string; args: unknown }) => void) => void;
}
