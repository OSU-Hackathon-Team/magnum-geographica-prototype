import { useEffect, useMemo, useRef } from "react";
import { Map, View } from "ol";
import type { Layer } from "ol/layer.js";
import "ol/ol.css";
import { fromLonLat, toLonLat } from "ol/proj.js";
import { defaultMapConfig, resolveBaseLayers, resolveDefaultBaseLayerId } from "./shared/config.js";
import { createTrailsLayer } from "./layers/TrailsLayer.js";
import { createSystemsLayer } from "./layers/SystemsLayer.js";
import { createFeaturesLayer } from "./layers/FeaturesLayer.js";
import { createSuperSystemsLayer } from "./layers/SuperSystemsLayer.js";
import { applyBaseLayer } from "./layers/BaseLayer.js";
import type { MapContainerProps } from "./types.js";

export type { MapContainerProps };

const LAYER_NAME_BY_LAYER = {
  trails: "trails",
  segments: "segments",
  systems: "systems",
  features: "features",
  superSystems: "super_systems",
} as const;

type FeatureSelectLayer = keyof typeof LAYER_NAME_BY_LAYER;

function readStringId(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

export default function MapContainer({
  config,
  baseLayerId,
  onReady,
  onClick,
  onFeatureSelect,
  onMoveEnd,
  flyTo,
  offlineMode: _offlineMode,
  offlineData: _offlineData,
  onMapRef: _onMapRef,
}: MapContainerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const onReadyRef = useRef(onReady);
  const onClickRef = useRef(onClick);
  const onFeatureSelectRef = useRef(onFeatureSelect);
  const onMoveEndRef = useRef(onMoveEnd);
  onReadyRef.current = onReady;
  onClickRef.current = onClick;
  onFeatureSelectRef.current = onFeatureSelect;
  onMoveEndRef.current = onMoveEnd;

  const merged = useMemo(() => ({ ...defaultMapConfig, ...config }), [config]);
  const baseLayerDefs = useMemo(() => resolveBaseLayers(merged), [merged]);
  const defaultBaseLayerId = useMemo(
    () => resolveDefaultBaseLayerId(merged, baseLayerDefs),
    [merged, baseLayerDefs],
  );

  // Create the OpenLayers map exactly once. Camera changes are handled via the
  // flyTo effect below, so this effect intentionally has no reactive deps —
  // we must NOT recreate the map when initialCenter/initialZoom change (that
  // was the root cause of the "map resets between navigation" bug).
  useEffect(() => {
    if (!containerRef.current) return;

    const center = merged.initialCenter ?? defaultMapConfig.initialCenter;
    const zoom = merged.initialZoom ?? defaultMapConfig.initialZoom;
    const minZoom = merged.minZoom ?? defaultMapConfig.minZoom;
    const maxZoom = merged.maxZoom ?? defaultMapConfig.maxZoom;

    const layers: Layer[] = [];

    const superSystemsLayer = createSuperSystemsLayer(merged);
    if (superSystemsLayer) layers.push(superSystemsLayer);
    const trailsLayer = createTrailsLayer(merged);
    if (trailsLayer) layers.push(trailsLayer);
    const systemsLayer = createSystemsLayer(merged);
    if (systemsLayer) layers.push(systemsLayer);
    const featuresLayer = createFeaturesLayer(merged);
    if (featuresLayer) layers.push(featuresLayer);

    const map = new Map({
      target: containerRef.current,
      layers,
      view: new View({ center: fromLonLat(center), zoom, minZoom, maxZoom }),
    });
    mapRef.current = map;

    // Insert the basemap at index 0 so it sits beneath trails/systems/etc.
    // Uses the active id if provided, otherwise the config's default.
    applyBaseLayer(map, baseLayerDefs, defaultBaseLayerId);

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
        const entry = Object.entries(LAYER_NAME_BY_LAYER).find(([, v]) => v === layerName);
        if (!entry?.[0]) return null;
        return { id, layer: entry[0] as FeatureSelectLayer, slug, name };
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

    map.on("moveend", () => {
      const view = map.getView();
      const center = view.getCenter();
      const zoom = view.getZoom();
      if (!center || typeof zoom !== "number") return;
      const [lon, lat] = toLonLat(center);
      if (typeof lon === "number" && typeof lat === "number") {
        onMoveEndRef.current?.([lon, lat], zoom);
        // Expose current view on the container for debugging / E2E tests.
        if (containerRef.current) {
          containerRef.current.dataset.mapCenter = `${lon.toFixed(6)},${lat.toFixed(6)}`;
          containerRef.current.dataset.mapZoom = String(zoom);
        }
      }
    });

    // Keep the OpenLayers canvas sized to its container. Since the map is
    // created once and reused across navigation/overlays, we must notify OL
    // whenever the container dimensions change (e.g. an overlay appearing).
    const resizeObserver =
      typeof ResizeObserver !== "undefined" && containerRef.current
        ? new ResizeObserver(() => {
            map.updateSize();
          })
        : null;
    resizeObserver?.observe(containerRef.current);

    onReadyRef.current?.();

    return () => {
      resizeObserver?.disconnect();
      map.setTarget(undefined);
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap the basemap in place when the active id changes. The map is not
  // recreated — the old layer is disposed and a fresh one is inserted at
  // the same index, preserving z-order with overlays.
  useEffect(() => {
    if (!mapRef.current) return;
    const id = baseLayerId ?? defaultBaseLayerId;
    applyBaseLayer(mapRef.current, baseLayerDefs, id);
  }, [baseLayerId, baseLayerDefs, defaultBaseLayerId]);

  // Pan the camera (animate) when a flyTo target is provided. This is what
  // "View on map" uses — it reuses the existing map instance instead of
  // recreating it. The ref-guard ensures we only animate when the target
  // values actually change, not when the parent passes a new object reference
  // with the same values (which would snap the camera back after user zoom).
  const lastFlyToRef = useRef<{ lon: number; lat: number; zoom?: number } | null>(null);
  useEffect(() => {
    if (!mapRef.current || !flyTo) return;
    const last = lastFlyToRef.current;
    if (last && last.lon === flyTo.lon && last.lat === flyTo.lat && last.zoom === flyTo.zoom)
      return;
    lastFlyToRef.current = flyTo;
    const view = mapRef.current.getView();
    view.animate({
      center: fromLonLat([flyTo.lon, flyTo.lat]),
      zoom: typeof flyTo.zoom === "number" ? flyTo.zoom : view.getZoom(),
      duration: 500,
    });
  }, [flyTo]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
