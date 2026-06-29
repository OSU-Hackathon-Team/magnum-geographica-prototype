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
  | { method: "clearTraceSegments"; args: {} }
  | {
      method: "setTrailOverlay";
      args: {
        trails: Array<{
          id: string;
          name: string;
          color?: string;
          segments: Array<{
            coordinates: Array<[number, number]>;
            surface_type?: string | null;
            is_pseudo_trail?: boolean;
            is_road_connector?: boolean;
            source?: string | null;
            consensus?: number | null;
            sort_order: number;
          }>;
          boundaries: Array<{
            lon: number;
            lat: number;
            sort_order: number;
          }>;
        }>;
        features: Array<{
          id: string;
          name: string;
          lon: number;
          lat: number;
          icon?: string;
        }>;
        annotations: Array<{
          type: string;
          value?: string | null;
          lon: number;
          lat: number;
        }>;
        traces?: Array<{
          id: string;
          coordinates: Array<[number, number]>;
          color?: string;
          transitions: Array<{
            type: string;
            lon: number;
            lat: number;
          }>;
        }>;
      };
    }
  | { method: "clearTrailOverlay"; args: {} }
  | { method: "setEditorMode"; args: { mode: "segments" | "trails" } }
  | { method: "setSnapEnabled"; args: { enabled: boolean } }
  | { method: "setTracesVisible"; args: { visible: boolean } };

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
  | { type: "segmentTap"; trail_id: string; segment_sort_order: number; lon: number; lat: number }
  | {
      type: "boundaryDrag";
      trail_id: string;
      boundary_sort_order: number;
      lon: number;
      lat: number;
    }
  | { type: "boundaryLongPress"; trail_id: string; boundary_sort_order: number }
  | { type: "trailSplit"; trail_id: string; lon: number; lat: number }
  | {
      type: "drawSelect";
      trace_id?: string | null;
      trail_id?: string | null;
      start_lon: number;
      start_lat: number;
      end_lon: number;
      end_lat: number;
      snapped: boolean;
    }
  | { type: "error"; message: string };

export type BridgeMethod = BridgeCommand["method"];
