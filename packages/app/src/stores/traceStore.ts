import { create } from "zustand";
import type { TraceSession } from "../services/offlineDataService";

export type TraceStatus = "idle" | "recording" | "paused" | "submitting";

export interface LivePoint {
  lon: number;
  lat: number;
  recorded_at: string;
  elevation?: number | null;
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
}

export interface LiveAnnotation {
  type: string;
  value: string | null;
  seq: number;
  lon: number;
  lat: number;
  captured_at: string;
}

export interface TraceState {
  status: TraceStatus;
  activeSessionId: string | null;
  startedAt: number | null;
  pausedAt: number | null;
  totalPausedMs: number;
  livePoints: LivePoint[];
  annotations: LiveAnnotation[];
  totalMeters: number;
  error: string | null;
  isPseudoActive: boolean;

  /**
   * Set on app launch when an unfinished session is found in SQLite.
   * The recovery modal reads this and the user decides what to do.
   */
  recoveryCandidate: TraceSession | null;

  setStatus: (status: TraceStatus) => void;
  beginSession: (session: TraceSession) => void;
  appendPoint: (point: LivePoint) => void;
  appendAnnotation: (annotation: LiveAnnotation) => void;
  setPaused: (paused: boolean) => void;
  endSession: () => void;
  setError: (msg: string | null) => void;
  setTotalMeters: (m: number) => void;
  setRecoveryCandidate: (session: TraceSession | null) => void;
  clearRecovery: () => void;
  setPseudoActive: (active: boolean) => void;
  /**
   * Drop live in-memory state without touching the SQLite session.
   * Used after the user explicitly discards or after a successful
   * submit (the session row stays in `submitted` for the recent list).
   */
  resetLive: () => void;
}

const EMPTY: Pick<
  TraceState,
  "activeSessionId" | "startedAt" | "pausedAt" | "totalPausedMs" | "livePoints" | "annotations" | "totalMeters" | "error"
> = {
  activeSessionId: null,
  startedAt: null,
  pausedAt: null,
  totalPausedMs: 0,
  livePoints: [],
  annotations: [],
  totalMeters: 0,
  error: null,
};

export const useTraceStore = create<TraceState>((set) => ({
  status: "idle",
  recoveryCandidate: null,
  isPseudoActive: false,
  ...EMPTY,

  setStatus: (status) => set({ status }),

  beginSession: (session) =>
    set({
      status: "recording",
      activeSessionId: session.id,
      startedAt: new Date(session.started_at).getTime(),
      pausedAt: null,
      totalPausedMs: 0,
      livePoints: [],
      annotations: [],
      totalMeters: 0,
      error: null,
      isPseudoActive: false,
    }),

  appendPoint: (point) =>
    set((s) => {
      // Cap the in-memory buffer to avoid blowing out memory on long
      // hikes. The SQLite table keeps every point; the live buffer
      // only needs enough to plot a smooth trail on the map preview.
      const next = s.livePoints.length >= 5_000 ? s.livePoints.slice(-4_999) : s.livePoints;
      return { livePoints: [...next, point] };
    }),

  appendAnnotation: (annotation) =>
    set((s) => ({ annotations: [...s.annotations, annotation] })),

  setPaused: (paused) =>
    set((s) => {
      if (paused) {
        if (s.status === "paused") return s;
        return { status: "paused", pausedAt: Date.now() };
      }
      if (s.status !== "paused") return s;
      const pausedFor = s.pausedAt ? Date.now() - s.pausedAt : 0;
      return {
        status: "recording",
        pausedAt: null,
        totalPausedMs: s.totalPausedMs + pausedFor,
      };
    }),

  endSession: () =>
    set({
      status: "idle",
      ...EMPTY,
    }),

  setError: (msg) => set({ error: msg }),
  setTotalMeters: (m) => set({ totalMeters: m }),

  setRecoveryCandidate: (session) => set({ recoveryCandidate: session }),
  clearRecovery: () => set({ recoveryCandidate: null }),
  setPseudoActive: (active) => set({ isPseudoActive: active }),

  resetLive: () => set({ ...EMPTY, status: "idle" }),
}));

/**
 * Elapsed-wall duration of the active session, accounting for paused
 * intervals. Pure function so component render doesn't need an effect
 * to derive the displayed duration.
 */
export function sessionElapsedMs(state: TraceState, now: number = Date.now()): number {
  if (state.status === "idle" || state.startedAt === null) return 0;
  const live = now - state.startedAt - state.totalPausedMs;
  if (state.status === "paused" && state.pausedAt) {
    return state.pausedAt - state.startedAt - state.totalPausedMs;
  }
  return live;
}
