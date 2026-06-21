import { useEffect, useRef } from "react";
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

export default function MapContainer({ config, onReady, onClick }: MapContainerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const merged = { ...defaultMapConfig, ...config };
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

    const map = new Map({
      target: containerRef.current,
      layers,
      view: new View({ center: fromLonLat(center), zoom, minZoom, maxZoom }),
    });
    mapRef.current = map;

    map.on("click", (evt) => {
      if (!onClick) return;
      const [lon, lat] = toLonLat(evt.coordinate);
      if (typeof lon === "number" && typeof lat === "number") {
        onClick(lon, lat);
      }
    });

    onReady?.();

    return () => {
      map.setTarget(undefined);
      mapRef.current = null;
    };
  }, [config, onClick, onReady]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
