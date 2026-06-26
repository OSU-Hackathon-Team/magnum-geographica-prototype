import { useEffect, useMemo, useRef } from "react";
import { Map, View } from "ol";
import type { Layer } from "ol/layer.js";
import "ol/ol.css";
import { fromLonLat, toLonLat, transformExtent } from "ol/proj.js";
import { defaultMapConfig, resolveBaseLayers, resolveDefaultBaseLayerId } from "./shared/config.js";
import { extentFromGeoJSON } from "./shared/extent.js";
import { createTrailsLayer } from "./layers/TrailsLayer.js";
import { createSystemsLayer } from "./layers/SystemsLayer.js";
import { createFeaturesLayer } from "./layers/FeaturesLayer.js";
import { createSuperSystemsLayer } from "./layers/SuperSystemsLayer.js";
import { applyBaseLayer } from "./layers/BaseLayer.js";
import {
  createShapeLayer,
  rebuildShapeSource,
  shapeHitTest,
  SHAPE_VERTEX_RADIUS,
} from "./layers/ShapeLayer.js";
import type { MapContainerProps } from "./types.js";
import {
  type ShapeAction,
  findNearestEdge,
  lastOpenRingIndex,
} from "@magnum/shared";

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

/**
 * `map.getEventPixel` returns a 2-element array; with
 * `noUncheckedIndexedAccess` both elements are typed `number |
 * undefined`. In practice the array is always full, so we just cast.
 */
function asPixel(p: number[] | ArrayLike<number>): [number, number] {
  return [p[0] ?? 0, p[1] ?? 0] as [number, number];
}

const LONG_PRESS_MS = 250;
const DRAG_SLOP_PX = 8;

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
  shape,
  shapeMode,
  onShapeAction,
  liveShapeRef,
  onShapeChange: _onShapeChange,
  fitGeometry,
  tileVersion,
}: MapContainerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const onReadyRef = useRef(onReady);
  const onClickRef = useRef(onClick);
  const onFeatureSelectRef = useRef(onFeatureSelect);
  const onMoveEndRef = useRef(onMoveEnd);
  const onShapeActionRef = useRef(onShapeAction);
  const shapeRef = useRef(shape);
  const shapeModeRef = useRef(shapeMode);
  onReadyRef.current = onReady;
  onClickRef.current = onClick;
  onFeatureSelectRef.current = onFeatureSelect;
  onMoveEndRef.current = onMoveEnd;
  onShapeActionRef.current = onShapeAction;
  shapeRef.current = shape;
  shapeModeRef.current = shapeMode;

  const merged = useMemo(() => ({ ...defaultMapConfig, ...config }), [config]);
  const baseLayerDefs = useMemo(() => resolveBaseLayers(merged), [merged]);
  const defaultBaseLayerId = useMemo(
    () => resolveDefaultBaseLayerId(merged, baseLayerDefs),
    [merged, baseLayerDefs],
  );
  const baseLayerDefsRef = useRef(baseLayerDefs);
  baseLayerDefsRef.current = baseLayerDefs;
  const defaultBaseLayerIdRef = useRef(defaultBaseLayerId);
  defaultBaseLayerIdRef.current = defaultBaseLayerId;

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

    // Shape editor layer — only mounted when the host passes a shape.
    // We always create it (cheaper than recreating on every shape
    // change); the rebuild effect drives the source.
    const shapeCtx = createShapeLayer();
    layers.push(shapeCtx.layer);

    const map = new Map({
      target: containerRef.current,
      layers,
      view: new View({ center: fromLonLat(center), zoom, minZoom, maxZoom }),
    });
    mapRef.current = map;
    // Stash the shape context for later effects.
    (map as unknown as { __shapeCtx?: typeof shapeCtx; __systemsLayer?: typeof systemsLayer }).__shapeCtx = shapeCtx;
    (map as unknown as { __systemsLayer?: typeof systemsLayer }).__systemsLayer = systemsLayer;

    applyBaseLayer(map, baseLayerDefs, defaultBaseLayerId);

    // Drag state — managed across pointer events.
    let dragTimer: ReturnType<typeof setTimeout> | null = null;
    let dragRingIndex = -1;
    let dragVertexIndex = -1;
    let dragStartPixel: [number, number] = [0, 0];
    let dragFired = false;

    // Track the pixel position of the first vertex of the current
    // open ring. Used for the close gesture: the user clicks the
    // same pixel where they placed vertex 0 to close the ring.
    let firstVertexPixel: [number, number] | null = null;
    let placingOpenRingPixel = -1;
    let placedCount = 0;

    map.on("click", (evt) => {
      if (dragFired) {
        dragFired = false;
        return;
      }

      const curShape = liveShapeRef?.current ?? shapeRef.current;
      const curMode = shapeModeRef.current;

      // Shape editor hit-test takes priority when editor is active.
      if (curShape && shapeCtx && curMode) {
        // Rebuild the source synchronously so the hit-test always
        // sees the latest shape (the React effect is async and may
        // not have run between rapid clicks).
        rebuildShapeSource(shapeCtx.source, { rings: curShape.rings });
        const coordinate = evt.coordinate;
        const [lon, lat] = toLonLat(coordinate);
        if (typeof lon !== "number" || typeof lat !== "number") return;
        const pixel = asPixel(map.getEventPixel(evt.originalEvent));
        const hit = shapeHitTest(map, shapeCtx.layer, pixel, SHAPE_VERTEX_RADIUS + 12);

        if (curMode === "delete") {
          if (hit.kind === "vertex" && hit.ringIndex >= 0) {
            onShapeActionRef.current?.({
              type: "deleteVertex",
              ringIndex: hit.ringIndex,
              vertexIndex: hit.vertexIndex,
            });
            return;
          }
          if (hit.kind === "edge" && hit.ringIndex >= 0) {
            const nearest = findNearestEdge(curShape.rings, lon, lat);
            if (nearest) {
              onShapeActionRef.current?.({
                type: "openEdge",
                ringIndex: nearest.ringIndex,
                after: nearest.insertAfter,
              });
            }
            return;
          }
          return;
        }

        // Normal (add) mode.
        // Close gesture: compare click pixel to the stored pixel
        // of the first vertex of the current open ring.
        {
          const openIdx = lastOpenRingIndex(curShape);
          if (openIdx >= 0 && placingOpenRingPixel === openIdx && firstVertexPixel) {
            const openRing = curShape.rings[openIdx];
            if (openRing && openRing.vertices.length >= 3) {
              const dx = pixel[0] - firstVertexPixel[0];
              const dy = pixel[1] - firstVertexPixel[1];
              if (dx * dx + dy * dy <= (SHAPE_VERTEX_RADIUS + 12) ** 2) {
                onShapeActionRef.current?.({ type: "closeRing" });
                firstVertexPixel = null;
                placingOpenRingPixel = -1;
                placedCount = 0;
                return;
              }
            }
          }
        }

        if (hit.kind === "vertex" && hit.ringIndex >= 0) {
          return;
        }
        if (hit.kind === "edge" && hit.ringIndex >= 0) {
          const nearest = findNearestEdge(curShape.rings, lon, lat);
          if (nearest) {
            onShapeActionRef.current?.({
              type: "splitEdge",
              ringIndex: nearest.ringIndex,
              after: nearest.insertAfter,
              lon,
              lat,
            });
          }
          return;
        }
        // Empty map click in normal mode → append vertex.
        {
          const openIdx = lastOpenRingIndex(curShape);
          if (placingOpenRingPixel !== openIdx) {
            // Started a new ring or switched rings — reset tracking.
            firstVertexPixel = null;
            placedCount = 0;
          }
          placingOpenRingPixel = openIdx;
          if (openIdx < 0) {
            // All rings closed, new ring will be created — track it.
            firstVertexPixel = pixel;
            placedCount = 0;
          } else if (placedCount === 0) {
            firstVertexPixel = pixel;
          }
          placedCount = (openIdx >= 0 ? curShape.rings[openIdx]?.vertices.length ?? 0 : 0) + 1;
        }
        onShapeActionRef.current?.({ type: "appendVertex", lon, lat });
        return;
      }

      const pixel = asPixel(map.getEventPixel(evt.originalEvent));
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

    // Long-press-to-drag: pointerdown on a vertex starts a 350 ms timer.
    // If the timer fires before significant movement, enter drag mode
    // and emit moveVertex actions on pointermove until pointerup.
    const handlePointerDown = (evt: { originalEvent: unknown }) => {
      if (!(liveShapeRef?.current ?? shapeRef.current) || !shapeCtx) return;
      const ev = evt.originalEvent as MouseEvent;
      if ("button" in ev && ev.button !== 0) return;
      const pixel = asPixel(
        map.getEventPixel(
          evt.originalEvent as Parameters<typeof map.getEventPixel>[0],
        ),
      );
      const hit = shapeHitTest(map, shapeCtx.layer, pixel, SHAPE_VERTEX_RADIUS + 12);
      if (hit.kind !== "vertex" || hit.ringIndex < 0) return;
      ev.preventDefault();
      ev.stopPropagation();
      dragStartPixel = pixel;
      dragRingIndex = hit.ringIndex;
      dragVertexIndex = hit.vertexIndex;
      dragFired = false;
      dragTimer = setTimeout(() => {
        dragTimer = null;
        dragFired = true;
      }, LONG_PRESS_MS);
    };

    const handlePointerMove = (evt: unknown) => {
      const e = evt as { originalEvent?: MouseEvent; coordinate: number[] };
      // If timer is still active, check for slop (early movement cancels drag).
      if (dragTimer) {
        const pixel = asPixel(
          map.getEventPixel(
            (e.originalEvent ?? e) as Parameters<typeof map.getEventPixel>[0],
          ),
        );
        const dx = pixel[0] - dragStartPixel[0];
        const dy = pixel[1] - dragStartPixel[1];
        if (dx * dx + dy * dy > DRAG_SLOP_PX * DRAG_SLOP_PX) {
          clearTimeout(dragTimer);
          dragTimer = null;
        }
        return;
      }
      if (!dragFired) return;
      // Suppress OL's pan/zoom while we're vertex-dragging.
      if (e.originalEvent && "preventDefault" in e.originalEvent) {
        (e.originalEvent as Event).preventDefault();
      }
      if (!Array.isArray(e.coordinate)) return;
      const [lon, lat] = toLonLat(e.coordinate);
      if (typeof lon !== "number" || typeof lat !== "number") return;
      onShapeActionRef.current?.({
        type: "moveVertex",
        ringIndex: dragRingIndex,
        vertexIndex: dragVertexIndex,
        lon,
        lat,
      });
    };

    const endDrag = () => {
      if (dragTimer) {
        clearTimeout(dragTimer);
        dragTimer = null;
      }
    };

    map.on("pointerdown" as never, handlePointerDown as never);
    map.on("mousedown" as never, handlePointerDown as never);
    map.on("pointermove" as never, handlePointerMove as never);
    map.on("mousemove" as never, handlePointerMove as never);
    map.on("pointerup" as never, endDrag as never);
    map.on("mouseup" as never, endDrag as never);

    map.on("moveend", () => {
      const view = map.getView();
      const center = view.getCenter();
      const zoom = view.getZoom();
      if (!center || typeof zoom !== "number") return;
      const [lon, lat] = toLonLat(center);
      if (typeof lon === "number" && typeof lat === "number") {
        onMoveEndRef.current?.([lon, lat], zoom);
        if (containerRef.current) {
          containerRef.current.dataset.mapCenter = `${lon.toFixed(6)},${lat.toFixed(6)}`;
          containerRef.current.dataset.mapZoom = String(zoom);
        }
      }
    });

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

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const id = baseLayerId ?? defaultBaseLayerIdRef.current;
    applyBaseLayer(map, baseLayerDefsRef.current, id);
  }, [baseLayerId]);

  // Re-render the shape source whenever the host's shape prop
  // changes. We rely on the ShapeLayer being created in the mount
  // effect above and stashed on the map instance.
  // Also disable all map interactions (DragPan, zoom, etc.) when
  // shape editing is active so clicks never shift the view.
  useEffect(() => {
    const map = mapRef.current as unknown as
      | (Map & {
          __shapeCtx?: ReturnType<typeof createShapeLayer>;
          __systemsLayer?: Layer;
        })
      | null;
    const shapeCtx = map?.__shapeCtx;
    const systemsLayer = map?.__systemsLayer;
    if (!shapeCtx) return;
    if (!shape) {
      shapeCtx.source.clear();
      shapeCtx.layer.setVisible(false);
      if (systemsLayer) systemsLayer.setVisible(true);
      const interactions = map?.getInteractions().getArray();
      if (interactions) {
        for (const ix of interactions) ix.setActive(true);
      }
      return;
    }
    shapeCtx.layer.setVisible(true);
    if (systemsLayer) systemsLayer.setVisible(false);
    rebuildShapeSource(shapeCtx.source, shape);
    const interactions = map?.getInteractions().getArray();
    if (interactions) {
      for (const ix of interactions) ix.setActive(false);
    }
  }, [shape]);

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

  const lastFitRef = useRef<unknown>(null);
  useEffect(() => {
    if (!mapRef.current || !fitGeometry) return;
    if (fitGeometry === lastFitRef.current) return;
    lastFitRef.current = fitGeometry;
    const ext = extentFromGeoJSON(fitGeometry);
    if (!ext) return;
    const mapExt = transformExtent(ext, "EPSG:4326", "EPSG:3857");
    const view = mapRef.current.getView();
    view.fit(mapExt, {
      padding: [30, 30, 30, 30],
      duration: 300,
      maxZoom: 16,
    });
  }, [fitGeometry]);

  const prevTileVersionRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || typeof tileVersion !== "number") return;
    if (prevTileVersionRef.current === tileVersion) return;
    prevTileVersionRef.current = tileVersion;
    const layers = map.getLayers().getArray();
    for (const layer of layers) {
      const src = (layer as unknown as { getSource?: () => unknown }).getSource?.();
      if (src && typeof (src as { getUrls?: () => string[] }).getUrls === "function") {
        const s = src as unknown as { getUrls: () => string[]; setUrl: (url: string) => void };
        const urls = s.getUrls();
        if (urls && urls[0]) {
          const baseUrl = urls[0].replace(/[?&]_v=\d+/, "");
          s.setUrl(`${baseUrl}${baseUrl.includes("?") ? "&" : "?"}_v=${tileVersion}`);
        }
      }
    }
  }, [tileVersion]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}

