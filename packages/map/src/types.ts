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
   * Real-time shape editor (§21.5 boundary editor). When set, the map
   * mounts an editable layer for the in-progress boundary. The
   * editor drives gestures through the existing `onClick` callback
   * (vertex add / edge split / vertex tap) and emits changes via
   * `onShapeChange`. The host screen owns the Shape state and the
   * mode toggle (normal vs delete).
   */
  shape?: {
    rings: Array<{ vertices: Array<[number, number]>; closed: boolean }>;
    /** Edges from the "connect two vertices" gesture. */
    chords: Array<[number, number]>;
    /** "normal" places/adds; "delete" removes. */
    mode: "normal" | "delete";
    /**
     * Position of the vertex the user double-clicked to start a
     * "connect two vertices" gesture. Null when not connecting.
     * Identified by ring+vertex indices (not a global index) so
     * the host can resolve it against its own copy of the rings.
     */
    connectFrom: { ringIndex: number; vertexIndex: number } | null;
  } | null;
  onShapeChange?: (shape: {
    rings: Array<{ vertices: Array<[number, number]>; closed: boolean }>;
    chords: Array<[number, number]>;
    connectFrom: { ringIndex: number; vertexIndex: number } | null;
  }) => void;
}
