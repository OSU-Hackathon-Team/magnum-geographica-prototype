export { default as MapContainer } from "./MapContainer.js";
export { default } from "./MapContainer.js";
export type { MapContainerProps } from "./types.js";
export {
  defaultMapConfig,
  defaultBaseLayers,
  resolveBaseLayers,
  resolveDefaultBaseLayerId,
  EOX_SENTINEL2_CLOUDLESS_URL,
  SIMPLIFIED_BASE_LAYER_ID,
  SATELLITE_BASE_LAYER_ID,
  trailsTileUrl,
  segmentsTileUrl,
  systemsTileUrl,
  featuresTileUrl,
  superSystemsTileUrl,
} from "./shared/config.js";
export type {
  MapConfig,
  BaseLayerDef,
  BaseLayerKind,
  MvtBaseLayerDef,
  RasterBaseLayerDef,
} from "./shared/config.js";
export {
  trailStrokeFor,
  difficultyFillFor,
  featureLabelFor,
  annotationPinColor,
  TRAIL_STROKE_WIDTH,
  PSEUDO_TRAIL_LINE_WIDTH,
  PSEUDO_TRAIL_DASH,
  LOW_CONSENSUS_OPACITY,
  BOUNDARY_HANDLE_RADIUS,
  BOUNDARY_HANDLE_STROKE,
  ANNOTATION_PIN_SIZE,
} from "./shared/styles.js";
export { extentFromGeoJSON } from "./shared/extent.js";
export type { BridgeEvent, BridgeCommand, BridgeMethod } from "./bridge/types.js";
export { commandToScript, isBridgeEvent, isBridgeMethod } from "./bridge/ol-bridge.js";
