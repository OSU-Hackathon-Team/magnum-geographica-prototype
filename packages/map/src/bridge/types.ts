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
        apiUrl?: string | null;
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
  | {
      method: "setOfflineBaseLayer";
      args: {
        kind: "mvt" | "raster";
        tilesPath: string;
        minZoom: number;
        maxZoom: number;
        active: boolean;
      };
    }
  | { method: "enterDrawMode"; args: {} }
  | { method: "exitDrawMode"; args: {} }
  | {
      method: "setLiveRoute";
      args: {
        coordinates: Array<[number, number]>;
        followLon?: number | null;
        followLat?: number | null;
      };
    }
  | { method: "clearLiveRoute"; args: {} }
  | {
      method: "setShape";
      args: {
        rings: Array<{ vertices: Array<[number, number]>; closed: boolean }>;
      };
    }
  | {
      method: "fitBounds";
      args: {
        minLon: number;
        minLat: number;
        maxLon: number;
        maxLat: number;
        padding?: number;
        duration?: number;
        maxZoom?: number;
      };
    }
  | { method: "refreshTiles"; args: { version: number } }
  | { method: "setHeatmapVisible"; args: { visible: boolean } }
  | {
      method: "setLine";
      args: {
        rings: Array<{ vertices: Array<[number, number]>; closed: boolean }>;
      };
    }
  | {
      method: "setHighlightTrace";
      args: {
        id: string;
        coordinates: Array<[number, number]>;
        color?: string;
      };
    }
  | { method: "clearHighlightTrace"; args: {} }
  | {
      method: "setTraceSegments";
      args: {
        segments: Array<{
          id: string;
          coordinates: Array<[number, number]>;
          proposed_trail_id?: string | null;
          color?: string;
        }>;
      };
    }
  | { method: "clearTraceSegments"; args: {} };

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
  | {
      type: "shapeHit";
      kind: "vertex" | "edge" | "empty";
      ringIndex: number;
      vertexIndex: number;
      lon: number;
      lat: number;
    }
  | { type: "shapeDrag"; ringIndex: number; vertexIndex: number; lon: number; lat: number }
  | { type: "error"; message: string };

export type BridgeMethod = BridgeCommand["method"];
