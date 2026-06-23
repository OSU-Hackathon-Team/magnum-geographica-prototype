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
export { trailStrokeFor, difficultyFillFor, featureLabelFor, TRAIL_STROKE_WIDTH } from "./shared/styles.js";
export type { BridgeEvent, BridgeCommand, BridgeMethod } from "./bridge/types.js";
export { commandToScript, isBridgeEvent, isBridgeMethod } from "./bridge/ol-bridge.js";
