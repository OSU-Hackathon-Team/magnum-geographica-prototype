import { useEffect, useMemo, useRef } from "react";
import { Map, View } from "ol";
import type { Layer } from "ol/layer.js";
import TileLayer from "ol/layer/Tile.js";
import OSM from "ol/source/OSM.js";
import "ol/ol.css";
import { fromLonLat, toLonLat } from "ol/proj.js";
import { defaultMapConfig } from "./shared/config.js";
import { createTrailsLayer } from "./layers/TrailsLayer.js";
import { createSystemsLayer } from "./layers/SystemsLayer.js";
import { createFeaturesLayer } from "./layers/FeaturesLayer.js";
import type { MapContainerProps } from "./types.js";

export type { MapContainerProps };

const LAYER_NAME_BY_LAYER = {
  trails: "trails",
  segments: "segments",
  systems: "systems",
  features: "features",
} as const;

type FeatureSelectLayer = (typeof LAYER_NAME_BY_LAYER)[keyof typeof LAYER_NAME_BY_LAYER];

function readStringId(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

export default function MapContainer({ config, onReady, onClick, onFeatureSelect, flyTo }: MapContainerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const onReadyRef = useRef(onReady);
  const onClickRef = useRef(onClick);
  const onFeatureSelectRef = useRef(onFeatureSelect);
  onReadyRef.current = onReady;
  onClickRef.current = onClick;
  onFeatureSelectRef.current = onFeatureSelect;

  const merged = useMemo(() => ({ ...defaultMapConfig, ...config }), [config]);

  useEffect(() => {
    if (!containerRef.current) return;

    const baseTileUrl = merged.baseTileUrl ?? defaultMapConfig.baseTileUrl;
    const center = merged.initialCenter ?? defaultMapConfig.initialCenter;
    const zoom = merged.initialZoom ?? defaultMapConfig.initialZoom;
    const minZoom = merged.minZoom ?? defaultMapConfig.minZoom;
    const maxZoom = merged.maxZoom ?? defaultMapConfig.maxZoom;

    const layers: Layer[] = [new TileLayer({ source: new OSM({ url: baseTileUrl }) })];

    const systemsLayer = createSystemsLayer(merged);
    if (systemsLayer) layers.push(systemsLayer);
    const trailsLayer = createTrailsLayer(merged);
    if (trailsLayer) layers.push(trailsLayer);
    const featuresLayer = createFeaturesLayer(merged);
    if (featuresLayer) layers.push(featuresLayer);

    if (mapRef.current) {
      const view = mapRef.current.getView();
      view.setCenter(fromLonLat(center));
      view.setZoom(zoom);
      view.setMinZoom(minZoom);
      view.setMaxZoom(maxZoom);
      return;
    }

    const map = new Map({
      target: containerRef.current,
      layers,
      view: new View({ center: fromLonLat(center), zoom, minZoom, maxZoom }),
    });
    mapRef.current = map;

    map.on("click", (evt) => {
      const pixel = map.getEventPixel(evt.originalEvent);
      const hit = map.forEachFeatureAtPixel(pixel, (feature, layer) => {
        if (!feature) return null;
        const layerName = (layer as { get?: (k: string) => unknown } | undefined)?.get?.("name");
        if (typeof layerName !== "string") return null;
        const id = readStringId(feature.get("id"));
        if (!id) return null;
        const slug = readStringId(feature.get("slug"));
        const name = readStringId(feature.get("name"));
        const matched = (Object.values(LAYER_NAME_BY_LAYER) as string[]).find((n) => n === layerName);
        if (!matched) return null;
        return { id, layer: matched as FeatureSelectLayer, slug, name };
      });

      if (hit) {
        onFeatureSelectRef.current?.(hit);
        return;
      }

      if (!onClickRef.current) return;
      const [lon, lat] = toLonLat(evt.coordinate);
      if (typeof lon === "number" && typeof lat === "number") {
        onClickRef.current(lon, lat);
      }
    });

    onReadyRef.current?.();

    return () => {
      map.setTarget(undefined);
      mapRef.current = null;
    };
  }, [merged]);

  useEffect(() => {
    if (!mapRef.current || !flyTo) return;
    const view = mapRef.current.getView();
    view.animate({
      center: fromLonLat([flyTo.lon, flyTo.lat]),
      zoom: typeof flyTo.zoom === "number" ? flyTo.zoom : view.getZoom(),
      duration: 500,
    });
  }, [flyTo]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
