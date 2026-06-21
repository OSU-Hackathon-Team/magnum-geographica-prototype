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
  onFeatureSelect?: (selection: {
    id: string;
    layer: "trails" | "segments" | "systems" | "features";
    slug?: string | null;
    name?: string | null;
  }) => void;
  flyTo?: { lon: number; lat: number; zoom?: number } | null;
}
