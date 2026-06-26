import { useCallback, useMemo, useState } from "react";
import { MapContainer, type MapContainerProps } from "@magnum/map";
import { shapeToGeoJSON, type Shape } from "@magnum/shared";

export type ShapeMode = "normal" | "delete";

export interface ShapeEditorProps {
  /**
   * Initial shape (used to seed the editor when editing an
   * existing system). When `null`, the editor starts with an empty
   * shape.
   */
  initial: Shape | null;
  mode: ShapeMode;
  /**
   * Map configuration. The host should pass `martinTilesUrl` (and
   * optionally an `initialCenter` / `initialZoom` derived from the
   * existing boundary) so the basemap and tile overlays render.
   */
  mapConfig?: MapContainerProps["config"];
  /**
   * Called whenever the user edits the shape. The host (boundary
   * screen) uses this to update its own copy and to detect
   * unsaved-changes.
   */
  onChange: (shape: Shape) => void;
}

/**
 * §21.5 — the shape editor (UI shell).
 *
 * Owns the Shape state and renders a full-screen MapContainer with
 * the `shape` prop wired in. Vertex / edge / drag gestures are
 * handled by the MapContainer itself (see
 * packages/map/MapContainer.web.tsx). The editor normalises the
 * shape on every change.
 *
 * The mode (normal vs delete) is owned by the host and passed in.
 * The host renders the mode toggle and forwards the user's choice
 * here.
 */
export function ShapeEditor({ initial, mode, onChange, mapConfig }: ShapeEditorProps) {
  const [shape, setShapeInternal] = useState<Shape>(
    () =>
      initial ?? {
        rings: [{ vertices: [], closed: false }],
        chords: [],
        connectFrom: null,
      },
  );

  const updateShape = useCallback(
    (patch: Partial<Shape>) => {
      setShapeInternal((prev) => {
        const next: Shape = {
          rings: patch.rings ?? prev.rings,
          chords: patch.chords ?? prev.chords,
          connectFrom: patch.connectFrom === undefined ? prev.connectFrom : patch.connectFrom,
        };
        onChange(next);
        return next;
      });
    },
    [onChange],
  );

  // The host updates the shape when the user finishes a gesture.
  // We pass through the map's emitted shape verbatim. The map
  // normalises the hit (vertex/edge) and updates the shape.
  const handleShapeChange = useCallback(
    (next: {
      rings: Shape["rings"];
      chords: Shape["chords"];
      connectFrom: Shape["connectFrom"];
    }) => {
      // Trim empty rings (the map never emits these, but the host
      // might construct them in a future iteration).
      const rings = next.rings.filter((r) => r.vertices.length > 0);
      if (rings.length === 0) {
        rings.push({ vertices: [], closed: false });
      }
      updateShape({
        rings,
        chords: next.chords,
        connectFrom: next.connectFrom,
      });
    },
    [updateShape],
  );

  // §21.5 — tap empty map in normal mode:
  //   - if there's an open ring, extend it (close it if the click
  //     is near vertex 0)
  //   - if all rings are closed (or no rings exist), start a new one
  // The close tolerance is in degrees²: at zoom 6, 0.012° = ~1.3 km
  // (very generous). We use a fixed value because we don't have
  // access to the map's getResolution() in this component; the
  // host could narrow it if needed.
  const closeToleranceDeg = 0.012;
  const handleMapClick = useCallback(
    (lon: number, lat: number) => {
      if (mode === "delete") return; // map handles delete hits directly
      setShapeInternal((prev) => {
        const rings = prev.rings.map((r) => ({ ...r, vertices: [...r.vertices] }));
        let target = -1;
        for (let i = rings.length - 1; i >= 0; i--) {
          if (!rings[i]!.closed) {
            target = i;
            break;
          }
        }
        if (target < 0) {
          rings.push({ vertices: [[lon, lat]], closed: false });
        } else {
          const t = rings[target]!;
          if (t.vertices.length >= 3 && t.vertices[0]) {
            const [v0Lon, v0Lat] = t.vertices[0];
            const dx = lon - v0Lon;
            const dy = lat - v0Lat;
            const d2 = dx * dx + dy * dy;
            if (d2 < closeToleranceDeg * closeToleranceDeg) {
              rings[target] = { ...t, closed: true };
            } else {
              rings[target] = { ...t, vertices: [...t.vertices, [lon, lat]] };
            }
          } else {
            rings[target] = { ...t, vertices: [...t.vertices, [lon, lat]] };
          }
        }
        const next: Shape = { rings, chords: prev.chords, connectFrom: prev.connectFrom };
        onChange(next);
        return next;
      });
    },
    [mode, onChange, closeToleranceDeg],
  );

  const mapShape = useMemo(
    () => ({ ...shape, mode }),
    [shape, mode],
  );

  return (
    <MapContainer
      config={mapConfig ?? {}}
      shape={mapShape}
      onShapeChange={handleShapeChange}
      onClick={handleMapClick}
    />
  );
}

/**
 * Compute the validation state for a shape. Returns `ok: true`
 * when the user can save, otherwise the error message to display
 * in the bottom bar.
 */
export function validateShape(
  shape: Shape | null | undefined,
): { ok: boolean; error?: string } {
  if (!shape) return { ok: false, error: "Draw at least one region." };
  const closed = shape.rings.filter((r) => r.closed);
  if (closed.length === 0) {
    return { ok: false, error: "Tap the first vertex to close the ring." };
  }
  for (const r of closed) {
    if (r.vertices.length < 3) {
      return { ok: false, error: "Each closed ring needs at least 3 vertices." };
    }
  }
  return { ok: true };
}

/**
 * Convert a Shape into a boundary payload suitable for
 * POST /api/systems or PUT /api/systems/:id. Returns `null` if
 * the shape is empty (no closed rings).
 */
export function shapeToBoundary(shape: Shape): unknown {
  return shapeToGeoJSON(shape);
}
