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
}
