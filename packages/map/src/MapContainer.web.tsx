import { useEffect, useMemo, useRef } from "react";
import { Map, View } from "ol";
import type { Layer } from "ol/layer.js";
import VectorLayer from "ol/layer/Vector.js";
import HeatmapLayer from "ol/layer/Heatmap.js";
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
import { createTracesHeatmapLayer, loadHeatmapPoints } from "./layers/TracesHeatmapLayer.js";
import { applyBaseLayer } from "./layers/BaseLayer.js";
import {
  createShapeLayer,
  rebuildShapeSource,
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

const DRAG_SLOP_PX = 8;

/** Squared distance from point P to segment AB in 2D. */
function segDistSq(
  p: [number, number],
  a: [number, number],
  b: [number, number],
): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  let t = 0;
  if (lenSq > 0) {
    t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
  }
  const projX = a[0] + t * dx;
  const projY = a[1] + t * dy;
  const ddx = p[0] - projX;
  const ddy = p[1] - projY;
  return ddx * ddx + ddy * ddy;
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
  shape,
  shapeMode,
  onShapeAction,
  liveShapeRef,
  onShapeChange: _onShapeChange,
  fitGeometry,
  showHeatmap,
  systemTileVersion,
  trailTileVersion,
  segmentTileVersion,
  featureTileVersion,
  superSystemTileVersion,
  liveRoute,
}: MapContainerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const liveRouteSourceRef = useRef<VectorSource | null>(null);
  const heatmapAbortRef = useRef<AbortController | null>(null);
  const heatmapVisibleRef = useRef(false);
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

    const heatmapLayer = createTracesHeatmapLayer(merged.apiUrl);
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
    (map as unknown as { __heatmapLayer?: typeof heatmapLayer; __heatmapApiUrl?: string }).__heatmapLayer = heatmapLayer;
    (map as unknown as { __heatmapApiUrl?: string }).__heatmapApiUrl = merged.apiUrl;

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

    // ── Shape editor interactions ──────────────────────────────────
    //
    // Why DOM listeners instead of OL events?
    //   OL's MapBrowserEventEmitter does NOT emit "pointerdown".
    //   The old code used map.on("pointerdown", ...) which silently
    //   did nothing — the handler was never called, so drag was dead.
    //
    //   We use capture-phase addEventListener on the viewport element
    //   so we run BEFORE OL's own event processing.  On a vertex hit
    //   we stopPropagation, preventing OL from ever seeing the event.
    //
    // Why manual hit testing instead of getFeaturesAtPixel?
    //   getFeaturesAtPixel depends on OL having rendered the features.
    //   After a synchronous source rebuild the rendering may not have
    //   caught up, causing false negatives.  Manual pixel-distance
    //   testing against the shape data is deterministic and works
    //   immediately.

    const viewport = map.getViewport();
    const HIT_RADIUS = SHAPE_VERTEX_RADIUS + 14; // 22px tap target

    // Drag state
    let dragRing = -1;
    let dragVtx = -1;
    let dragDownPixel: [number, number] = [0, 0];
    let dragMoved = false;

    function ptrPixel(e: { clientX: number; clientY: number }): [number, number] {
      const rect = viewport.getBoundingClientRect();
      return [e.clientX - rect.left, e.clientY - rect.top];
    }

    /** Manual vertex hit test — projects each vertex lon/lat to a
     *  screen pixel and checks pixel distance.  Returns the closest
     *  vertex within HIT_RADIUS, or null. */
    function hitVertex(
      shape: { rings: Array<{ vertices: Array<[number, number]> }> },
      pixel: [number, number],
    ): { ringIndex: number; vertexIndex: number } | null {
      let best: { ringIndex: number; vertexIndex: number; distSq: number } | null = null;
      for (let ri = 0; ri < shape.rings.length; ri++) {
        const ring = shape.rings[ri]!;
        for (let vi = 0; vi < ring.vertices.length; vi++) {
          const [lon, lat] = ring.vertices[vi]!;
          const proj = fromLonLat([lon, lat]);
          const vp = map.getPixelFromCoordinate(proj);
          if (!vp) continue;
          const dx = pixel[0] - (vp[0] ?? 0);
          const dy = pixel[1] - (vp[1] ?? 0);
          const distSq = dx * dx + dy * dy;
          if (distSq <= HIT_RADIUS * HIT_RADIUS && (best === null || distSq < best.distSq)) {
            best = { ringIndex: ri, vertexIndex: vi, distSq };
          }
        }
      }
      return best ? { ringIndex: best.ringIndex, vertexIndex: best.vertexIndex } : null;
    }

    /** Manual edge hit test — projects each edge segment to pixel
     *  space and computes the pixel distance from the click to the
     *  segment.  Returns the nearest edge within HIT_RADIUS. */
    function nearestEdgePixel(
      rings: Array<{ vertices: Array<[number, number]>; closed: boolean }>,
      clickPx: [number, number],
    ): { ringIndex: number; insertAfter: number; distSq: number } | null {
      let best: { ringIndex: number; insertAfter: number; distSq: number } | null = null;
      for (let ri = 0; ri < rings.length; ri++) {
        const ring = rings[ri]!;
        const n = ring.vertices.length;
        const edgeCount = ring.closed ? n : n - 1;
        for (let i = 0; i < edgeCount; i++) {
          const a = ring.vertices[i]!;
          const b = ring.vertices[(i + 1) % n]!;
          const aPx = map.getPixelFromCoordinate(fromLonLat([a[0], a[1]]));
          const bPx = map.getPixelFromCoordinate(fromLonLat([b[0], b[1]]));
          if (!aPx || !bPx) continue;
          const distSq = segDistSq(
            clickPx,
            [aPx[0] ?? 0, aPx[1] ?? 0],
            [bPx[0] ?? 0, bPx[1] ?? 0],
          );
          if (
            distSq <= HIT_RADIUS * HIT_RADIUS &&
            (best === null || distSq < best.distSq)
          ) {
            best = { ringIndex: ri, insertAfter: i, distSq };
          }
        }
      }
      return best;
    }

    // ── pointerdown ────────────────────────────────────────────────
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      const curShape = liveShapeRef?.current ?? shapeRef.current;
      if (!curShape || !shapeCtx || !shapeModeRef.current) return;

      const pixel = ptrPixel(e);
      const hit = hitVertex(curShape, pixel);
      if (!hit) return; // empty map or edge — let OL handle the click

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

      // Normal mode — start a potential drag.
      dragRing = hit.ringIndex;
      dragVtx = hit.vertexIndex;
      dragDownPixel = pixel;
      dragMoved = false;
    };

    // ── pointermove ────────────────────────────────────────────────
    const onPointerMove = (e: PointerEvent) => {
      if (dragRing < 0) return;
      const pixel = ptrPixel(e);
      if (!dragMoved) {
        // Check if movement exceeds slop threshold to start drag.
        const dx = pixel[0] - dragDownPixel[0];
        const dy = pixel[1] - dragDownPixel[1];
        if (dx * dx + dy * dy <= DRAG_SLOP_PX * DRAG_SLOP_PX) return;
        dragMoved = true;
        viewport.setPointerCapture?.(e.pointerId);
      }
      // Drag is active — move the vertex.
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
    };

    // ── pointerup ──────────────────────────────────────────────────
    const onPointerUp = (e: PointerEvent) => {
      if (dragRing < 0) return;
      if (!dragMoved) {
        // Short click on a vertex (no drag happened).
        const curShape = liveShapeRef?.current ?? shapeRef.current;
        const ring = curShape?.rings[dragRing];
        if (ring && !ring.closed && dragVtx === 0 && ring.vertices.length >= 3) {
          onShapeActionRef.current?.({ type: "closeRing" });
        }
      }
      dragRing = -1;
      dragVtx = -1;
      dragMoved = false;
    };

    viewport.addEventListener("pointerdown", onPointerDown, true);
    viewport.addEventListener("pointermove", onPointerMove, true);
    viewport.addEventListener("pointerup", onPointerUp, true);
    viewport.addEventListener("pointercancel", onPointerUp, true);

    // ── OL click handler (append, split, delete, feature select) ───

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

        // Close gesture: project vertex 0 of the current open ring to
        // screen pixel and compare with the click pixel.
        {
          const openIdx = lastOpenRingIndex(curShape);
          if (openIdx >= 0) {
            const openRing = curShape.rings[openIdx];
            if (openRing && openRing.vertices.length >= 3) {
              const [v0Lon, v0Lat] = openRing.vertices[0]!;
              const v0Proj = fromLonLat([v0Lon, v0Lat]);
              const v0Pixel = map.getPixelFromCoordinate(v0Proj);
              if (v0Pixel) {
                const dx = pixel[0] - (v0Pixel[0] ?? 0);
                const dy = pixel[1] - (v0Pixel[1] ?? 0);
                if (dx * dx + dy * dy <= HIT_RADIUS * HIT_RADIUS) {
                  onShapeActionRef.current?.({ type: "closeRing" });
                  return;
                }
              }
            }
          }
        }

        // Vertex hits are handled by the capture-phase listeners.
        if (hitVertex(curShape, pixel)) return;

        // Edge hit → split (normal mode) or open (delete mode).
        // Check pixel-space distance to the nearest edge segment.
        const edgeInfo = nearestEdgePixel(curShape.rings, pixel);
        if (edgeInfo && edgeInfo.distSq < HIT_RADIUS * HIT_RADIUS) {
          if (curMode === "delete") {
            onShapeActionRef.current?.({
              type: "openEdge",
              ringIndex: edgeInfo.ringIndex,
              after: edgeInfo.insertAfter,
            });
          } else {
            onShapeActionRef.current?.({
              type: "splitEdge",
              ringIndex: edgeInfo.ringIndex,
              after: edgeInfo.insertAfter,
              lon,
              lat,
            });
          }
          return;
        }

        // Empty map click → append vertex (or ignore in delete mode).
        if (curMode === "delete") return;
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
      // Refresh heatmap when visible
      if (heatmapLayer && heatmapVisibleRef.current && merged.apiUrl) {
        heatmapAbortRef.current?.abort();
        const ctrl = new AbortController();
        heatmapAbortRef.current = ctrl;
        const ext = view.calculateExtent();
        if (ext) {
          const [minLon, minLat, maxLon, maxLat] = transformExtent(ext, "EPSG:3857", "EPSG:4326");
          loadHeatmapPoints(heatmapLayer, merged.apiUrl, [minLon!, minLat!, maxLon!, maxLat!], zoom, ctrl.signal)
            .catch(() => {});
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

  // Per-layer tile cache busting.  When a layer's version increments,
  // the URL for that layer's tile source gets `?_v=N` appended.  The
  // HTTP cache sees a different URL and the layer re-fetches from
  // Martin.  Martin itself must be configured with cache_size_mb: 0
  // in development so it serves fresh PostGIS data every time.
  const prevSlotVersions = useRef<
    Record<string, number>
  >({});
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Which regex matches which layer's URL, and which version to embed.
    const layers: { key: string; version: number; regex: RegExp }[] = [
      { key: "system",    version: systemTileVersion   ?? 0, regex: /\/systems\// },
      { key: "trail",     version: trailTileVersion    ?? 0, regex: /\/trails\// },
      { key: "segment",   version: segmentTileVersion  ?? 0, regex: /\/segments\// },
      { key: "feature",   version: featureTileVersion  ?? 0, regex: /\/features\// },
      { key: "super",     version: superSystemTileVersion ?? 0, regex: /\/super_systems\// },
    ];

    for (const olLayer of map.getLayers().getArray()) {
      const src = (olLayer as unknown as { getSource?: () => unknown }).getSource?.();
      if (!src || typeof (src as { getUrls?: () => string[] }).getUrls !== "function") continue;
      const s = src as unknown as { getUrls: () => string[]; setUrl: (url: string) => void };
      const urls = s.getUrls();
      if (!urls?.[0]) continue;

      for (const { key, version, regex } of layers) {
        if (!regex.test(urls[0])) continue;
        const lastV = prevSlotVersions.current[key];
        if (lastV === version) continue; // no change for this layer
        prevSlotVersions.current[key] = version;
        // Strip old `?_v=` params + append fresh `?_v=N`
        const clean = urls[0].replace(/[?&]_v=\d+/g, "");
        const sep = clean.includes("?") ? "&" : "?";
        s.setUrl(`${clean}${sep}_v=${version}`);
        break;
      }
    }
  }, [
    systemTileVersion, trailTileVersion, segmentTileVersion,
    featureTileVersion, superSystemTileVersion,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const heatmapLayer = (map as unknown as { __heatmapLayer?: HeatmapLayer }).__heatmapLayer;
    if (heatmapLayer) {
      heatmapLayer.setVisible(!!showHeatmap);
      heatmapVisibleRef.current = !!showHeatmap;
      if (showHeatmap) {
        const apiUrl = (map as unknown as { __heatmapApiUrl?: string }).__heatmapApiUrl;
        if (apiUrl) {
          heatmapAbortRef.current?.abort();
          const ctrl = new AbortController();
          heatmapAbortRef.current = ctrl;
          const view = map.getView();
          const ext = view.calculateExtent();
          if (ext) {
            const [minLon, minLat, maxLon, maxLat] = transformExtent(ext, "EPSG:3857", "EPSG:4326");
            loadHeatmapPoints(heatmapLayer, apiUrl, [minLon!, minLat!, maxLon!, maxLat!], view.getZoom() ?? 0, ctrl.signal)
              .catch(() => {});
          }
        }
      }
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

