import { useEffect, useMemo, useRef } from "react";
import { Map, View } from "ol";
import type { Layer } from "ol/layer.js";
import VectorLayer from "ol/layer/Vector.js";
import VectorTileLayer from "ol/layer/VectorTile.js";
import VectorSource from "ol/source/Vector.js";
import Feature, { type FeatureLike } from "ol/Feature.js";
import { LineString, Point } from "ol/geom.js";
import { Fill, Stroke, Style, Circle } from "ol/style.js";
import "ol/ol.css";
import { fromLonLat, toLonLat, transformExtent } from "ol/proj.js";
import { defaultMapConfig, resolveBaseLayers, resolveDefaultBaseLayerId } from "./shared/config.js";
import { extentFromGeoJSON } from "./shared/extent.js";
import { createTrailsLayer } from "./layers/TrailsLayer.js";
import { createSystemsLayer } from "./layers/SystemsLayer.js";
import { createFeaturesLayer } from "./layers/FeaturesLayer.js";
import { createSuperSystemsLayer } from "./layers/SuperSystemsLayer.js";
import { createTracesHeatmapLayer } from "./layers/TracesHeatmapLayer.js";
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
  showHeatmap,
  liveRoute,
}: MapContainerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const liveRouteSourceRef = useRef<VectorSource | null>(null);
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

    const heatmapLayer = createTracesHeatmapLayer(merged);
    if (heatmapLayer) layers.push(heatmapLayer);

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
    (map as unknown as { __heatmapLayer?: typeof heatmapLayer }).__heatmapLayer = heatmapLayer;

    const liveRouteSource = new VectorSource();
    const liveRouteStyle = (feature: FeatureLike) => {
      const geom = feature.getGeometry();
      if (!(geom instanceof LineString)) return [];
      const coords = geom.getCoordinates();
      const styles: Style[] = [
        new Style({
          stroke: new Stroke({ color: "#22c55e", width: 4, lineCap: "round" }),
        }),
      ];
      if (coords.length > 0) {
        const tail = coords[coords.length - 1];
        if (tail) {
          styles.push(
            new Style({
              geometry: new Point(tail),
              image: new Circle({
                radius: 6,
                fill: new Fill({ color: "#22c55e" }),
                stroke: new Stroke({ color: "#fff", width: 2 }),
              }),
            }),
          );
        }
      }
      return styles;
    };
    const liveRouteLayer = new VectorLayer({
      source: liveRouteSource,
      style: liveRouteStyle,
    });
    liveRouteLayer.set("name", "live_route");
    map.addLayer(liveRouteLayer);
    liveRouteSourceRef.current = liveRouteSource;

    applyBaseLayer(map, baseLayerDefs, defaultBaseLayerId);

    // ── Shape-editor drag via capture-phase DOM listeners ──────────
    // MUST use capture‑phase (3rd arg = true) so we run BEFORE OL's
    // built‑in DragPan interaction.  On a vertex hit we stopPropagation,
    // preventing OL from ever seeing the event.  The OL click handler
    // below continues to handle empty‑map clicks (appendVertex),
    // edge clicks (splitEdge / openEdge), and delete‑mode actions.

    const viewport = map.getViewport();
    let dragRing = -1;
    let dragVtx = -1;
    let dragDownPixel: [number, number] = [0, 0];
    let dragTimer: ReturnType<typeof setTimeout> | null = null;
    let dragActive = false;

    function pixelFromPointer(e: PointerEvent): [number, number] {
      const rect = viewport.getBoundingClientRect();
      return [e.clientX - rect.left, e.clientY - rect.top];
    }

    viewport.addEventListener(
      "pointerdown",
      (e: PointerEvent) => {
        const curShape = liveShapeRef?.current ?? shapeRef.current;
        if (!curShape || !shapeCtx || !shapeModeRef.current) return;
        rebuildShapeSource(shapeCtx.source, { rings: curShape.rings });
        const pixel = pixelFromPointer(e);
        const hit = shapeHitTest(map, shapeCtx.layer, pixel, SHAPE_VERTEX_RADIUS + 12);
        if (hit.kind !== "vertex" || hit.ringIndex < 0) return; // let OL handle it

        e.stopPropagation();
        e.preventDefault();

        if (shapeModeRef.current === "delete") {
          onShapeActionRef.current?.({
            type: "deleteVertex",
            ringIndex: hit.ringIndex,
            vertexIndex: hit.vertexIndex,
          });
          return;
        }

        // Normal mode — start long-press timer for potential vertex drag.
        dragRing = hit.ringIndex;
        dragVtx = hit.vertexIndex;
        dragDownPixel = pixel;
        dragActive = false;
        dragTimer = setTimeout(() => {
          dragTimer = null;
          dragActive = true;
          viewport.setPointerCapture?.(e.pointerId);
        }, LONG_PRESS_MS);
      },
      true,
    );

    viewport.addEventListener(
      "pointermove",
      (e: PointerEvent) => {
        if (dragRing < 0) return;
        const pixel = pixelFromPointer(e);
        if (dragTimer) {
          // Cancel long-press if the finger moves beyond slop.
          const dx = pixel[0] - dragDownPixel[0];
          const dy = pixel[1] - dragDownPixel[1];
          if (dx * dx + dy * dy > DRAG_SLOP_PX * DRAG_SLOP_PX) {
            clearTimeout(dragTimer);
            dragTimer = null;
          }
          return;
        }
        if (!dragActive) return;
        e.stopPropagation();
        e.preventDefault();
        const coord = map.getCoordinateFromPixel(pixel);
        if (!coord) return;
        const [lon, lat] = toLonLat(coord);
        if (typeof lon !== "number" || typeof lat !== "number") return;
        onShapeActionRef.current?.({
          type: "moveVertex",
          ringIndex: dragRing,
          vertexIndex: dragVtx,
          lon,
          lat,
        });
      },
      true,
    );

    viewport.addEventListener(
      "pointerup",
      () => {
        if (dragTimer) {
          clearTimeout(dragTimer);
          dragTimer = null;
          // Short click on a vertex — check for close gesture.
          const curShape = liveShapeRef?.current ?? shapeRef.current;
          if (dragRing >= 0) {
            const ring = curShape?.rings[dragRing];
            if (
              ring &&
              !ring.closed &&
              dragVtx === 0 &&
              ring.vertices.length >= 3
            ) {
              onShapeActionRef.current?.({ type: "closeRing" });
            }
          }
        }
        dragRing = -1;
        dragVtx = -1;
        dragActive = false;
      },
      true,
    );

    // ── OL click handler (append, split, delete, feature select) ──

    map.on("click", (evt) => {
      const curShape = liveShapeRef?.current ?? shapeRef.current;
      const curMode = shapeModeRef.current;

      // Shape editor hit-test takes priority when editor is active.
      if (curShape && shapeCtx && curMode) {
        rebuildShapeSource(shapeCtx.source, { rings: curShape.rings });
        const coordinate = evt.coordinate;
        const [lon, lat] = toLonLat(coordinate);
        if (typeof lon !== "number" || typeof lat !== "number") return;
        const pixel = asPixel(map.getEventPixel(evt.originalEvent));
        const hit = shapeHitTest(map, shapeCtx.layer, pixel, SHAPE_VERTEX_RADIUS + 12);

        if (curMode === "delete") {
          // Vertex hits are handled by the capture-phase listener;
          // here we only care about edge clicks.
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

        // Normal (add) mode — close gesture via proximity.
        // Project vertex 0 of the current open ring to screen pixel
        // and compare with the click pixel.  This works even after
        // the map has been panned/zoomed.
        {
          const openIdx = lastOpenRingIndex(curShape);
          if (openIdx >= 0) {
            const openRing = curShape.rings[openIdx];
            if (openRing && openRing.vertices.length >= 3) {
              const [v0Lon, v0Lat] = openRing.vertices[0]!;
              const v0Proj = fromLonLat([v0Lon, v0Lat]);
              const v0Pixel = map.getPixelFromCoordinate(v0Proj);
              if (v0Pixel) {
                const px = v0Pixel[0] ?? 0;
                const py = v0Pixel[1] ?? 0;
                const dx = pixel[0] - px;
                const dy = pixel[1] - py;
                if (dx * dx + dy * dy <= (SHAPE_VERTEX_RADIUS + 12) ** 2) {
                  onShapeActionRef.current?.({ type: "closeRing" });
                  return;
                }
              }
            }
          }
        }

        // Vertex hits are handled by the capture-phase listener.
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
        onShapeActionRef.current?.({ type: "appendVertex", lon, lat });
        return;
      }

      // ── Feature select and general click (no shape editing active) ──
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

    // (capture-phase pointer listeners handle vertex drag/close above)

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

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const heatmapLayer = (map as unknown as { __heatmapLayer?: VectorTileLayer }).__heatmapLayer;
    if (heatmapLayer) {
      heatmapLayer.setVisible(!!showHeatmap);
    }
  }, [showHeatmap]);

  useEffect(() => {
    const source = liveRouteSourceRef.current;
    if (!source) return;
    if (!liveRoute || liveRoute.coordinates.length < 2) {
      source.clear();
      return;
    }
    const projected = liveRoute.coordinates.map((c) => fromLonLat(c));
    source.clear();
    source.addFeature(new Feature({ geometry: new LineString(projected) }));
    if (typeof liveRoute.followLon === "number" && typeof liveRoute.followLat === "number") {
      mapRef.current
        ?.getView()
        .animate({ center: fromLonLat([liveRoute.followLon, liveRoute.followLat]), duration: 250 });
    }
  }, [liveRoute]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}

