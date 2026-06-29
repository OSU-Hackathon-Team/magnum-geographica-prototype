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
   * Line editor (open polyline paths, no closed rings). Reuses the
   * same Shape rendering infrastructure but with path-specific
   * gesture handling (no close gesture, startNewLine action).
   */
  line?: { rings: Array<{ vertices: Array<[number, number]>; closed: boolean }> } | null;
  lineMode?: "add" | "delete";
  onLineAction?: (action: import("@magnum/shared").PathAction) => void;
  liveLineRef?: React.RefObject<{ rings: Array<{ vertices: Array<[number, number]>; closed: boolean }> } | null | undefined>;
  /**
   * Highlight a single trace on the map by rendering its geometry
   * as a colored overlay. Set to null to clear.
   */
  highlightTrace?: {
    id: string;
    coordinates: Array<[number, number]>;
    color?: string;
  } | null;
  /**
   * Render trace segments as colored lines on the map, each with
   * an id and optional trail assignment.
   */
  traceSegments?: Array<{
    id: string;
    coordinates: Array<[number, number]>;
    proposed_trail_id?: string | null;
    color?: string;
  }> | null;
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
  /**
   * §Phase 10 — Trail editor overlay. When set, renders all trails
   * in the system with per-segment styling (surface colors, pseudo
   * dotted lines, annotation pins, boundary handles). Clear to
   * remove the overlay and return to tile-only rendering.
   */
  trailOverlay?: {
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
  } | null;
  editorMode?: "segments" | "trails" | null;
  snapEnabled?: boolean;
  tracesVisible?: boolean;
  onSegmentTap?: (seg: { trail_id: string; segment_sort_order: number; lon: number; lat: number }) => void;
  onBoundaryDrag?: (b: { trail_id: string; boundary_sort_order: number; lon: number; lat: number }) => void;
  onBoundaryLongPress?: (b: { trail_id: string; boundary_sort_order: number }) => void;
  onTrailSplit?: (b: { trail_id: string; lon: number; lat: number }) => void;
  onDrawSelect?: (sel: {
    trace_id?: string | null;
    trail_id?: string | null;
    start_lon: number;
    start_lat: number;
    end_lon: number;
    end_lat: number;
    snapped: boolean;
  }) => void;
}
