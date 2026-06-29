import type { BridgeCommand, BridgeEvent, BridgeMethod } from "./types.js";

export function commandToScript(command: BridgeCommand): string {
  const json = JSON.stringify(command.args);
  switch (command.method) {
    case "init":
      return `window.olBridge.init(${json});`;
    case "setViewport":
      return `window.olBridge.setViewport(${json});`;
    case "flyTo":
      return `window.olBridge.flyTo(${json});`;
    case "setTrails":
      return `window.olBridge.setTrails(${json});`;
    case "setSystems":
      return `window.olBridge.setSystems(${json});`;
    case "setFeatures":
      return `window.olBridge.setFeatures(${json});`;
    case "highlightTrail":
      return `window.olBridge.highlightTrail(${json});`;
    case "setOfflineMode":
      return `window.olBridge.setOfflineMode(${json});`;
    case "setOfflineData":
      return `window.olBridge.setOfflineData(${json});`;
    case "setBaseLayer":
      return `window.olBridge.setBaseLayer(${json});`;
    case "setOfflineBaseLayer":
      return `window.olBridge.setOfflineBaseLayer(${json});`;
    case "enterDrawMode":
      return `window.olBridge.enterDrawMode();`;
    case "exitDrawMode":
      return `window.olBridge.exitDrawMode();`;
    case "setLiveRoute":
      return `window.olBridge.setLiveRoute(${json});`;
    case "clearLiveRoute":
      return `window.olBridge.clearLiveRoute();`;
    case "setShape":
      return `window.olBridge.setShape(${json});`;
    case "fitBounds":
      return `window.olBridge.fitBounds(${json});`;
    case "refreshTiles":
      return `window.olBridge.refreshTiles(${json});`;
    case "setHeatmapVisible":
      return `window.olBridge.setHeatmapVisible(${json});`;
    case "setLine":
      return `window.olBridge.setLine(${json});`;
    case "setHighlightTrace":
      return `window.olBridge.setHighlightTrace(${json});`;
    case "clearHighlightTrace":
      return `window.olBridge.clearHighlightTrace();`;
    case "setTraceSegments":
      return `window.olBridge.setTraceSegments(${json});`;
    case "clearTraceSegments":
      return `window.olBridge.clearTraceSegments();`;
    case "setTrailOverlay":
      return `window.olBridge.setTrailOverlay(${json});`;
    case "clearTrailOverlay":
      return `window.olBridge.clearTrailOverlay();`;
    case "setEditorMode":
      return `window.olBridge.setEditorMode(${json});`;
    case "setSnapEnabled":
      return `window.olBridge.setSnapEnabled(${json});`;
    case "setTracesVisible":
      return `window.olBridge.setTracesVisible(${json});`;
    default: {
      const _exhaustive: never = command;
      void _exhaustive;
      return "";
    }
  }
}

export function isBridgeMethod(method: string): method is BridgeMethod {
  return [
    "init",
    "setViewport",
    "flyTo",
    "setTrails",
    "setSystems",
    "setFeatures",
    "highlightTrail",
    "setOfflineMode",
    "setOfflineData",
    "setBaseLayer",
    "setOfflineBaseLayer",
    "enterDrawMode",
    "exitDrawMode",
    "setLiveRoute",
    "clearLiveRoute",
    "setShape",
    "fitBounds",
    "refreshTiles",
    "setHeatmapVisible",
    "setLine",
    "setHighlightTrace",
    "clearHighlightTrace",
      "setTraceSegments",
      "clearTraceSegments",
      "setTrailOverlay",
      "clearTrailOverlay",
      "setEditorMode",
      "setSnapEnabled",
      "setTracesVisible",
    ].includes(method);
}

export function isBridgeEvent(value: unknown): value is BridgeEvent {
  if (!value || typeof value !== "object") return false;
  const t = (value as { type?: unknown }).type;
  return (
    typeof t === "string" &&
    [
      "ready",
      "mapClick",
      "mapLongPress",
      "moveEnd",
      "featureSelect",
      "error",
      "drawEnd",
      "shapeHit",
      "shapeDrag",
      "segmentTap",
      "boundaryDrag",
      "boundaryLongPress",
      "trailSplit",
      "drawSelect",
    ].includes(t)
  );
}
