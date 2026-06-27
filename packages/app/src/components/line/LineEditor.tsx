import { useCallback, useEffect, useRef, useState } from "react";
import { MapContainer, type MapContainerProps } from "@magnum/map";
import { type Shape, type PathAction, emptyPath, pathReducer } from "@magnum/shared";

export type LineMode = "add" | "delete";

export interface LineEditorProps {
  initial: Shape | null;
  mode: LineMode;
  mapConfig?: MapContainerProps["config"];
  onChange: (path: Shape) => void;
  fitGeometry?: unknown | null;
}

export function LineEditor({ initial, mode, onChange, mapConfig, fitGeometry }: LineEditorProps) {
  const [path, setPath] = useState<Shape>(() => initial ?? emptyPath());
  const pathRef = useRef(path);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    pathRef.current = path;
    onChangeRef.current(path);
  }, [path]);

  const handleLineAction = useCallback((action: PathAction) => {
    const next = pathReducer(pathRef.current, action);
    pathRef.current = next;
    setPath(next);
  }, []);

  return (
    <MapContainer
      config={mapConfig ?? {}}
      line={path}
      lineMode={mode}
      onLineAction={handleLineAction}
      liveLineRef={pathRef}
      fitGeometry={fitGeometry ?? null}
    />
  );
}

export function validateLine(
  path: Shape | null | undefined,
): { ok: boolean; error?: string } {
  if (!path) return { ok: false, error: "Draw at least one line segment." };
  const valid = path.rings.filter((r) => r.vertices.length >= 2);
  if (valid.length === 0) {
    return { ok: false, error: "Each segment needs at least 2 vertices." };
  }
  return { ok: true };
}
