import type { Map as OlMap } from "ol";
import BaseLayer from "ol/layer/Base.js";
import { createBaseLayer } from "./BasemapLayer.js";
import type { BaseLayerDef } from "../shared/config.js";

export const BASEMAP_LAYER_NAME = "basemap";

export function applyBaseLayer(
  map: OlMap,
  defs: BaseLayerDef[],
  activeId: string,
): void {
  const def =
    defs.find((d) => d.id === activeId) ?? defs[0];
  if (!def) return;
  const newLayer = createBaseLayer(def);
  newLayer.set("name", BASEMAP_LAYER_NAME);
  const layers = map.getLayers();
  const list = layers.getArray();
  const existingIndex = list.findIndex(
    (l) => l.get("name") === BASEMAP_LAYER_NAME,
  );
  if (existingIndex >= 0) {
    list[existingIndex]!.dispose();
    layers.setAt(existingIndex, newLayer);
    return;
  }
  layers.insertAt(0, newLayer);
}

export function findBasemapLayer(map: OlMap): BaseLayer | null {
  const list = map.getLayers().getArray();
  for (const l of list) {
    if (l.get("name") === BASEMAP_LAYER_NAME) return l;
  }
  return null;
}
