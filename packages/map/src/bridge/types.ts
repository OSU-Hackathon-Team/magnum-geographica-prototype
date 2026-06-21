export type BridgeCommand =
  | { method: "init"; args: { center?: [number, number]; zoom?: number; martinUrl?: string | null } }
  | { method: "setViewport"; args: { center: [number, number]; zoom: number } }
  | { method: "flyTo"; args: { lon: number; lat: number; zoom?: number } }
  | { method: "setTrails"; args: { geojson: unknown } }
  | { method: "setSystems"; args: { geojson: unknown } }
  | { method: "setFeatures"; args: { geojson: unknown } }
  | { method: "highlightTrail"; args: { id: string | null } };

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
  | { type: "error"; message: string };

export type BridgeMethod = BridgeCommand["method"];
