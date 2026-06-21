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

export default function MapContainer({ config, onReady, onClick }: MapContainerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const onReadyRef = useRef(onReady);
  const onClickRef = useRef(onClick);
  onReadyRef.current = onReady;
  onClickRef.current = onClick;

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
      mapRef.current.getView().setCenter(fromLonLat(center));
      mapRef.current.getView().setZoom(zoom);
      mapRef.current.getView().setMinZoom(minZoom);
      mapRef.current.getView().setMaxZoom(maxZoom);
      return;
    }

    const map = new Map({
      target: containerRef.current,
      layers,
      view: new View({ center: fromLonLat(center), zoom, minZoom, maxZoom }),
    });
    mapRef.current = map;

    map.on("click", (evt) => {
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

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
