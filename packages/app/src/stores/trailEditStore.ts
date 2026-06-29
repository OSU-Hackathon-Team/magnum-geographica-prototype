import { create } from "zustand";

export type EditorMode = "segments" | "trails";

export interface TrailEditorState {
  mode: EditorMode;
  snapEnabled: boolean;
  tracesVisible: boolean;
  isDirty: boolean;
  lastAutosave: number | null;

  setMode: (mode: EditorMode) => void;
  toggleSnap: () => void;
  toggleTraces: () => void;
  markDirty: () => void;
  markClean: () => void;
  touchAutosave: () => void;
}

export const useTrailEditStore = create<TrailEditorState>((set) => ({
  mode: "segments",
  snapEnabled: true,
  tracesVisible: true,
  isDirty: false,
  lastAutosave: null,

  setMode: (mode) => set({ mode }),
  toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),
  toggleTraces: () => set((s) => ({ tracesVisible: !s.tracesVisible })),
  markDirty: () => set({ isDirty: true }),
  markClean: () => set({ isDirty: false }),
  touchAutosave: () => set({ lastAutosave: Date.now() }),
}));
