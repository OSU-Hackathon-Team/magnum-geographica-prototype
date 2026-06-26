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
import {
  createShapeLayer,
  rebuildShapeSource,
  findNearestEdge,
  shapeHitTest,
} from "./layers/ShapeLayer.js";
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

/**
 * `map.getEventPixel` returns a 2-element array; with
 * `noUncheckedIndexedAccess` both elements are typed `number |
 * undefined`. In practice the array is always full, so we just cast.
 */
function asPixel(p: number[] | ArrayLike<number>): [number, number] {
  return [p[0] ?? 0, p[1] ?? 0] as [number, number];
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
  onShapeChange,
}: MapContainerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const onReadyRef = useRef(onReady);
  const onClickRef = useRef(onClick);
  const onFeatureSelectRef = useRef(onFeatureSelect);
  const onMoveEndRef = useRef(onMoveEnd);
  const onShapeChangeRef = useRef(onShapeChange);
  onReadyRef.current = onReady;
  onClickRef.current = onClick;
  onFeatureSelectRef.current = onFeatureSelect;
  onMoveEndRef.current = onMoveEnd;
  onShapeChangeRef.current = onShapeChange;

  const merged = useMemo(() => ({ ...defaultMapConfig, ...config }), [config]);
  const baseLayerDefs = useMemo(() => resolveBaseLayers(merged), [merged]);
  const defaultBaseLayerId = useMemo(
    () => resolveDefaultBaseLayerId(merged, baseLayerDefs),
    [merged, baseLayerDefs],
  );

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
    (map as unknown as { __shapeCtx?: typeof shapeCtx }).__shapeCtx = shapeCtx;

    applyBaseLayer(map, baseLayerDefs, defaultBaseLayerId);

    // Track the live shape inside the click/drag handlers so they
    // see the freshest copy (the closure's `shape` const is stale
    // for the lifetime of the effect).
    let liveShape: typeof shape = shape;
    const renderShape = () => {
      if (!liveShape) {
        shapeCtx.source.clear();
        shapeCtx.layer.setVisible(false);
        return;
      }
      shapeCtx.layer.setVisible(true);
      rebuildShapeSource(shapeCtx.source, liveShape);
    };
    renderShape();

    map.on("click", (evt) => {
      // First, hit-test the shape layer if the editor is active.
      if (liveShape && shapeCtx) {
        const pixel = asPixel(map.getEventPixel(evt.originalEvent));
        const hit = shapeHitTest(map, shapeCtx.layer, pixel, 12);
        const s = liveShape;

        // Mode: delete.
        if (s.mode === "delete") {
          if (hit.kind === "vertex" && hit.ringIndex >= 0) {
            // Remove the vertex from the ring.
            const rings = s.rings.map((r, ri) => {
              if (ri !== hit.ringIndex) return r;
              const verts = r.vertices.filter((_, vi) => vi !== hit.vertexIndex);
              // If the ring had exactly 2 vertices and we removed one,
              // remove the ring entirely.
              if (verts.length === 0) return null;
              return { ...r, vertices: verts, closed: r.closed && verts.length >= 3 };
            }).filter(Boolean) as typeof s.rings;
            onShapeChangeRef.current?.({
              rings,
              chords: s.chords,
              connectFrom: null,
            });
            return;
          }
          if (hit.kind === "edge" && hit.ringIndex >= 0) {
            // Remove the ring entirely (collapsing the edge deletes
            // its parent ring — finer-grained "remove edge only" is
            // out of scope for v1).
            const rings = s.rings.filter((_, ri) => ri !== hit.ringIndex);
            onShapeChangeRef.current?.({
              rings,
              chords: s.chords,
              connectFrom: null,
            });
            return;
          }
          // No-op for empty map in delete mode.
          return;
        }

        // Mode: normal.
        if (hit.kind === "vertex" && hit.ringIndex >= 0) {
          // In-progress connect gesture.
          if (s.connectFrom !== null) {
            const fromIdx = globalVertexIndex(s.rings, s.connectFrom.ringIndex, s.connectFrom.vertexIndex);
            const toIdx = globalVertexIndex(s.rings, hit.ringIndex, hit.vertexIndex);
            if (fromIdx === toIdx) {
              // Same vertex → cancel.
              onShapeChangeRef.current?.({
                rings: s.rings,
                chords: s.chords,
                connectFrom: null,
              });
              return;
            }
            // Add the chord (if not already present).
            const already = s.chords.some(
              ([a, b]) =>
                (a === fromIdx && b === toIdx) || (a === toIdx && b === fromIdx),
            );
            if (!already) {
              onShapeChangeRef.current?.({
                rings: s.rings,
                chords: [...s.chords, [fromIdx, toIdx]],
                connectFrom: null,
              });
            } else {
              onShapeChangeRef.current?.({
                rings: s.rings,
                chords: s.chords,
                connectFrom: null,
              });
            }
            return;
          }
          // §21.5 — single-click on vertex 0 of an open ring (with
          // ≥3 vertices) closes the ring. This is the primary
          // close gesture: the user draws 3+ vertices then taps
          // the first one to seal the shape.
          const hitRing = s.rings[hit.ringIndex];
          if (
            hitRing &&
            !hitRing.closed &&
            hit.vertexIndex === 0 &&
            hitRing.vertices.length >= 3
          ) {
            onShapeChangeRef.current?.({
              rings: s.rings.map((r, ri) =>
                ri === hit.ringIndex ? { ...r, closed: true } : r,
              ),
              chords: s.chords,
              connectFrom: null,
            });
            return;
          }
          // Otherwise: a no-op. The user can:
          //   - dblclick to start the connect gesture
          //   - switch to delete mode to remove the vertex
          //   - drag to move it
          return;
        }

        if (hit.kind === "edge" && hit.ringIndex >= 0) {
          // Split the edge: insert a new vertex at the click
          // projection. We compute the projection on the host side
          // via `findNearestEdge` (already used below) but here we
          // approximate by inserting just before the next vertex of
          // the hit ring.
          const coord = toLonLat(evt.coordinate);
          const lon = coord[0] ?? 0;
          const lat = coord[1] ?? 0;
          const rings = insertVertexOnRing(s.rings, hit.ringIndex, lon, lat);
          onShapeChangeRef.current?.({
            rings,
            chords: s.chords,
            connectFrom: null,
          });
          return;
        }

        // No vertex or edge hit → treat as "tap on empty map" if
        // we're in normal mode. The host (ShapeEditor) is also
        // listening to onClick; we don't double-emit because we
        // already handled the gesture here. But we DO want to
        // surface the gesture up so the host can decide what to do
        // (e.g. add a vertex vs. start a new ring). The simplest
        // path: forward the click to onClickRef, and let the host
        // call back with onShapeChange. We set the live shape
        // ourselves (host will pick it up via prop diff).
        const coord = toLonLat(evt.coordinate);
        const lon = coord[0] ?? 0;
        const lat = coord[1] ?? 0;
        onClickRef.current?.(lon, lat);
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

    // Double-click on a vertex starts the "connect two vertices"
    // gesture.
    map.on("dblclick", (evt) => {
      if (!liveShape) return;
      const pixel = asPixel(map.getEventPixel(evt.originalEvent));
      const hit = shapeHitTest(map, shapeCtx.layer, pixel, 12);
      if (hit.kind === "vertex" && hit.ringIndex >= 0) {
        onShapeChangeRef.current?.({
          rings: liveShape.rings,
          chords: liveShape.chords,
          connectFrom: { ringIndex: hit.ringIndex, vertexIndex: hit.vertexIndex },
        });
        evt.preventDefault();
      }
    });

    // Drag a vertex. We use a single `pointermove` handler while
    // the user is dragging (started on pointerdown on a vertex).
    let drag: { ringIndex: number; vertexIndex: number } | null = null;
    const handlePointerEvent = (evt: { originalEvent: unknown }) => {
      if (!liveShape || !evt.originalEvent) return;
      const ev = evt.originalEvent as MouseEvent;
      if ("button" in ev && ev.button !== 0) return;
      const pixel = asPixel(map.getEventPixel(evt.originalEvent as Parameters<typeof map.getEventPixel>[0]));
      const hit = shapeHitTest(map, shapeCtx.layer, pixel, 12);
      if (hit.kind === "vertex" && hit.ringIndex >= 0) {
        drag = { ringIndex: hit.ringIndex, vertexIndex: hit.vertexIndex };
        ev.preventDefault();
      }
    };
    // OpenLayers uses 'pointerdown' / 'pointermove' / 'pointerup'.
    // Fall back to 'mousedown' / 'mousemove' / 'mouseup' if the
    // pointer variant isn't available (older OL builds). The casts
    // below are safe — the event payload is the same.
    map.on("pointerdown" as never, handlePointerEvent as never);
    map.on("mousedown" as never, handlePointerEvent as never);
    const handlePointerMove = (evt: unknown) => {
      if (!drag || !liveShape) return;
      const e = evt as { coordinate: number[] };
      if (!Array.isArray(e.coordinate)) return;
      const [lon, lat] = toLonLat(e.coordinate);
      if (typeof lon !== "number" || typeof lat !== "number") return;
      const rings = moveVertex(liveShape.rings, drag.ringIndex, drag.vertexIndex, [lon, lat]);
      onShapeChangeRef.current?.({
        rings,
        chords: liveShape.chords,
        connectFrom: liveShape.connectFrom,
      });
    };
    map.on("pointermove" as never, handlePointerMove as never);
    map.on("mousemove" as never, handlePointerMove as never);
    const endDrag = () => {
      drag = null;
    };
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
    const id = baseLayerId ?? defaultBaseLayerId;
    applyBaseLayer(map, baseLayerDefs, id);
  }, [baseLayerId, baseLayerDefs, defaultBaseLayerId]);

  // Re-render the shape source whenever the host's shape prop
  // changes. We rely on the ShapeLayer being created in the mount
  // effect above and stashed on the map instance.
  useEffect(() => {
    const map = mapRef.current as unknown as
      | (Map & { __shapeCtx?: ReturnType<typeof createShapeLayer> })
      | null;
    const shapeCtx = map?.__shapeCtx;
    if (!shapeCtx) return;
    if (!shape) {
      shapeCtx.source.clear();
      shapeCtx.layer.setVisible(false);
      return;
    }
    shapeCtx.layer.setVisible(true);
    rebuildShapeSource(shapeCtx.source, shape);
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

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}

/* ----------------------------------------------------------------- */
/* Helpers — the editor state-machine math                            */
/* ----------------------------------------------------------------- */

type ShapeRing = { vertices: Array<[number, number]>; closed: boolean };
type ShapeRings = ShapeRing[];

/**
 * Insert a new vertex into the given ring at the position closest
 * to the click point. We do this in (lon, lat) space by walking the
 * ring's segments and inserting after the segment whose projection
 * is closest.
 */
function insertVertexOnRing(
  rings: ShapeRings,
  ringIndex: number,
  lon: number,
  lat: number,
): ShapeRings {
  return rings.map((r, ri) => {
    if (ri !== ringIndex) return r;
    if (r.vertices.length < 2) {
      return { ...r, vertices: [[lon, lat]] };
    }
    const nearest = findNearestEdge([r], lon, lat);
    if (!nearest) return { ...r, vertices: [...r.vertices, [lon, lat]] };
    const verts = [...r.vertices];
    verts.splice(nearest.insertAfter + 1, 0, [lon, lat]);
    return { ...r, vertices: verts };
  });
}

/** Move a vertex in place. */
function moveVertex(
  rings: ShapeRings,
  ringIndex: number,
  vertexIndex: number,
  newPos: [number, number],
): ShapeRings {
  return rings.map((r, ri) => {
    if (ri !== ringIndex) return r;
    return {
      ...r,
      vertices: r.vertices.map((v, vi) => (vi === vertexIndex ? newPos : v)),
    };
  });
}

/** Convert a (ringIndex, vertexIndex) pair into the global vertex index. */
function globalVertexIndex(
  rings: ShapeRings,
  ringIndex: number,
  vertexIndex: number,
): number {
  let n = 0;
  for (let ri = 0; ri < rings.length; ri++) {
    if (ri === ringIndex) return n + vertexIndex;
    n += rings[ri]!.vertices.length;
  }
  return -1;
}
