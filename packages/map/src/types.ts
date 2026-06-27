export interface MapContainerProps {
  config?: {
    martinTilesUrl?: string;
    apiUrl?: string;
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
  /**
   * Live route polyline for the recording screen. When set, the map
   * draws a green line connecting these coordinates plus a small dot
   * at the tail, and (optionally) follows the head. Set to an empty
   * array to clear.
   */
  liveRoute?: {
    coordinates: Array<[number, number]>;
    followLon?: number | null;
    followLat?: number | null;
  } | null;
  /**
   * Real-time shape editor. When set, the map mounts a vector layer
   * rendering the rings. Gestures (click, long-press drag) are
   * translated to `ShapeAction` and emitted via `onShapeAction`.
   * The host owns state, mode, and the reducer.
   */
  shape?: { rings: Array<{ vertices: Array<[number, number]>; closed: boolean }> } | null;
  shapeMode?: "normal" | "delete";
  onShapeAction?: (action: import("@magnum/shared").ShapeAction) => void;
  onShapeChange?: (shape: { rings: Array<{ vertices: Array<[number, number]>; closed: boolean }> }) => void;
  /**
   * Synchronous ref to the current shape. Updated by the host
   * immediately when an action is dispatched (before React re-renders).
   * The map reads this ref in gesture handlers so hit-testing always
   * sees the latest shape, even between rapid clicks.
   */
  liveShapeRef?: React.RefObject<{ rings: Array<{ vertices: Array<[number, number]>; closed: boolean }> } | null | undefined>;
  /**
   * GeoJSON geometry to fit the viewport to. When provided, the map
   * will automatically pan/zoom so the entire geometry is visible
   * with comfortable padding. Used by system/trail preview maps.
   * Set to null to clear the fit constraint.
   */
  fitGeometry?: unknown | null;
  /**
   * When true, the traces heatmap overlay is visible on the map.
   * The heatmap shows GPS trace density as a smooth canvas overlay
   * supplied by GET /api/traces/heat.
   */
  showHeatmap?: boolean;
  /**
   * Per-layer tile version counters.  Each increments independently
   * when data in its layer changes on the server.  The map swaps the
   * Martin source slot (0 ↔ 1) only for the affected layer, so
   * editing a system refreshes system tiles without touching trails.
   */
  systemTileVersion?: number;
  trailTileVersion?: number;
  segmentTileVersion?: number;
  featureTileVersion?: number;
  superSystemTileVersion?: number;
}
