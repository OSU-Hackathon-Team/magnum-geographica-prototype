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
    ].includes(t)
  );
}
