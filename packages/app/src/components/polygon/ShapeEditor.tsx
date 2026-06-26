import { useCallback, useEffect, useRef, useState } from "react";
import { MapContainer, type MapContainerProps } from "@magnum/map";
import {
  type Shape,
  type ShapeAction,
  emptyShape,
  shapeReducer,
  shapeToGeoJSON,
} from "@magnum/shared";

export type ShapeMode = "normal" | "delete";

export interface ShapeEditorProps {
  initial: Shape | null;
  mode: ShapeMode;
  mapConfig?: MapContainerProps["config"];
  onChange: (shape: Shape) => void;
  fitGeometry?: unknown | null;
}

export function ShapeEditor({ initial, mode, onChange, mapConfig, fitGeometry }: ShapeEditorProps) {
  const [shape, setShape] = useState<Shape>(
    () => initial ?? emptyShape(),
  );
  const shapeRef = useRef(shape);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    shapeRef.current = shape;
    onChangeRef.current(shape);
  }, [shape]);

  const handleShapeAction = useCallback(
    (action: ShapeAction) => {
      const next = shapeReducer(shapeRef.current, action);
      shapeRef.current = next;
      setShape(next);
    },
    [],
  );

  return (
    <MapContainer
      config={mapConfig ?? {}}
      shape={shape}
      shapeMode={mode}
      onShapeAction={handleShapeAction}
      liveShapeRef={shapeRef}
      fitGeometry={fitGeometry ?? null}
    />
  );
}

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

export function shapeToBoundary(shape: Shape): unknown {
  return shapeToGeoJSON(shape);
}
