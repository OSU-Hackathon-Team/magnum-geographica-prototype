interface BaseLayerArgsMvt {
  id: string;
  label: string;
  kind: "mvt";
  url: string;
  minZoom?: number;
  maxZoom?: number;
  attribution?: string;
}

interface BaseLayerArgsRaster {
  id: string;
  label: string;
  kind: "raster";
  url: string;
  minZoom?: number;
  maxZoom?: number;
  attribution?: string;
}

export type BaseLayerArgs = BaseLayerArgsMvt | BaseLayerArgsRaster;

export type BridgeCommand =
  | {
      method: "init";
      args: {
        center?: [number, number];
        zoom?: number;
        martinUrl?: string | null;
        baseLayers?: BaseLayerArgs[];
        baseLayerId?: string;
      };
    }
  | { method: "setViewport"; args: { center: [number, number]; zoom: number } }
  | { method: "flyTo"; args: { lon: number; lat: number; zoom?: number } }
  | { method: "setTrails"; args: { geojson: unknown } }
  | { method: "setSystems"; args: { geojson: unknown } }
  | { method: "setFeatures"; args: { geojson: unknown } }
  | { method: "highlightTrail"; args: { id: string | null } }
  | { method: "setOfflineMode"; args: { offline: boolean } }
  | { method: "setOfflineData"; args: { trails?: unknown; systems?: unknown; features?: unknown } }
  | { method: "setBaseLayer"; args: { id: string } }
  | { method: "setOfflineBaseLayer"; args: { kind: "mvt" | "raster"; tilesPath: string; minZoom: number; maxZoom: number; active: boolean } }
  | { method: "enterDrawMode"; args: {} }
  | { method: "exitDrawMode"; args: {} };

export type BridgeEvent =
  | { type: "ready" }
  | { type: "mapClick"; lon: number; lat: number }
  | { type: "mapLongPress"; lon: number; lat: number }
  | { type: "moveEnd"; center: [number, number]; zoom: number }
  | {
      type: "featureSelect";
      id: string;
      layer: string;
      slug?: string | null;
      name?: string | null;
    }
  | { type: "drawEnd"; minLon: number; minLat: number; maxLon: number; maxLat: number }
  | { type: "error"; message: string };

export type BridgeMethod = BridgeCommand["method"];
